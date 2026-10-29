import { Router } from "express";
import { db, flowsTable, flowRunsTable, flowRecipesTable, recipesTable, type Flow, type FlowGraph, type FlowRun } from "@workspace/db";
import { desc, eq, inArray } from "drizzle-orm";
import { CreateFlowBody, UpdateFlowBody } from "@workspace/api-zod";
import { parseIdParam } from "../lib/http";
import { relayConflicts, type FlowProblem } from "../lib/flows/graph";
import {
  validateFlow,
  flowRecipeLinks,
  relayOwners,
  reloadFlows,
  getFlowStatus,
  runScheduleFlow,
  problemsSummary,
} from "../services/flowEngine";

const router = Router();

/** Problems that stop a flow from being enabled, including relay conflicts. */
function problemsFor(flow: Pick<Flow, "id" | "graph">, linkedRecipes: number): { problems: FlowProblem[]; kind: "temperature" | "schedule" | null; relays: number[] } {
  const { problems, compiled } = validateFlow(flow.graph, linkedRecipes);
  if (!compiled) return { problems, kind: validateFlow(flow.graph).compiled?.kind ?? null, relays: [] };
  return { problems: relayConflicts(compiled, relayOwners(), flow.id), kind: compiled.kind, relays: compiled.relays };
}

async function recipeIdsOf(flowId: number): Promise<number[]> {
  return ((await flowRecipeLinks([flowId])).get(flowId) ?? []).map((r) => r.id);
}

/** Null if every id is a real recipe, else an error message. */
async function checkRecipeIds(ids: number[]): Promise<string | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return null;
  const found = await db.select({ id: recipesTable.id }).from(recipesTable).where(inArray(recipesTable.id, unique));
  return found.length === unique.length ? null : "One or more of those recipes doesn't exist";
}

/** Replace a flow's recipe links. */
async function setRecipeLinks(tx: Pick<typeof db, "delete" | "insert">, flowId: number, ids: number[]): Promise<void> {
  await tx.delete(flowRecipesTable).where(eq(flowRecipesTable.flowId, flowId));
  const unique = [...new Set(ids)];
  if (unique.length > 0) await tx.insert(flowRecipesTable).values(unique.map((recipeId) => ({ flowId, recipeId })));
}

async function latestRun(flowId: number): Promise<FlowRun | null> {
  const [run] = await db
    .select()
    .from(flowRunsTable)
    .where(eq(flowRunsTable.flowId, flowId))
    .orderBy(desc(flowRunsTable.startedAt))
    .limit(1);
  return run ?? null;
}

async function toApi(flow: Flow, recipeIds?: number[]) {
  const ids = recipeIds ?? (await recipeIdsOf(flow.id));
  const { problems, kind, relays } = problemsFor(flow, ids.length);
  return { ...flow, kind, problems, relayDeviceIds: relays, recipeIds: ids, lastRun: await latestRun(flow.id) };
}

async function findFlow(id: number): Promise<Flow | undefined> {
  const [flow] = await db.select().from(flowsTable).where(eq(flowsTable.id, id));
  return flow;
}

// ── GET /flows ─────────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const flows = await db.select().from(flowsTable).orderBy(flowsTable.name);
  const links = await flowRecipeLinks(flows.map((f) => f.id));
  res.json(await Promise.all(flows.map((f) => toApi(f, (links.get(f.id) ?? []).map((r) => r.id)))));
});

// ── POST /flows ────────────────────────────────────────────────────────────
// New flows start disabled, so a half-built graph can be saved and finished later.
router.post("/", async (req, res) => {
  const body = CreateFlowBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });
  const recipeIds = body.data.recipeIds ?? [];
  const bad = await checkRecipeIds(recipeIds);
  if (bad) return res.status(400).json({ error: bad });
  const flow = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(flowsTable)
      .values({
        name: body.data.name.trim(),
        description: body.data.description?.trim() || null,
        graph: body.data.graph as FlowGraph,
        enabled: false,
      })
      .returning();
    await setRecipeLinks(tx, row!.id, recipeIds);
    return row!;
  });
  return res.status(201).json(await toApi(flow));
});

// ── GET /flows/:id ─────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const flow = await findFlow(id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  return res.json(await toApi(flow));
});

