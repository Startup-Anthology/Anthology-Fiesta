import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { broadcastsTable, leadsTable, contactsTable, emailTemplatesTable, activitiesTable, settingsTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { sendGmailEmail } from "../lib/gmail";
import { fireAndForgetActivitySync } from "../lib/notionSync";
import { logAudit } from "../lib/audit";
import { validate, createBroadcastSchema } from "../lib/validation";

const router = Router();

router.get("/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const results = await db.select().from(broadcastsTable).where(eq(broadcastsTable.userId, req.user!.id)).orderBy(sql`${broadcastsTable.createdAt} desc`);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get("/broadcast-preview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadStatusesRaw = req.query.leadStatuses as string | undefined;
    const contactTypesRaw = req.query.contactTypes as string | undefined;
    const leadStatuses = leadStatusesRaw ? leadStatusesRaw.split(",").filter(Boolean) : [];
    const contactTypes = contactTypesRaw ? contactTypesRaw.split(",").filter(Boolean) : [];

    const recipients: { name: string; email: string }[] = [];

    if (leadStatuses.length > 0) {
      const leads = await db.select().from(leadsTable).where(and(inArray(leadsTable.status, leadStatuses), eq(leadsTable.userId, userId)));
      recipients.push(...leads.map((l) => ({ name: l.name, email: l.email })));
    }
    if (contactTypes.length > 0) {
      const contacts = await db.select().from(contactsTable).where(and(inArray(contactsTable.relationshipType, contactTypes), eq(contactsTable.userId, userId)));
      recipients.push(...contacts.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email! })));
    }

    const uniqueRecipients = Array.from(new Map(recipients.map((r) => [r.email, r])).values());
    res.json({ count: uniqueRecipients.length, recipients: uniqueRecipients });
  } catch (err) {
    next(err);
  }
});

router.post("/broadcasts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { subject, templateId, leadStatuses, contactTypes } = validate(createBroadcastSchema, req.body);

    let recipients: { name: string; email: string; id: number; isLead: boolean; company?: string | null }[] = [];
    if (leadStatuses.length > 0) {
      const leads = await db.select().from(leadsTable).where(and(inArray(leadsTable.status, leadStatuses), eq(leadsTable.userId, userId)));
      recipients.push(...leads.map((l) => ({ name: l.name, email: l.email, id: l.id, isLead: true })));
    }
    if (contactTypes.length > 0) {
      const contacts = await db.select().from(contactsTable).where(and(inArray(contactsTable.relationshipType, contactTypes), eq(contactsTable.userId, userId)));
      recipients.push(...contacts.filter((c) => c.email).map((c) => ({ name: c.name, email: c.email!, id: c.id, isLead: false, company: c.company })));
    }
    const seenEmails = new Set<string>();
    recipients = recipients.filter((r) => {
      if (seenEmails.has(r.email)) return false;
      seenEmails.add(r.email);
      return true;
    });

    const segmentType = [
      ...(leadStatuses.length > 0 ? ["lead_status"] : []),
      ...(contactTypes.length > 0 ? ["contact_type"] : []),
    ].join(",") || "none";
    const segmentValue = JSON.stringify({ leadStatuses, contactTypes });

    let template: { subject: string; body: string } | null = null;
    if (templateId) {
      const [t] = await db.select().from(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, templateId), eq(emailTemplatesTable.userId, userId)));
      if (t) template = t;
    }

    const settingsRows = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
    const userSettings: Record<string, string> = {};
    for (const r of settingsRows) {
      userSettings[r.key] = r.value;
    }
    const founderName = userSettings.founder_name || "";

    const [broadcast] = await db.insert(broadcastsTable).values({
      subject: template?.subject || subject,
      templateId: templateId || null,
      segmentType,
      segmentValue,
      recipientCount: recipients.length,
      status: "sending",
      userId,
    }).returning();
    logAudit("broadcast", broadcast.id, "create", userId, null, broadcast as Record<string, unknown>);

    let sentCount = 0;
    for (const recipient of recipients) {
      try {
        let emailSubject = template?.subject || subject;
        let emailBody = template?.body || subject;
        const firstName = recipient.name.split(" ")[0];
        emailSubject = emailSubject
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{company_name\}\}/g, recipient.company || "")
          .replace(/\{\{founder_name\}\}/g, founderName)
          .replace(/\{\{my_linkedin\}\}/g, userSettings.quick_link_my_linkedin || "")
          .replace(/\{\{company_linkedin\}\}/g, userSettings.quick_link_company_linkedin || "")
          .replace(/\{\{calendar_link\}\}/g, userSettings.quick_link_calendar || "")
          .replace(/\{\{custom_link_1\}\}/g, userSettings.quick_link_custom1_url || "")
          .replace(/\{\{custom_link_2\}\}/g, userSettings.quick_link_custom2_url || "")
          .replace(/\{\{custom_link_3\}\}/g, userSettings.quick_link_custom3_url || "");
        emailBody = emailBody
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{company_name\}\}/g, recipient.company || "")
          .replace(/\{\{founder_name\}\}/g, founderName)
          .replace(/\{\{my_linkedin\}\}/g, userSettings.quick_link_my_linkedin || "")
          .replace(/\{\{company_linkedin\}\}/g, userSettings.quick_link_company_linkedin || "")
          .replace(/\{\{calendar_link\}\}/g, userSettings.quick_link_calendar || "")
          .replace(/\{\{custom_link_1\}\}/g, userSettings.quick_link_custom1_url || "")
          .replace(/\{\{custom_link_2\}\}/g, userSettings.quick_link_custom2_url || "")
          .replace(/\{\{custom_link_3\}\}/g, userSettings.quick_link_custom3_url || "");

        await sendGmailEmail(recipient.email, emailSubject, emailBody);
        sentCount++;

        const [activity] = await db.insert(activitiesTable).values({
          leadId: recipient.isLead ? recipient.id : null,
          contactId: !recipient.isLead ? recipient.id : null,
          type: "email",
          direction: "sent",
          subject: emailSubject,
          body: emailBody,
          userId,
        }).returning();

        fireAndForgetActivitySync(activity);
      } catch (sendErr) {
        console.error(`Failed to send to ${recipient.email}:`, sendErr);
      }
    }

    const [updatedBroadcast] = await db.update(broadcastsTable).set({
      status: "sent",
      sentAt: new Date(),
      recipientCount: sentCount,
    }).where(eq(broadcastsTable.id, broadcast.id)).returning();
    logAudit("broadcast", broadcast.id, "update", userId, broadcast as Record<string, unknown>, updatedBroadcast as Record<string, unknown>);

    res.status(201).json(updatedBroadcast);
  } catch (err) {
    next(err);
  }
});

export default router;
