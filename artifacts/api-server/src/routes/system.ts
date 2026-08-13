import { Router } from "express";
import { asc, gte } from "drizzle-orm";
import { db, systemHealthSamplesTable } from "@workspace/db";
import { GetSystemHealthHistoryQueryParams } from "@workspace/api-zod";
import { getSystemStats } from "../services/systemStats.js";

const router = Router();

router.get("/system/stats", async (req, res) => {
  return res.json(await getSystemStats());
});

router.get("/system/health-history", async (req, res) => {
  const query = GetSystemHealthHistoryQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query parameters" });

  const cutoff = new Date(Date.now() - query.data.hours * 60 * 60 * 1000);
  const samples = await db
    .select()
    .from(systemHealthSamplesTable)
    .where(gte(systemHealthSamplesTable.sampledAt, cutoff))
    .orderBy(asc(systemHealthSamplesTable.sampledAt));

  return res.json(samples);
});

export default router;
