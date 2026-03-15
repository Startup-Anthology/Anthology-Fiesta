import { z } from "zod";

export const createLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  source: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
  isBeta: z.boolean().optional(),
  notionPageId: z.string().nullish(),
});

export const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  source: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
  isBeta: z.boolean().optional(),
  notionPageId: z.string().nullish(),
});

export const createContactSchema = z.object({
  name: z.string().min(1),
  company: z.string().nullish(),
  title: z.string().nullish(),
  relationshipType: z.string().optional(),
  priority: z.string().optional(),
  linkedinUrl: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
  lastContactedAt: z.string().nullish(),
  nextFollowUpAt: z.string().nullish(),
  notionPageId: z.string().nullish(),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  company: z.string().nullish(),
  title: z.string().nullish(),
  relationshipType: z.string().optional(),
  priority: z.string().optional(),
  linkedinUrl: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
  lastContactedAt: z.string().nullish(),
  nextFollowUpAt: z.string().nullish(),
  notionPageId: z.string().nullish(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1),
  audience: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  audience: z.string().optional(),
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export const createSequenceSchema = z.object({
  name: z.string().min(1),
  targetAudience: z.string().optional(),
});

export const updateSequenceSchema = z.object({
  name: z.string().min(1).optional(),
  targetAudience: z.string().optional(),
});

export const createStepSchema = z.object({
  stepOrder: z.number().int().min(0),
  delayDays: z.number().int().min(0).optional(),
  templateId: z.number().int().positive(),
});

export const createTriggerSchema = z.object({
  triggerStatus: z.string().min(1),
  actionType: z.string().min(1),
  sequenceId: z.number().int().positive().nullish(),
  followUpDays: z.number().int().positive().nullish(),
});

export const createActivitySchema = z.object({
  leadId: z.number().int().positive().nullish(),
  contactId: z.number().int().positive().nullish(),
  type: z.string().min(1),
  direction: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  note: z.string().nullish(),
  gmailMessageId: z.string().nullish(),
  gmailThreadId: z.string().nullish(),
  gmailLink: z.string().nullish(),
});

export const updateActivitySchema = z.object({
  type: z.string().min(1).optional(),
  direction: z.string().nullish(),
  subject: z.string().nullish(),
  body: z.string().nullish(),
  note: z.string().nullish(),
});

export const updateCalendarEventSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  eventType: z.string().optional(),
});

export const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  leadId: z.number().int().positive().nullish(),
  contactId: z.number().int().positive().nullish(),
  addToCalendar: z.boolean().optional(),
  attachmentFileIds: z.array(z.number().int().positive()).optional(),
});

export const createBroadcastSchema = z.object({
  subject: z.string().min(1),
  templateId: z.number().int().positive().nullish(),
  leadStatuses: z.array(z.string().min(1)).optional().default([]),
  contactTypes: z.array(z.string().min(1)).optional().default([]),
}).refine(
  (data) => data.leadStatuses.length > 0 || data.contactTypes.length > 0,
  { message: "At least one lead status or contact type must be selected" }
);

export const createCalendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  leadId: z.number().int().positive().nullish(),
  contactId: z.number().int().positive().nullish(),
  eventType: z.string().optional(),
});

export const updateStatusSchema = z.object({
  status: z.string().min(1),
});

export const horizonLeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  status: z.string().optional(),
  notes: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  profilePictureUrl: z.string().nullish(),
  isBeta: z.boolean().optional(),
});

export const horizonContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullish(),
  company: z.string().nullish(),
  message: z.string().nullish(),
  notes: z.string().nullish(),
});

export class ValidationError extends Error {
  public statusCode = 400;
  constructor(issues: string) {
    super(`Validation failed: ${issues}`);
    this.name = "ValidationError";
  }
}

export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new ValidationError(issues);
  }
  return result.data;
}
