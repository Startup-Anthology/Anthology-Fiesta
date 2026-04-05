import app from "./app";
import { seedDefaults, seedAdmin } from "./lib/seed";
import { startDripWorker } from "./lib/dripWorker";
import { startInsightWorker } from "./lib/ai/insightWorker";
import { startSlackDigestWorker } from "./lib/slackDigestWorker";
import { startNotionPullWorker } from "./lib/notionPullWorker";
import { startHorizonSyncWorker } from "./lib/horizonSyncWorker";
import { startSASyncWorker } from "./lib/saSyncWorker";
import { startSessionCleanupWorker } from "./lib/sessionCleanupWorker";
import { seedAgentRegistry } from "./lib/ai/agentDefinitions";
import { verifyModelAvailability } from "./lib/ai/orchestrator";

function startWorkerSafely(name: string, start: () => void) {
  try {
    start();
  } catch (err) {
    console.error(`[worker] Failed to start ${name}:`, err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    await seedAdmin();
  } catch (err) {
    console.error("Admin seed error:", err);
  }

  try {
    await seedDefaults();
  } catch (err) {
    console.error("Seed error:", err);
  }

  try {
    await seedAgentRegistry();
    console.log("Agent registry seeded");
  } catch (err) {
    console.error("Agent registry seed error:", err);
  }

  verifyModelAvailability().then((available) => {
    if (available) {
      console.log("AI model availability verified");
    } else {
      console.warn("AI model availability check failed — AI features may not work");
    }
  });

  if (!process.env.GMAIL_WEBHOOK_AUDIENCE && !process.env.API_BASE_URL) {
    console.warn("Gmail webhook: GMAIL_WEBHOOK_AUDIENCE/API_BASE_URL not set; webhook token verification will fail with 401.");
  }

  startWorkerSafely("drip", startDripWorker);
  startWorkerSafely("insight", startInsightWorker);
  startWorkerSafely("slackDigest", startSlackDigestWorker);
  startWorkerSafely("notionPull", startNotionPullWorker);
  startWorkerSafely("horizonSync", startHorizonSyncWorker);
  startWorkerSafely("saSync", startSASyncWorker);
  startWorkerSafely("sessionCleanup", startSessionCleanupWorker);
});
