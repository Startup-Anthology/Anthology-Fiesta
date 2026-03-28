import { Router, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runHorizonSync } from "../lib/horizonSync";
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

router.get("/horizon/status", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const configured = !!(process.env.CRM_API_KEY && process.env.HORIZON_BASE_URL);

  const settingKeys = [
    "horizon_last_sync_at",
    "horizon_last_sync_leads_created",
    "horizon_last_sync_leads_updated",
    "horizon_last_sync_contacts_created",
    "horizon_last_sync_contacts_updated",
  ];

  const rows = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.userId, userId)));

  const settingsMap: Record<string, string> = {};
  for (const row of rows) {
    if (settingKeys.includes(row.key)) {
      settingsMap[row.key] = row.value;
    }
  }

  res.json({
    configured,
    lastSyncAt: settingsMap.horizon_last_sync_at || null,
    lastSyncLeadsCreated: parseInt(settingsMap.horizon_last_sync_leads_created || "0", 10),
    lastSyncLeadsUpdated: parseInt(settingsMap.horizon_last_sync_leads_updated || "0", 10),
    lastSyncContactsCreated: parseInt(settingsMap.horizon_last_sync_contacts_created || "0", 10),
    lastSyncContactsUpdated: parseInt(settingsMap.horizon_last_sync_contacts_updated || "0", 10),
  });
});

router.post("/horizon/sync", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const summary = await runHorizonSync(userId);

    // Save sync metadata
    const now = new Date().toISOString();
    await upsertSetting("horizon_last_sync_at", now, userId);
    await upsertSetting("horizon_last_sync_leads_created", String(summary.leads.created), userId);
    await upsertSetting("horizon_last_sync_leads_updated", String(summary.leads.updated), userId);
    await upsertSetting("horizon_last_sync_contacts_created", String(summary.contacts.created), userId);
    await upsertSetting("horizon_last_sync_contacts_updated", String(summary.contacts.updated), userId);

    const totalNew = summary.leads.created + summary.contacts.created;
    if (totalNew > 0) {
      fireAndForgetSlackNotify(userId, "horizon_sync", {
        leadsCreated: summary.leads.created,
        leadsUpdated: summary.leads.updated,
        contactsCreated: summary.contacts.created,
        contactsUpdated: summary.contacts.updated,
      });
    }

    res.json(summary);
  } catch (err: any) {
    console.error("Horizon sync error:", err.message);
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
