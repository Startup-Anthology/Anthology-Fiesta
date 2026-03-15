import { db } from "@workspace/db";
import { settingsTable, leadsTable, contactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { syncLeadToNotion, syncContactToNotion, syncActivityToNotion } from "./notion";

async function getNotionDbIdForUser(key: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const rows = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
  return rows[0]?.value || null;
}

export function fireAndForgetLeadSync(lead: any) {
  const userId = lead.userId;
  if (!userId) return;
  getNotionDbIdForUser("notion_leads_db", userId).then(async (dbId) => {
    if (!dbId) return;
    try {
      const pageId = await syncLeadToNotion(lead, dbId);
      if (pageId && !lead.notionPageId) {
        await db.update(leadsTable).set({ notionPageId: pageId }).where(eq(leadsTable.id, lead.id));
      }
    } catch (err) {
      console.error("Notion lead sync failed:", err);
    }
  }).catch((err) => console.error("Notion settings lookup failed:", err));
}

export function fireAndForgetContactSync(contact: any) {
  const userId = contact.userId;
  if (!userId) return;
  getNotionDbIdForUser("notion_contacts_db", userId).then(async (dbId) => {
    if (!dbId) return;
    try {
      const pageId = await syncContactToNotion(contact, dbId);
      if (pageId && !contact.notionPageId) {
        await db.update(contactsTable).set({ notionPageId: pageId }).where(eq(contactsTable.id, contact.id));
      }
    } catch (err) {
      console.error("Notion contact sync failed:", err);
    }
  }).catch((err) => console.error("Notion settings lookup failed:", err));
}

export function fireAndForgetActivitySync(activity: any) {
  const userId = activity.userId;
  if (!userId) return;
  getNotionDbIdForUser("notion_activities_db", userId).then(async (dbId) => {
    if (!dbId) return;
    try {
      await syncActivityToNotion(activity, dbId);
    } catch (err) {
      console.error("Notion activity sync failed:", err);
    }
  }).catch((err) => console.error("Notion settings lookup failed:", err));
}