// ── PUT /flows/:id ─────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const body = UpdateFlowBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body", problems: [] });
  const existing = await findFlow(id);
  if (!existing) return res.status(404).json({ error: "Flow not found" });

  const recipeIds = body.data.recipeIds;
  if (recipeIds) {
    const bad = await checkRecipeIds(recipeIds);
    if (bad) return res.status(400).json({ error: bad, problems: [] });
  }

  if ((body.data.graph || recipeIds) && existing.enabled) {
    // A running flow can't be swapped for a broken one; disable it to keep editing.
    const graph = (body.data.graph ?? existing.graph) as FlowGraph;
    const linked = recipeIds ? new Set(recipeIds).size : (await recipeIdsOf(id)).length;
    const { problems } = problemsFor({ id, graph }, linked);
    if (problems.length > 0) {
      return res.status(400).json({ error: `Can't save while the flow is on: ${problemsSummary(problems)}`, problems });
    }
  }

  const flow = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(flowsTable)
      .set({
        ...(body.data.name !== undefined && { name: body.data.name.trim() }),
        ...(body.data.description !== undefined && { description: body.data.description?.trim() || null }),
        ...(body.data.graph !== undefined && { graph: body.data.graph as FlowGraph, lastError: null }),
        updatedAt: new Date(),
      })
      .where(eq(flowsTable.id, id))
      .returning();
    if (recipeIds) await setRecipeLinks(tx, id, recipeIds);
    return row!;
  });
  if (flow.enabled) await reloadFlows();
  return res.json(await toApi(flow));
});

// ── DELETE /flows/:id ──────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const [deleted] = await db.delete(flowsTable).where(eq(flowsTable.id, id)).returning();
  if (deleted?.enabled) await reloadFlows();
  return res.status(204).end();
});

// ── POST /flows/:id/enable ─────────────────────────────────────────────────
router.post("/:id/enable", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const existing = await findFlow(id);
  if (!existing) return res.status(404).json({ error: "Flow not found" });

  const { problems } = problemsFor(existing, (await recipeIdsOf(id)).length);
  if (problems.length > 0) {
    return res.status(400).json({ error: `Fix these first: ${problemsSummary(problems)}`, problems });
  }
  const [flow] = await db
    .update(flowsTable)
    .set({ enabled: true, lastError: null, updatedAt: new Date() })
    .where(eq(flowsTable.id, id))
    .returning();
  await reloadFlows();
  await db.insert(flowRunsTable).values({ flowId: id, trigger: "system", status: "ok", message: "Flow turned on" });
  return res.json(await toApi(flow!));
});

// ── POST /flows/:id/disable ────────────────────────────────────────────────
router.post("/:id/disable", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const [flow] = await db
    .update(flowsTable)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(flowsTable.id, id))
    .returning();
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  await reloadFlows();
  await db.insert(flowRunsTable).values({ flowId: id, trigger: "system", status: "ok", message: "Flow turned off; its relays were switched off" });
  return res.json(await toApi(flow));
});

// ── POST /flows/:id/run ────────────────────────────────────────────────────
router.post("/:id/run", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const flow = await findFlow(id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  const s = getFlowStatus(id);
  if (!flow.enabled || s?.kind !== "schedule") {
    return res.status(400).json({ error: "Only an enabled schedule flow can be run by hand" });
  }
  // A run can include delays of many minutes, so don't hold the request open.
  runScheduleFlow(id, "manual").catch((err) => req.log.error({ err, flowId: id }, "Manual flow run failed"));
  return res.status(202).json({ ok: true, message: "Started" });
});

// ── GET /flows/:id/runs ────────────────────────────────────────────────────
router.get("/:id/runs", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const runs = await db
    .select()
    .from(flowRunsTable)
    .where(eq(flowRunsTable.flowId, id))
    .orderBy(desc(flowRunsTable.startedAt), desc(flowRunsTable.id))
    .limit(limit);
  return res.json(runs);
});

// ── GET /flows/:id/status ──────────────────────────────────────────────────
router.get("/:id/status", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const flow = await findFlow(id);
  if (!flow) return res.status(404).json({ error: "Flow not found" });
  const s = getFlowStatus(id);
  if (!s) {
    return res.json({
      flowId: id, running: false, kind: problemsFor(flow, 0).kind, lastTickAt: null, tempC: null,
      failsafe: null, waiting: false, standby: null, nextRunAt: null, nodes: {},
    });
  }
  return res.json({ ...s, running: true });
});

export default router;
