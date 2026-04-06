import { db, settingsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runSASync, isSAConfigured } from "./saSync";
import { fireAndForgetSlackNotify } from "./slackNotify";

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

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
  const configured = process.env.SA_DEFAULT_USER_ID;
  if (configured) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, configured))
      .limit(1);
    if (!user) {
      console.error(`SA_DEFAULT_USER_ID "${configured}" not found in users table`);
      return null;
    }
    return user.id;
  }

  const [first] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .limit(1);
  return first?.id ?? null;
}

async function getLastSyncAt(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, "sa_last_sync_at"), eq(settingsTable.userId, userId)));
  return row?.value;
}

async function runAutoSync() {
  if (!isSAConfigured()) return;

  try {
    const userId = await getTargetUserId();
    if (!userId) return;

    const since = await getLastSyncAt(userId);
    const summary = await runSASync(userId, since);

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

    console.log(`SA auto-sync: ${summary.leads.created} new leads, ${summary.leads.updated} updated leads`);
  } catch (err) {
    console.error("SA auto-sync error:", err);
  }
}

export function startSASyncWorker() {
  if (!isSAConfigured()) {
    console.log("SA sync worker skipped (not configured)");
    return;
  }
  console.log("SA sync worker started (every 15 min)");
  // First run after 90s (staggered from Horizon's 60s), then every 15 minutes
  setTimeout(() => {
    runAutoSync();
    setInterval(runAutoSync, SYNC_INTERVAL_MS);
  }, 90_000);
}
