import { db, settingsTable, leadsTable, contactsTable, calendarEventsTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull, sql } from "drizzle-orm";
import { getMessagingProvider } from "./integrations/registry";

const DIGEST_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

async function getUsersWithDigestEnabled(): Promise<{ userId: string; channelId: string }[]> {
  const channelRows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, "slack_channel_id"));

  const results: { userId: string; channelId: string }[] = [];

  for (const row of channelRows) {
    if (!row.value || !row.userId) continue;

    // Check if digest is enabled for this user
    const [digestSetting] = await db
      .select()
      .from(settingsTable)
      .where(and(eq(settingsTable.key, "slack_digest_enabled"), eq(settingsTable.userId, row.userId)));

    if (digestSetting?.value === "true") {
      results.push({ userId: row.userId, channelId: row.value });
    }
  }

  return results;
}

async function shouldSendDigestNow(userId: string): Promise<boolean> {
  // Check configured digest hour (default 9am)
  const [timeSetting] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, "slack_digest_time"), eq(settingsTable.userId, userId)));

  const targetHour = timeSetting?.value ? parseInt(timeSetting.value, 10) : 9;
  const now = new Date();
  if (now.getUTCHours() !== targetHour) return false;

  // Check if digest was already sent today
  const [lastSent] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, "slack_digest_last_sent"), eq(settingsTable.userId, userId)));

  if (lastSent?.value) {
    const lastDate = new Date(lastSent.value);
    if (lastDate.toDateString() === now.toDateString()) return false;
  }

  return true;
}

async function buildDigestSummary(userId: string) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // New leads in last 24h
  const newLeads = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.userId, userId), gte(leadsTable.createdAt, yesterday)));

  // Pipeline counts by status
  const statusCounts = await db
    .select({ status: leadsTable.status, count: sql<number>`count(*)::int` })
    .from(leadsTable)
    .where(eq(leadsTable.userId, userId))
    .groupBy(leadsTable.status);

  const pipelineCounts: Record<string, number> = {};
  for (const row of statusCounts) {
    pipelineCounts[row.status] = row.count;
  }

  // Overdue follow-ups
  const overdueFollowUps = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.userId, userId), isNotNull(contactsTable.nextFollowUpAt), lte(contactsTable.nextFollowUpAt, now)));

  // Upcoming calendar events (next 7 days)
  const upcomingEvents = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.userId, userId), gte(calendarEventsTable.startTime, now), lte(calendarEventsTable.startTime, nextWeek)));

  return {
    newLeads: newLeads.length,
    pipelineCounts,
    overdueFollowUps: overdueFollowUps.length,
    upcomingEvents: upcomingEvents.length,
  };
}

async function markDigestSent(userId: string) {
  const now = new Date().toISOString();
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, "slack_digest_last_sent"), eq(settingsTable.userId, userId)));

  if (existing) {
    await db.update(settingsTable)
      .set({ value: now })
      .where(and(eq(settingsTable.key, "slack_digest_last_sent"), eq(settingsTable.userId, userId)));
  } else {
    await db.insert(settingsTable).values({ key: "slack_digest_last_sent", value: now, userId });
  }
}

async function runDigestCycle() {
  try {
    const users = await getUsersWithDigestEnabled();

    for (const { userId, channelId } of users) {
      try {
        if (!(await shouldSendDigestNow(userId))) continue;

        const provider = await getMessagingProvider(userId);
        if (!provider) continue;

        const summary = await buildDigestSummary(userId);
        await provider.postDigest(channelId, summary);
        await markDigestSent(userId);
        console.log(`Slack digest sent for user ${userId}`);
      } catch (err) {
        console.error(`Slack digest failed for user ${userId}:`, err);
      }
    }
  } catch (err) {
    console.error("Slack digest cycle error:", err);
  }
}

export function startSlackDigestWorker() {
  console.log("Slack digest worker started");
  // First run after 2 minutes, then check every hour
  setTimeout(() => {
    runDigestCycle();
    setInterval(runDigestCycle, DIGEST_INTERVAL_MS);
  }, 120_000);
}
