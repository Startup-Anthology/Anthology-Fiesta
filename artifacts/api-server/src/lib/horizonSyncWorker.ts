import { db, settingsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runHorizonSync } from "./horizonSync";
import { fireAndForgetSlackNotify } from "./slackNotify";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function isHorizonConfigured(): boolean {
  return !!(process.env.CRM_API_KEY && process.env.HORIZON_BASE_URL);
}

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

async function getTargetUserId(): Promise<string | null> {
  const configured = process.env.HORIZON_DEFAULT_USER_ID;
  if (configured) return configured;

  const [first] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .limit(1);
  return first?.id ?? null;
}

async function runAutoSync() {
  if (!isHorizonConfigured()) return;

  try {
    const userId = await getTargetUserId();
    if (!userId) return;

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

    console.log(`Horizon auto-sync: ${summary.leads.created} new leads, ${summary.contacts.created} new contacts`);
  } catch (err) {
    console.error("Horizon auto-sync error:", err);
  }
}

export function startHorizonSyncWorker() {
  if (!isHorizonConfigured()) {
    console.log("Horizon sync worker skipped (not configured)");
    return;
  }
  console.log("Horizon sync worker started (every 15 min)");
  // First run after 1 minute, then every 15 minutes
  setTimeout(() => {
    runAutoSync();
    setInterval(runAutoSync, SYNC_INTERVAL_MS);
  }, 60_000);
}
