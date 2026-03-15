import { index, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const contactsTable = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  title: text("title"),
  relationshipType: text("relationship_type").notNull().default("other"),
  priority: text("priority").notNull().default("medium"),
  linkedinUrl: text("linkedin_url"),
  profilePictureUrl: text("profile_picture_url"),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
  notionPageId: text("notion_page_id"),
  userId: varchar("user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_contacts_user_id").on(table.userId),
  index("idx_contacts_email").on(table.email),
  index("idx_contacts_relationship_type").on(table.relationshipType),
]);

export const insertContactSchema = createInsertSchema(contactsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
