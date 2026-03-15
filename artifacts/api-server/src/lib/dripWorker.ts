import { db } from "@workspace/db";
import {
  dripEnrollmentsTable,
  dripSequencesTable,
  dripSequenceStepsTable,
  emailTemplatesTable,
  leadsTable,
  contactsTable,
  activitiesTable,
  settingsTable,
} from "@workspace/db";
import { eq, and, lte, isNull, sql } from "drizzle-orm";
import { sendGmailEmail } from "./gmail";
import { fireAndForgetActivitySync } from "./notionSync";

let isProcessing = false;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function replaceMergeTags(
  text: string,
  recipient: { name: string; company?: string | null },
  founderName: string,
  userSettings: Record<string, string> = {}
): string {
  const firstName = recipient.name.split(" ")[0];
  return text
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{company_name\}\}/g, recipient.company || "")
    .replace(/\{\{founder_name\}\}/g, founderName)
    .replace(/\{\{my_linkedin\}\}/g, userSettings.quick_link_my_linkedin || "")
    .replace(/\{\{company_linkedin\}\}/g, userSettings.quick_link_company_linkedin || "")
    .replace(/\{\{calendar_link\}\}/g, userSettings.quick_link_calendar || "")
    .replace(/\{\{custom_link_1\}\}/g, userSettings.quick_link_custom1_url || "")
    .replace(/\{\{custom_link_2\}\}/g, userSettings.quick_link_custom2_url || "")
    .replace(/\{\{custom_link_3\}\}/g, userSettings.quick_link_custom3_url || "");
}

async function getUserSettings(userId: string): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));
  const settings: Record<string, string> = {};
  for (const r of rows) {
    settings[r.key] = r.value;
  }
  return settings;
}

async function getSequenceOwnerId(sequenceId: number): Promise<string | null> {
  const [seq] = await db
    .select({ userId: dripSequencesTable.userId })
    .from(dripSequencesTable)
    .where(eq(dripSequencesTable.id, sequenceId));
  return seq?.userId || null;
}

async function tryLockEnrollment(enrollmentId: number): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS);

  const result = await db
    .update(dripEnrollmentsTable)
    .set({ lockedAt: now })
    .where(
      and(
        eq(dripEnrollmentsTable.id, enrollmentId),
        sql`(${dripEnrollmentsTable.lockedAt} IS NULL OR ${dripEnrollmentsTable.lockedAt} < ${staleThreshold})`
      )
    )
    .returning({ id: dripEnrollmentsTable.id });

  return result.length > 0;
}

async function unlockEnrollment(enrollmentId: number) {
  await db
    .update(dripEnrollmentsTable)
    .set({ lockedAt: null })
    .where(eq(dripEnrollmentsTable.id, enrollmentId));
}

async function processEnrollments() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const now = new Date();
    const dueEnrollments = await db
      .select()
      .from(dripEnrollmentsTable)
      .where(
        and(
          eq(dripEnrollmentsTable.status, "active"),
          lte(dripEnrollmentsTable.nextSendAt, now),
          sql`(${dripEnrollmentsTable.lockedAt} IS NULL OR ${dripEnrollmentsTable.lockedAt} < ${new Date(now.getTime() - LOCK_TIMEOUT_MS)})`
        )
      );

    if (dueEnrollments.length === 0) return;

    for (const enrollment of dueEnrollments) {
      const locked = await tryLockEnrollment(enrollment.id);
      if (!locked) continue;

      try {
        const ownerId = await getSequenceOwnerId(enrollment.sequenceId);
        if (!ownerId) {
          console.error(
            `Drip worker: sequence ${enrollment.sequenceId} has no owner for enrollment ${enrollment.id}`
          );
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "error", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        const userSettings = await getUserSettings(ownerId);
        const founderName = userSettings.founder_name || "";

        const steps = await db
          .select()
          .from(dripSequenceStepsTable)
          .where(eq(dripSequenceStepsTable.sequenceId, enrollment.sequenceId));

        const sortedSteps = steps.sort((a, b) => a.stepOrder - b.stepOrder);
        const currentStep = sortedSteps[enrollment.currentStep];

        if (!currentStep) {
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "completed", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        const [template] = await db
          .select()
          .from(emailTemplatesTable)
          .where(
            and(
              eq(emailTemplatesTable.id, currentStep.templateId),
              eq(emailTemplatesTable.userId, ownerId)
            )
          );

        if (!template) {
          console.error(
            `Drip worker: template ${currentStep.templateId} not found for enrollment ${enrollment.id}`
          );
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "error", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        let recipient: {
          name: string;
          email: string;
          company?: string | null;
        } | null = null;

        if (enrollment.leadId) {
          const [lead] = await db
            .select()
            .from(leadsTable)
            .where(
              and(
                eq(leadsTable.id, enrollment.leadId),
                eq(leadsTable.userId, ownerId)
              )
            );
          if (lead) recipient = { name: lead.name, email: lead.email };
        } else if (enrollment.contactId) {
          const [contact] = await db
            .select()
            .from(contactsTable)
            .where(
              and(
                eq(contactsTable.id, enrollment.contactId),
                eq(contactsTable.userId, ownerId)
              )
            );
          if (contact && contact.email)
            recipient = {
              name: contact.name,
              email: contact.email,
              company: contact.company,
            };
        }

        if (!recipient || !recipient.email) {
          console.error(
            `Drip worker: no valid recipient for enrollment ${enrollment.id}`
          );
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "error", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        const subject = replaceMergeTags(
          template.subject,
          recipient,
          founderName,
          userSettings
        );
        const body = replaceMergeTags(template.body, recipient, founderName, userSettings);

        await sendGmailEmail(recipient.email, subject, body);

        const nextStepIndex = enrollment.currentStep + 1;

        if (nextStepIndex >= sortedSteps.length) {
          await db
            .update(dripEnrollmentsTable)
            .set({ currentStep: nextStepIndex, status: "completed", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
        } else {
          const nextStep = sortedSteps[nextStepIndex];
          const nextSendAt = new Date(
            Date.now() + nextStep.delayDays * 24 * 60 * 60 * 1000
          );
          await db
            .update(dripEnrollmentsTable)
            .set({ currentStep: nextStepIndex, nextSendAt, lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
        }

        const [activity] = await db
          .insert(activitiesTable)
          .values({
            leadId: enrollment.leadId || null,
            contactId: enrollment.contactId || null,
            type: "email",
            direction: "sent",
            subject,
            body,
            userId: ownerId,
          })
          .returning();

        fireAndForgetActivitySync(activity);

        console.log(
          `Drip worker: sent step ${enrollment.currentStep + 1} to ${recipient.email} (enrollment ${enrollment.id})`
        );
      } catch (err) {
        console.error(
          `Drip worker: error processing enrollment ${enrollment.id}:`,
          err
        );
        try {
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "error", lockedAt: null })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
        } catch (dbErr) {
          console.error(`Drip worker: failed to mark enrollment ${enrollment.id} as error:`, dbErr);
        }
      }
    }
  } catch (err) {
    console.error("Drip worker: tick error:", err);
  } finally {
    isProcessing = false;
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startDripWorker() {
  if (intervalId) return;
  console.log("Drip worker started (60s interval)");
  processEnrollments();
  intervalId = setInterval(processEnrollments, 60_000);
}

export function stopDripWorker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("Drip worker stopped");
  }
}
