import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { activitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getGmailHistory, getGmailMessage, setupGmailWatch, getGmailProfile } from "../lib/gmail";

const router = Router();

let lastHistoryId: string | null = null;

router.post("/gmail/webhook", async (req: Request, res: Response) => {
  try {
    res.status(200).send();

    const message = req.body?.message;
    if (!message?.data) return;

    const decoded = JSON.parse(Buffer.from(message.data, "base64").toString());
    const historyId = decoded.historyId;

    if (!lastHistoryId || !historyId) {
      lastHistoryId = historyId;
      return;
    }

    const history = await getGmailHistory(lastHistoryId);
    lastHistoryId = historyId;

    if (!history?.history) return;

    const trackedThreads = await db.select({
      gmailThreadId: activitiesTable.gmailThreadId,
      leadId: activitiesTable.leadId,
      contactId: activitiesTable.contactId,
      userId: activitiesTable.userId,
    }).from(activitiesTable)
      .where(eq(activitiesTable.type, "email"));

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
        if (!tracked) continue;

        const existing = await db.select().from(activitiesTable)
          .where(eq(activitiesTable.gmailMessageId, msgMeta.id));
        if (existing.length > 0) continue;

        try {
          const fullMsg = await getGmailMessage(msgMeta.id);
          const headers = fullMsg.payload?.headers || [];
          const fromHeader = headers.find((h: any) => h.name === "From")?.value || "Unknown";
          const subjectHeader = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
          const dateHeader = headers.find((h: any) => h.name === "Date")?.value;
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
            userId: tracked.userId,
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

router.post("/gmail/watch", async (req: Request, res: Response) => {
  try {
    const { topicName } = req.body;
    if (!topicName) {
      return res.status(400).json({ error: "topicName is required" });
    }
    const result = await setupGmailWatch(topicName);
    lastHistoryId = String(result.historyId || "");
    res.json({ success: true, expiration: result.expiration });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/gmail/profile", async (req: Request, res: Response) => {
  try {
    const profile = await getGmailProfile();
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
