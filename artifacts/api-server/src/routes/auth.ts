import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, apiTokensTable } from "@workspace/db";
import {
  isAuthRequired,
  setAuthRequired,
  generateToken,
} from "../middlewares/apiAuth";

const router = Router();

// GET /api/admin/auth/status
router.get("/status", async (_req, res) => {
  const required = await isAuthRequired();
  const tokens = await db
    .select({
      id: apiTokensTable.id,
      name: apiTokensTable.name,
      prefix: apiTokensTable.prefix,
      createdAt: apiTokensTable.createdAt,
      lastUsedAt: apiTokensTable.lastUsedAt,
    })
    .from(apiTokensTable)
    .orderBy(desc(apiTokensTable.createdAt));
  res.json({ required, tokenCount: tokens.length, tokens });
});

// PUT /api/admin/auth/status   { required: boolean }
router.put("/status", async (req, res): Promise<void> => {
  const required = Boolean(req.body?.required);
  if (required) {
    const existing = await db.select({ id: apiTokensTable.id }).from(apiTokensTable).limit(1);
    if (existing.length === 0) {
      res.status(400).json({
        error: "Create at least one API token before enabling lockdown.",
      });
      return;
    }
  }
  await setAuthRequired(required);
  res.json({ required });
});

// POST /api/admin/auth/tokens   { name: string }
router.post("/tokens", async (req, res): Promise<void> => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) { res.status(400).json({ error: "Token name is required" }); return; }
  if (name.length > 80) { res.status(400).json({ error: "Name too long" }); return; }

  const { token, prefix, hash } = generateToken();
  const [row] = await db
    .insert(apiTokensTable)
    .values({ name, prefix, tokenHash: hash })
    .returning({
      id: apiTokensTable.id,
      name: apiTokensTable.name,
      prefix: apiTokensTable.prefix,
      createdAt: apiTokensTable.createdAt,
      lastUsedAt: apiTokensTable.lastUsedAt,
    });

  // Plaintext token is returned exactly once.
  res.status(201).json({ ...row, token });
});

// DELETE /api/admin/auth/tokens/:id
router.delete("/tokens/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(apiTokensTable).where(eq(apiTokensTable.id, id));

  // If no tokens remain, automatically disable lockdown so the user isn't
  // permanently locked out from external clients with no way back in.
  const remaining = await db.select({ id: apiTokensTable.id }).from(apiTokensTable).limit(1);
  if (remaining.length === 0 && (await isAuthRequired())) {
    await setAuthRequired(false);
  }

  res.status(204).send();
});

export default router;
