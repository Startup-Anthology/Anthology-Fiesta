import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { activitiesTable, calendarEventsTable, filesTable } from "@workspace/db";
import { sendGmailEmail, type EmailAttachment } from "../lib/gmail";
import { fireAndForgetActivitySync } from "../lib/notionSync";
import { createCalendarEvent } from "../lib/calendar";
import { ObjectStorageService } from "../lib/objectStorage";
import { inArray, eq, and } from "drizzle-orm";
import { validate, sendEmailSchema } from "../lib/validation";

const router = Router();
const objectStorageService = new ObjectStorageService();

router.post("/email/send", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { to, subject, body, leadId, contactId, addToCalendar, attachmentFileIds } = validate(sendEmailSchema, req.body);

    const attachments: EmailAttachment[] = [];
    if (attachmentFileIds && attachmentFileIds.length > 0) {
      const files = await db.select().from(filesTable).where(and(inArray(filesTable.id, attachmentFileIds), eq(filesTable.userId, userId)));
      for (const file of files) {
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(file.storageKey);
          const response = await objectStorageService.downloadObject(objectFile);
          const arrayBuffer = await response.arrayBuffer();
          attachments.push({
            filename: file.name,
            mimeType: file.mimeType,
            content: Buffer.from(arrayBuffer),
          });
        } catch (loadErr: any) {
          console.error(`Failed to load attachment ${file.name}:`, loadErr.message);
        }
      }
    }

    let sendResult;
    try {
      sendResult = await sendGmailEmail(to, subject, body, attachments);
    } catch (gmailErr: any) {
      const msg = gmailErr.message || "";
      if (msg.includes("access") || msg.includes("token") || msg.includes("credentials") || msg.includes("refresh")) {
        res.status(503).json({ error: "Gmail is not connected. Please configure Gmail integration in your Replit workspace." });
        return;
      }
      throw gmailErr;
    }

    const [activity] = await db.insert(activitiesTable).values({
      leadId: leadId || null,
      contactId: contactId || null,
      type: "email",
      direction: "sent",
      subject,
      body,
      gmailMessageId: sendResult.messageId,
      gmailThreadId: sendResult.threadId,
      gmailLink: sendResult.gmailLink,
      userId,
    }).returning();

    fireAndForgetActivitySync(activity);

    if (addToCalendar) {
      const now = new Date();
      const endTime = new Date(now.getTime() + 5 * 60000);
      let googleEventId: string | null = null;
      try {
        googleEventId = await createCalendarEvent({
          title: `Email sent: ${subject}`,
          description: `Sent to ${to}`,
          startTime: now.toISOString(),
          endTime: endTime.toISOString(),
        });
      } catch (calErr: any) {
        console.error("Google Calendar sync failed for email event:", calErr.message);
      }
      await db.insert(calendarEventsTable).values({
        googleEventId,
        title: `Email sent: ${subject}`,
        description: `Sent to ${to}`,
        startTime: now,
        endTime: endTime,
        leadId: leadId || null,
        contactId: contactId || null,
        eventType: "email",
        userId,
      });
    }

    res.json({ success: true, gmailLink: sendResult.gmailLink });
  } catch (err) {
    next(err);
  }
});

export default router;
