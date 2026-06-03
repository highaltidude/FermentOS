import { Router } from "express";
import os from "os";
import fs from "fs";
import { execSync } from "child_process";

const router = Router();

const IS_DOCKER = fs.existsSync("/.dockerenv");

function readProcStat(): { total: number; idle: number } | null {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0];
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] ?? 0);
    const total = parts.reduce((s, v) => s + v, 0);
    return { total, idle };
  } catch {
    return null;
  }
}

function readNetDev(): Record<string, { rx: number; tx: number }> {
  const result: Record<string, { rx: number; tx: number }> = {};
  try {
    const lines = fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [iface, ...vals] = trimmed.split(/\s+/);
      const name = iface.replace(":", "");
      if (name === "lo") continue;
      result[name] = { rx: Number(vals[0]), tx: Number(vals[8]) };
    }
  } catch {
    // not on Linux — return empty
  }
  return result;
}

function getDiskStats(): { totalGB: number; usedGB: number; freeGB: number; usedPercent: number } | null {
  try {
    const output = execSync("df -B1 /", { timeout: 3000 }).toString();
    const parts = output.split("\n")[1].trim().split(/\s+/);
    const total = Number(parts[1]);
    const used = Number(parts[2]);
    const free = Number(parts[3]);
    const toGB = (b: number) => Math.round((b / 1e9) * 10) / 10;
    return {
      totalGB: toGB(total),
      usedGB: toGB(used),
      freeGB: toGB(free),
      usedPercent: Math.round((used / total) * 100),
    };
  } catch {
    return null;
  }
}

router.get("/system/stats", async (req, res) => {
  const s1 = readProcStat();
  const net1 = readNetDev();
  const t0 = Date.now();

  await new Promise((r) => setTimeout(r, 400));

  const s2 = readProcStat();
  const net2 = readNetDev();
  const elapsed = (Date.now() - t0) / 1000;

  let cpuPercent: number | null = null;
  if (s1 && s2) {
    const dTotal = s2.total - s1.total;
    const dIdle = s2.idle - s1.idle;
    cpuPercent = dTotal > 0 ? Math.round(((dTotal - dIdle) / dTotal) * 100) : 0;
  }

  const netInterfaces = Object.entries(net2).map(([name, v2]) => {
    const v1 = net1[name];
    return {
      name,
      rxBytes: v2.rx,
      txBytes: v2.tx,
      rxBytesPerSec: v1 ? Math.round((v2.rx - v1.rx) / elapsed) : 0,
      txBytesPerSec: v1 ? Math.round((v2.tx - v1.tx) / elapsed) : 0,
    };
  });

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const cpus = os.cpus();

  let temperatureCelsius: number | null = null;
  try {
    const raw = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8");
    const milli = parseInt(raw.trim(), 10);
    if (Number.isFinite(milli)) temperatureCelsius = Math.round(milli / 10) / 100;
  } catch { /* not available on this platform */ }

  let containerMemoryLimitMB: number | null = null;
  if (IS_DOCKER) {
    try {
      const raw = fs.readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
      if (raw !== "max") {
        const bytes = parseInt(raw, 10);
        if (Number.isFinite(bytes)) containerMemoryLimitMB = Math.round(bytes / 1024 / 1024);
      }
    } catch {
      try {
        const raw = fs.readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
        const bytes = parseInt(raw, 10);
        if (Number.isFinite(bytes) && bytes < 9e18) {
          containerMemoryLimitMB = Math.round(bytes / 1024 / 1024);
        }
      } catch { /* no cgroup limit set */ }
    }
  }

  return res.json({
    hostname: os.hostname(),
    uptime: Math.floor(os.uptime()),
    loadAvg: os.loadavg(),
    cpu: {
      model: cpus[0]?.model?.trim() ?? "Unknown",
      cores: cpus.length,
      usagePercent: cpuPercent,
    },
    memory: {
      totalMB: Math.round(totalMem / 1e6),
      usedMB: Math.round(usedMem / 1e6),
      freeMB: Math.round(freeMem / 1e6),
      usedPercent: Math.round((usedMem / totalMem) * 100),
    },
    disk: getDiskStats(),
    network: netInterfaces,
    temperatureCelsius,
    containerMemoryLimitMB,
    isDocker: IS_DOCKER,
  });
});

export default router;
