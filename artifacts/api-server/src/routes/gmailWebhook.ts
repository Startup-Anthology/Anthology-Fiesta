import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { activitiesTable, usersTable, userIntegrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { getGmailHistory, getGmailMessage, setupGmailWatch, getGmailProfile } from "../lib/gmail";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();
const googleAuthClient = new OAuth2Client();

function getWebhookAudience(): string {
  if (process.env.GMAIL_WEBHOOK_AUDIENCE) return process.env.GMAIL_WEBHOOK_AUDIENCE;
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) return `${apiBase}/api/gmail/webhook`;
  return "";
}

const WEBHOOK_AUDIENCE = getWebhookAudience();

async function verifyPubSubToken(req: Request): Promise<boolean> {
  if (!WEBHOOK_AUDIENCE) return false;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  try {
    await googleAuthClient.verifyIdToken({ idToken: token, audience: WEBHOOK_AUDIENCE });
    return true;
  } catch {
    return false;
  }
}

async function getUserGmailHistoryId(userId: string): Promise<string | null> {
  const [integration] = await db.select({ metadata: userIntegrationsTable.metadata })
    .from(userIntegrationsTable)
    .where(and(eq(userIntegrationsTable.userId, userId), eq(userIntegrationsTable.provider, "gmail")));
  return (integration?.metadata as any)?.lastHistoryId ?? null;
}

async function setUserGmailHistoryId(userId: string, historyId: string): Promise<void> {
  const [existing] = await db.select({ metadata: userIntegrationsTable.metadata })
    .from(userIntegrationsTable)
    .where(and(eq(userIntegrationsTable.userId, userId), eq(userIntegrationsTable.provider, "gmail")));
  if (!existing) return;
  const updated = { ...(existing.metadata as Record<string, unknown> ?? {}), lastHistoryId: historyId };
  await db.update(userIntegrationsTable)
    .set({ metadata: updated })
    .where(and(eq(userIntegrationsTable.userId, userId), eq(userIntegrationsTable.provider, "gmail")));
}

router.post("/gmail/webhook", async (req: Request, res: Response) => {
  try {
    const isValid = await verifyPubSubToken(req);
    if (!isValid) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.status(200).send();

    const message = req.body?.message;
    if (!message?.data) return;

    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString());
    const historyId = decoded.historyId;
    const emailAddress = decoded.emailAddress;

    if (!emailAddress || !historyId) return;

    // Find the user whose Gmail account triggered this webhook
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, emailAddress));
    if (!user) return;

    const webhookUserId = user.id;
    const lastHistoryId = await getUserGmailHistoryId(webhookUserId);

    if (!lastHistoryId) {
      await setUserGmailHistoryId(webhookUserId, historyId);
      return;
    }

    const history = await getGmailHistory(lastHistoryId, webhookUserId);
    await setUserGmailHistoryId(webhookUserId, historyId);

    if (!history?.history) return;

    // Scope tracked threads to this user only
    const trackedThreads = await db.select({
      gmailThreadId: activitiesTable.gmailThreadId,
      leadId: activitiesTable.leadId,
      contactId: activitiesTable.contactId,
      userId: activitiesTable.userId,
    }).from(activitiesTable)
      .where(and(eq(activitiesTable.type, "email"), eq(activitiesTable.userId, webhookUserId)));

    const threadMap = new Map<string, { leadId: number | null; contactId: number | null; userId: string | null }>();
    for (const t of trackedThreads) {
      if (t.gmailThreadId) threadMap.set(t.gmailThreadId, { leadId: t.leadId, contactId: t.contactId, userId: t.userId });
    }

    for (const h of history.history) {
      const addedMessages = h.messagesAdded || [];
      for (const added of addedMessages) {
        const msgMeta = added.message;
        if (!msgMeta?.id || !msgMeta?.threadId) continue;

        const tracked = threadMap.get(msgMeta.threadId);
        if (!tracked || !tracked.userId) continue;
        const trackedUserId = tracked.userId;

        const existing = await db.select().from(activitiesTable)
          .where(eq(activitiesTable.gmailMessageId, msgMeta.id));
        if (existing.length > 0) continue;

        try {
          const fullMsg = await getGmailMessage(msgMeta.id, trackedUserId);
          const headers = fullMsg.payload?.headers || [];
          const fromHeader = headers.find((h: any) => h.name === "From")?.value || "Unknown";
          const subjectHeader = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
          const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${msgMeta.id}`;

          await db.insert(activitiesTable).values({
            leadId: tracked.leadId,
            contactId: tracked.contactId,
            type: "email",
            direction: "received",
            subject: subjectHeader,
            note: `From: ${fromHeader}`,
            gmailMessageId: msgMeta.id,
            gmailThreadId: msgMeta.threadId,
            gmailLink,
            userId: trackedUserId,
          });
        } catch (err: any) {
          console.error("Failed to process tracked reply:", err.message);
        }
      }
    }
  } catch (err: any) {
    console.error("Gmail webhook error:", err.message);
  }
});

router.post("/gmail/watch", requireAuth, async (req: Request, res: Response) => {
  try {
    const { topicName } = req.body;
    if (!topicName) {
      res.status(400).json({ error: "topicName is required" });
      return;
    }
    const userId = req.user!.id;
    const result = await setupGmailWatch(topicName, userId);
    if (result.historyId) {
      await setUserGmailHistoryId(userId, String(result.historyId));
    }
    res.json({ success: true, expiration: result.expiration });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/gmail/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const profile = await getGmailProfile(req.user!.id);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
