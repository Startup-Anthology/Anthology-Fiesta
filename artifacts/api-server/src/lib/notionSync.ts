import { db } from "@workspace/db";
import { settingsTable, leadsTable, contactsTable, activitiesTable, leadFilesTable, filesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getNotesProvider } from "./integrations/registry";
import { ObjectStorageService } from "./objectStorage";

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
  Promise.all([
    getNotionDbIdForUser("notion_leads_db", userId),
    getNotesProvider(userId),
  ]).then(async ([dbId, provider]) => {
    if (!dbId || !provider) return;
    try {
      // Enrich lead with activity summary
      const activities = await db
        .select({ type: activitiesTable.type, subject: activitiesTable.subject, direction: activitiesTable.direction, createdAt: activitiesTable.createdAt })
        .from(activitiesTable)
        .where(and(eq(activitiesTable.leadId, lead.id), eq(activitiesTable.userId, lead.userId)))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(10);

      if (activities.length > 0) {
        lead._activitySummary = activities.map((a) => {
          const date = a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : "unknown";
          const dir = a.direction ? ` (${a.direction})` : "";
          const subj = a.subject ? ` - ${a.subject}` : "";
          return `${date}: ${a.type}${dir}${subj}`;
        }).join("\n").slice(0, 2000);
      }

      // Enrich lead with file URLs
      const leadFiles = await db
        .select({ name: filesTable.name, storageKey: filesTable.storageKey })
        .from(leadFilesTable)
        .innerJoin(filesTable, eq(leadFilesTable.fileId, filesTable.id))
        .where(eq(leadFilesTable.leadId, lead.id));

      if (leadFiles.length > 0) {
        const storage = new ObjectStorageService();
        const fileUrls: { name: string; url: string }[] = [];
        for (const f of leadFiles) {
          try {
            const url = await storage.getSignedDownloadUrl(`/objects/${f.storageKey}`, 604800);
            fileUrls.push({ name: f.name, url });
          } catch {
            // Skip files that can't be signed (e.g. missing from storage)
          }
        }
        if (fileUrls.length > 0) lead._fileUrls = fileUrls;
      }

      const pageId = await provider.syncLead(lead, dbId);
      if (pageId && !lead.notionPageId) {
        await db.update(leadsTable).set({ notionPageId: pageId }).where(eq(leadsTable.id, lead.id));
      }
    } catch (err) {
      console.error("Notion lead sync failed:", err);
    }
  }).catch((err) => console.error("Notion lead sync setup failed:", err));
}

export function fireAndForgetContactSync(contact: any) {
  const userId = contact.userId;
  if (!userId) return;
  Promise.all([
    getNotionDbIdForUser("notion_contacts_db", userId),
    getNotesProvider(userId),
  ]).then(async ([dbId, provider]) => {
    if (!dbId || !provider) return;
    try {
      const pageId = await provider.syncContact(contact, dbId);
      if (pageId && !contact.notionPageId) {
        await db.update(contactsTable).set({ notionPageId: pageId }).where(eq(contactsTable.id, contact.id));
      }
    } catch (err) {
      console.error("Notion contact sync failed:", err);
    }
  }).catch((err) => console.error("Notion contact sync setup failed:", err));
}

export function fireAndForgetActivitySync(activity: any) {
  const userId = activity.userId;
  if (!userId) return;
  Promise.all([
    getNotionDbIdForUser("notion_activities_db", userId),
    getNotesProvider(userId),
  ]).then(async ([dbId, provider]) => {
    if (!dbId || !provider) return;
    try {
      await provider.syncActivity(activity, dbId);
    } catch (err) {
      console.error("Notion activity sync failed:", err);
    }
  }).catch((err) => console.error("Notion activity sync setup failed:", err));
}
