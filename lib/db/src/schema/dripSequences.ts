import { index, pgTable, serial, integer, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";
import { contactsTable } from "./contacts";
import { emailTemplatesTable } from "./emailTemplates";

export const dripSequencesTable = pgTable("drip_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetAudience: text("target_audience").notNull().default("general"),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_drip_sequences_user_id").on(table.userId),
]);

export const dripSequenceStepsTable = pgTable("drip_sequence_steps", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => dripSequencesTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  templateId: integer("template_id").notNull().references(() => emailTemplatesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_drip_steps_sequence_id").on(table.sequenceId),
  index("idx_drip_steps_template_id").on(table.templateId),
]);

export const dripEnrollmentsTable = pgTable("drip_enrollments", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull().references(() => dripSequencesTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  contactId: integer("contact_id").references(() => contactsTable.id, { onDelete: "set null" }),
  currentStep: integer("current_step").notNull().default(0),
  status: text("status").notNull().default("active"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
}, (table) => [
  index("idx_drip_enrollments_sequence_id").on(table.sequenceId),
  index("idx_drip_enrollments_lead_id").on(table.leadId),
  index("idx_drip_enrollments_contact_id").on(table.contactId),
  index("idx_drip_enrollments_status_next").on(table.status, table.nextSendAt),
]);

export const insertDripSequenceSchema = createInsertSchema(dripSequencesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDripSequence = z.infer<typeof insertDripSequenceSchema>;
export type DripSequence = typeof dripSequencesTable.$inferSelect;

export const insertDripStepSchema = createInsertSchema(dripSequenceStepsTable).omit({ id: true, createdAt: true });
export type InsertDripStep = z.infer<typeof insertDripStepSchema>;
export type DripStep = typeof dripSequenceStepsTable.$inferSelect;

export const insertDripEnrollmentSchema = createInsertSchema(dripEnrollmentsTable).omit({ id: true, enrolledAt: true });
export type InsertDripEnrollment = z.infer<typeof insertDripEnrollmentSchema>;
export type DripEnrollment = typeof dripEnrollmentsTable.$inferSelect;
