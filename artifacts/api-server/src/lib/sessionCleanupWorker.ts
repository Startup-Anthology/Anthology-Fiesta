import { db, sessionsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function cleanupExpiredSessions() {
  const now = new Date();
  const deleted = await db
    .delete(sessionsTable)
    .where(lt(sessionsTable.expire, now))
    .returning({ sid: sessionsTable.sid });
  if (deleted.length > 0) {
    console.log(`[session-cleanup] Removed ${deleted.length} expired sessions`);
  }
}

export function startSessionCleanupWorker() {
  if (intervalId) return;
  console.log("Session cleanup worker started (daily interval)");
  cleanupExpiredSessions().catch((err) => {
    console.error("[session-cleanup] initial run failed:", err);
  });
  intervalId = setInterval(() => {
    cleanupExpiredSessions().catch((err) => {
      console.error("[session-cleanup] run failed:", err);
    });
  }, ONE_DAY_MS);
}

export function stopSessionCleanupWorker() {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}

