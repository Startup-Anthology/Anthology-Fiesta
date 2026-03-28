import { db, settingsTable, leadsTable, contactsTable, activitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getNotesProvider } from "./integrations/registry";
import { fireAndForgetLeadSync, fireAndForgetContactSync, fireAndForgetActivitySync } from "./notionSync";

const RATE_LIMIT_DELAY = 350; // ~3 req/s for Notion API

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSettingForUser(key: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
  return row?.value || null;
}

export async function exportAllToNotion(userId: string): Promise<{
  leads: { synced: number; errors: number };
  contacts: { synced: number; errors: number };
  activities: { synced: number; errors: number };
}> {
  const provider = await getNotesProvider(userId);
  if (!provider) throw new Error("Notion is not connected");

  const leadsDbId = await getSettingForUser("notion_leads_db", userId);
  const contactsDbId = await getSettingForUser("notion_contacts_db", userId);
  const activitiesDbId = await getSettingForUser("notion_activities_db", userId);

  const result = {
    leads: { synced: 0, errors: 0 },
    contacts: { synced: 0, errors: 0 },
    activities: { synced: 0, errors: 0 },
  };

  // Export leads
  if (leadsDbId) {
    const leads = await db.select().from(leadsTable).where(eq(leadsTable.userId, userId));
    for (const lead of leads) {
      try {
        const pageId = await provider.syncLead(lead, leadsDbId);
        if (pageId && !lead.notionPageId) {
          await db.update(leadsTable).set({ notionPageId: pageId }).where(eq(leadsTable.id, lead.id));
        }
        result.leads.synced++;
        await delay(RATE_LIMIT_DELAY);
      } catch (err) {
        console.error(`Notion export error for lead ${lead.id}:`, err);
        result.leads.errors++;
      }
    }
  }

  // Export contacts
  if (contactsDbId) {
    const contacts = await db.select().from(contactsTable).where(eq(contactsTable.userId, userId));
    for (const contact of contacts) {
      try {
        const pageId = await provider.syncContact(contact, contactsDbId);
        if (pageId && !contact.notionPageId) {
          await db.update(contactsTable).set({ notionPageId: pageId }).where(eq(contactsTable.id, contact.id));
        }
        result.contacts.synced++;
        await delay(RATE_LIMIT_DELAY);
      } catch (err) {
        console.error(`Notion export error for contact ${contact.id}:`, err);
        result.contacts.errors++;
      }
    }
  }

  // Export activities
  if (activitiesDbId) {
    const activities = await db.select().from(activitiesTable).where(eq(activitiesTable.userId, userId));
    for (const activity of activities) {
      try {
        await provider.syncActivity(activity, activitiesDbId);
        result.activities.synced++;
        await delay(RATE_LIMIT_DELAY);
      } catch (err) {
        console.error(`Notion export error for activity ${activity.id}:`, err);
        result.activities.errors++;
      }
    }
  }

  return result;
}
