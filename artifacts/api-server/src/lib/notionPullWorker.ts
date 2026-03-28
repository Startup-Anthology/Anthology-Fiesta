import { db, settingsTable, leadsTable, contactsTable, activitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getNotesProvider } from "./integrations/registry";

const PULL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTION_RATE_LIMIT_DELAY = 350; // ~3 req/s

async function getSettingForUser(key: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
  return row?.value || null;
}

async function upsertSetting(key: string, value: string, userId: string) {
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));

  if (existing) {
    await db.update(settingsTable).set({ value }).where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
  } else {
    await db.insert(settingsTable).values({ key, value, userId });
  }
}

async function getUsersWithNotionSync(): Promise<string[]> {
  const rows = await db
    .select({ userId: settingsTable.userId })
    .from(settingsTable)
    .where(eq(settingsTable.key, "notion_leads_db"));

  return rows.filter((r) => r.userId).map((r) => r.userId!);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryNotionDatabase(
  accessToken: string,
  databaseId: string,
  lastSyncTime: string | null,
): Promise<any[]> {
  const body: any = { page_size: 100 };
  if (lastSyncTime) {
    body.filter = {
      timestamp: "last_edited_time",
      last_edited_time: { after: lastSyncTime },
    };
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Notion query error ${res.status}: ${text}`);
    return [];
  }

  const data = await res.json() as { results?: unknown[] };
  return data.results || [];
}

function extractNotionTitle(properties: any, key: string): string {
  const prop = properties[key];
  if (prop?.title?.[0]?.text?.content) return prop.title[0].text.content;
  return "";
}

function extractNotionEmail(properties: any, key: string): string | null {
  return properties[key]?.email || null;
}

function extractNotionSelect(properties: any, key: string): string | null {
  return properties[key]?.select?.name || null;
}

function extractNotionCheckbox(properties: any, key: string): boolean {
  return properties[key]?.checkbox ?? false;
}

function extractNotionRichText(properties: any, key: string): string | null {
  const prop = properties[key];
  if (prop?.rich_text?.[0]?.text?.content) return prop.rich_text[0].text.content;
  return null;
}

async function pullLeadsFromNotion(userId: string, databaseId: string, accessToken: string, lastSync: string | null) {
  const pages = await queryNotionDatabase(accessToken, databaseId, lastSync);

  for (const page of pages) {
    try {
      const notionPageId = page.id;
      const props = page.properties;
      const name = extractNotionTitle(props, "Name");
      if (!name) continue;

      const email = extractNotionEmail(props, "Email");
      const status = extractNotionSelect(props, "Status") || "new";
      const source = extractNotionSelect(props, "Source") || "notion";
      const isBeta = extractNotionCheckbox(props, "Is Beta");

      // Find existing record by notionPageId
      const [existing] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.notionPageId, notionPageId), eq(leadsTable.userId, userId)));

      if (existing) {
        // Last-write-wins: check if Notion edit is newer
        const notionEdited = new Date(page.last_edited_time);
        const crmUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
        if (notionEdited > crmUpdated) {
          await db.update(leadsTable)
            .set({ name, email: email ?? undefined, status, source, isBeta, updatedAt: new Date() })
            .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.userId, userId)));
        }
      } else if (email) {
        // Check by email to avoid duplicates
        const [byEmail] = await db
          .select()
          .from(leadsTable)
          .where(and(eq(leadsTable.email, email), eq(leadsTable.userId, userId)));

        if (byEmail) {
          await db.update(leadsTable)
            .set({ notionPageId, name, status, source, isBeta, updatedAt: new Date() })
            .where(and(eq(leadsTable.id, byEmail.id), eq(leadsTable.userId, userId)));
        } else {
          await db.insert(leadsTable).values({
            name, email, status, source, isBeta, notionPageId, userId,
          });
        }
      }

      await delay(NOTION_RATE_LIMIT_DELAY);
    } catch (err) {
      console.error(`Notion lead pull error for page ${page.id}:`, err);
    }
  }
}

async function pullContactsFromNotion(userId: string, databaseId: string, accessToken: string, lastSync: string | null) {
  const pages = await queryNotionDatabase(accessToken, databaseId, lastSync);

  for (const page of pages) {
    try {
      const notionPageId = page.id;
      const props = page.properties;
      const name = extractNotionTitle(props, "Name");
      if (!name) continue;

      const email = extractNotionEmail(props, "Email");
      const relationshipType = extractNotionSelect(props, "Type") || "other";
      const priority = extractNotionSelect(props, "Priority") || "medium";
      const company = extractNotionRichText(props, "Company");

      const [existing] = await db
        .select()
        .from(contactsTable)
        .where(and(eq(contactsTable.notionPageId, notionPageId), eq(contactsTable.userId, userId)));

      if (existing) {
        const notionEdited = new Date(page.last_edited_time);
        const crmUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
        if (notionEdited > crmUpdated) {
          await db.update(contactsTable)
            .set({ name, email, relationshipType, priority, company, updatedAt: new Date() })
            .where(and(eq(contactsTable.id, existing.id), eq(contactsTable.userId, userId)));
        }
      } else if (email) {
        const [byEmail] = await db
          .select()
          .from(contactsTable)
          .where(and(eq(contactsTable.email, email), eq(contactsTable.userId, userId)));

        if (byEmail) {
          await db.update(contactsTable)
            .set({ notionPageId, name, relationshipType, priority, company, updatedAt: new Date() })
            .where(and(eq(contactsTable.id, byEmail.id), eq(contactsTable.userId, userId)));
        } else {
          await db.insert(contactsTable).values({
            name, email, relationshipType, priority, company, notionPageId, userId,
          });
        }
      }

      await delay(NOTION_RATE_LIMIT_DELAY);
    } catch (err) {
      console.error(`Notion contact pull error for page ${page.id}:`, err);
    }
  }
}

async function pullActivitiesFromNotion(userId: string, databaseId: string, accessToken: string, lastSync: string | null) {
  const pages = await queryNotionDatabase(accessToken, databaseId, lastSync);

  for (const page of pages) {
    try {
      const notionPageId = page.id;
      const props = page.properties;
      const type = extractNotionTitle(props, "Type");
      if (!type) continue;

      const direction = extractNotionSelect(props, "Direction");
      const subject = extractNotionRichText(props, "Subject");
      const note = extractNotionRichText(props, "Note");

      const [existing] = await db
        .select()
        .from(activitiesTable)
        .where(and(eq(activitiesTable.notionPageId, notionPageId), eq(activitiesTable.userId, userId)));

      if (!existing) {
        await db.insert(activitiesTable).values({
          type, direction, subject, note, notionPageId, userId,
        });
      }

      await delay(NOTION_RATE_LIMIT_DELAY);
    } catch (err) {
      console.error(`Notion activity pull error for page ${page.id}:`, err);
    }
  }
}

async function runNotionPullCycle() {
  try {
    const userIds = await getUsersWithNotionSync();

    for (const userId of userIds) {
      try {
        const provider = await getNotesProvider(userId);
        if (!provider) continue;

        // Get the raw access token for direct API calls
        const { getIntegration, getTokens } = await import("./integrations/tokenManager");
        const integration = await getIntegration(userId, "notion");
        if (!integration) continue;
        const tokens = await getTokens(integration.id);
        if (!tokens?.accessToken) continue;

        const lastSync = await getSettingForUser("last_notion_pull_at", userId);

        const leadsDbId = await getSettingForUser("notion_leads_db", userId);
        const contactsDbId = await getSettingForUser("notion_contacts_db", userId);
        const activitiesDbId = await getSettingForUser("notion_activities_db", userId);

        if (leadsDbId) await pullLeadsFromNotion(userId, leadsDbId, tokens.accessToken, lastSync);
        if (contactsDbId) await pullContactsFromNotion(userId, contactsDbId, tokens.accessToken, lastSync);
        if (activitiesDbId) await pullActivitiesFromNotion(userId, activitiesDbId, tokens.accessToken, lastSync);

        await upsertSetting("last_notion_pull_at", new Date().toISOString(), userId);
      } catch (err) {
        console.error(`Notion pull failed for user ${userId}:`, err);
      }
    }
  } catch (err) {
    console.error("Notion pull cycle error:", err);
  }
}

export function startNotionPullWorker() {
  console.log("Notion pull worker started");
  // First run after 3 minutes, then every 5 minutes
  setTimeout(() => {
    runNotionPullCycle();
    setInterval(runNotionPullCycle, PULL_INTERVAL_MS);
  }, 180_000);
}
