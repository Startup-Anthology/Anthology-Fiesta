import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { conversations, messages, aiInsightsTable, onboardingProgressTable } from "@workspace/db";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { processChat, processChatSync, getOnboardingGreeting } from "../lib/ai/orchestrator";
import { generateInsightsForUser } from "../lib/ai/insightWorker";

const router = Router();

router.post("/ai/chat", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { message, conversationId } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    let convId = conversationId ? Number(conversationId) : null;

    if (convId !== null && (isNaN(convId) || convId <= 0)) {
      res.status(400).json({ error: "Invalid conversationId" });
      return;
    }

    if (!convId) {
      const title = message.substring(0, 100);
      const [conv] = await db.insert(conversations).values({
        userId,
        title,
        agentsInvolved: "coach",
      }).returning();
      convId = conv.id;

      res.setHeader("X-Conversation-Id", String(convId));
    }

    const conv = await db.select().from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));

    if (conv.length === 0) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await processChat(convId, message, userId, res);
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      console.error("AI chat stream error:", err);
      try {
        res.write(`data: ${JSON.stringify({ error: "An error occurred" })}\n\n`);
        res.end();
      } catch {}
    }
  }
});

router.post("/ai/chat/sync", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { message, conversationId } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "message is required" });
      return;
    }

    let convId = conversationId ? Number(conversationId) : null;

    if (convId !== null && (isNaN(convId) || convId <= 0)) {
      res.status(400).json({ error: "Invalid conversationId" });
      return;
    }

    if (!convId) {
      const title = message.substring(0, 100);
      const [conv] = await db.insert(conversations).values({
        userId,
        title,
        agentsInvolved: "coach",
      }).returning();
      convId = conv.id;
    }

    const conv = await db.select().from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));

    if (conv.length === 0) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const content = await processChatSync(convId, message, userId);
    res.setHeader("X-Conversation-Id", String(convId));
    res.json({ content, conversationId: convId });
  } catch (err) {
    next(err);
  }
});

router.get("/ai/conversations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const convs = await db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));

    res.json(convs);
  } catch (err) {
    next(err);
  }
});

router.get("/ai/conversations/:id/messages", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const convId = Number(req.params.id);

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const msgs = await db.select().from(messages)
      .where(and(
        eq(messages.conversationId, convId),
        or(
          eq(messages.role, "user"),
          eq(messages.sourceAgent, "coach"),
        ),
      ))
      .orderBy(messages.createdAt);

    res.json(msgs);
  } catch (err) {
    next(err);
  }
});

router.delete("/ai/conversations/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const convId = Number(req.params.id);

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));

    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await db.delete(conversations).where(eq(conversations.id, convId));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get("/ai/insights", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { leadId, contactId, status } = req.query;

    const conditions = [eq(aiInsightsTable.userId, userId)];

    if (status && typeof status === "string") {
      conditions.push(eq(aiInsightsTable.status, status));
    } else {
      conditions.push(eq(aiInsightsTable.status, "active"));
    }

    if (leadId) {
      conditions.push(eq(aiInsightsTable.leadId, Number(leadId)));
    }
    if (contactId) {
      conditions.push(eq(aiInsightsTable.contactId, Number(contactId)));
    }

    const insights = await db.select().from(aiInsightsTable)
      .where(and(...conditions))
      .orderBy(desc(aiInsightsTable.createdAt));

    res.json(insights);
  } catch (err) {
    next(err);
  }
});

router.patch("/ai/insights/:id/dismiss", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const insightId = Number(req.params.id);

    const [insight] = await db.select().from(aiInsightsTable)
      .where(and(eq(aiInsightsTable.id, insightId), eq(aiInsightsTable.userId, userId)));

    if (!insight) {
      res.status(404).json({ error: "Insight not found" });
      return;
    }

    await db.update(aiInsightsTable)
      .set({ status: "dismissed", dismissedAt: new Date() })
      .where(eq(aiInsightsTable.id, insightId));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/ai/onboarding-greeting", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const greeting = await getOnboardingGreeting(userId);
    res.json({ greeting, isNewUser: greeting.length > 0 });
  } catch (err) {
    next(err);
  }
});

router.post("/ai/onboarding-progress", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { topic } = req.body;

    if (!topic) {
      res.status(400).json({ error: "topic is required" });
      return;
    }

    await db.insert(onboardingProgressTable).values({ userId, topic });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

const insightCooldowns = new Map<string, number>();
const INSIGHT_COOLDOWN_MS = 5 * 60 * 1000;

router.post("/ai/generate-insights", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const lastRun = insightCooldowns.get(userId) || 0;
    const now = Date.now();
    if (now - lastRun < INSIGHT_COOLDOWN_MS) {
      const waitSecs = Math.ceil((INSIGHT_COOLDOWN_MS - (now - lastRun)) / 1000);
      res.status(429).json({ error: `Please wait ${waitSecs}s before generating insights again` });
      return;
    }
    insightCooldowns.set(userId, now);
    const count = await generateInsightsForUser(userId);
    res.json({ success: true, insightsGenerated: count });
  } catch (err) {
    next(err);
  }
});

export default router;
