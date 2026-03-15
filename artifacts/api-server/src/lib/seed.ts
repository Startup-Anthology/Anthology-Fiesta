import { db } from "@workspace/db";
import { settingsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const DEFAULT_SETTINGS: Record<string, string> = {
  beta_slots_total: "100",
  app_name: "Fiesta",
  founder_name: "",
  notion_leads_db: "",
  notion_contacts_db: "",
  notion_activities_db: "",
};

export async function seedDefaultSettings(userId: string) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db.select().from(settingsTable).where(and(eq(settingsTable.key, key), eq(settingsTable.userId, userId)));
    if (existing.length === 0) {
      await db.insert(settingsTable).values({ key, value, userId });
    }
  }
}

export async function seedDefaults() {
  const users = await db.select().from(usersTable);

  for (const user of users) {
    await seedDefaultSettings(user.id);
  }

  console.log("Default settings seeded");
}
