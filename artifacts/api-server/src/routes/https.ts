import { Router, type IRouter, type Response } from "express";
import { EnableHttpsBody } from "@workspace/api-zod";
import { validateEnableInput } from "../lib/httpsConfig";
import { getHttpsStatus, helperState, jobBlocker, startHttpsJob } from "../services/httpsSetup";

const router: IRouter = Router();

router.get("/admin/https", async (_req, res) => {
  return res.json(await getHttpsStatus());
});

/**
 * Sends the reason a job can't start and returns true, or returns false. The
 * helper check runs last: it spawns sudo, so only once nothing cheaper said no.
 * Without it a missing helper would start a job that just fails on sudo.
 */
async function refuseToStart(res: Response): Promise<boolean> {
  const blocker = jobBlocker();
  if (blocker) {
    res.status(blocker.status).json({ error: blocker.error });
    return true;
  }
  const helper = await helperState();
  if (helper !== "ok") {
    res.status(400).json({
      error: `The HTTPS helper is ${helper}. Run the one-time command shown in Settings → System → Integrations → HTTPS, then try again.`,
    });
    return true;
  }
  return false;
}

router.post("/admin/https/enable", async (req, res) => {
  const body = EnableHttpsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const checked = validateEnableInput(body.data);
  if (!checked.ok) return res.status(400).json({ error: checked.error });

  if (await refuseToStart(res)) return;

  startHttpsJob("enable", checked.value);
  req.log.info({ ip: checked.value.ip, names: checked.value.names }, "HTTPS enable requested");
  return res.status(202).json({ started: true });
});

router.post("/admin/https/disable", async (req, res) => {
  if (await refuseToStart(res)) return;

  startHttpsJob("disable");
  req.log.info("HTTPS disable requested");
  return res.status(202).json({ started: true });
});

export default router;
