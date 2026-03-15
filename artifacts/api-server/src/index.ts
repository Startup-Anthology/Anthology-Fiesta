import app from "./app";
import { seedDefaults } from "./lib/seed";
import { startDripWorker } from "./lib/dripWorker";
import { startInsightWorker } from "./lib/ai/insightWorker";
import { seedAgentRegistry } from "./lib/ai/agentDefinitions";
import { verifyModelAvailability } from "./lib/ai/orchestrator";

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

  startDripWorker();
  startInsightWorker();
});
