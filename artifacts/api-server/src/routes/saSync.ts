import { Router, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runSASync, isSAConfigured } from "../lib/saSync";
import { fireAndForgetSlackNotify } from "../lib/slackNotify";

const router = Router();

async function upsertSetting(key: string, value: string, userId: string) {
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));

  if (existing) {
    await db.update(settingsTable).set({ value }).where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
  } else {
    await db.insert(settingsTable).values({ key, value, userId });
  }
}

router.get("/sa/status", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const configured = isSAConfigured();

  const settingKeys = [
    "sa_last_sync_at",
    "sa_last_sync_leads_created",
    "sa_last_sync_leads_updated",
    "sa_last_sync_contacts_created",
    "sa_last_sync_contacts_updated",
  ];

  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));

  const settingsMap: Record<string, string> = {};
  for (const row of rows) {
    if (settingKeys.includes(row.key)) {
      settingsMap[row.key] = row.value;
    }
  }

  res.json({
    configured,
    lastSyncAt: settingsMap.sa_last_sync_at || null,
    lastSyncLeadsCreated: parseInt(settingsMap.sa_last_sync_leads_created || "0", 10),
    lastSyncLeadsUpdated: parseInt(settingsMap.sa_last_sync_leads_updated || "0", 10),
    lastSyncContactsCreated: parseInt(settingsMap.sa_last_sync_contacts_created || "0", 10),
    lastSyncContactsUpdated: parseInt(settingsMap.sa_last_sync_contacts_updated || "0", 10),
  });
});

router.post("/sa/sync", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const summary = await runSASync(userId);

    const now = new Date().toISOString();
    await upsertSetting("sa_last_sync_at", now, userId);
    await upsertSetting("sa_last_sync_leads_created", String(summary.leads.created), userId);
    await upsertSetting("sa_last_sync_leads_updated", String(summary.leads.updated), userId);

    if (summary.leads.created > 0) {
      fireAndForgetSlackNotify(userId, "sa_sync", {
        leadsCreated: summary.leads.created,
        leadsUpdated: summary.leads.updated,
      });
    }

    res.json(summary);
  } catch (err: any) {
    console.error("SA sync error:", err.message);
    const msg = err.message || "Internal server error";
    if (msg.includes("not configured")) {
      res.status(503).json({ error: msg });
    } else if (msg.includes("authentication failed (401)")) {
      res.status(502).json({ error: msg });
    } else if (msg.includes("rate limited (429)")) {
      res.status(429).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
