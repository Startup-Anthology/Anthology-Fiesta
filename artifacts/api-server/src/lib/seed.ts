import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { settingsTable, usersTable, userCredentialsTable } from "@workspace/db";
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

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (existing) {
    // Ensure role is admin even if user already exists
    if (existing.role !== "admin") {
      await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, existing.id));
      console.log(`Admin role granted to existing user: ${normalizedEmail}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, role: "admin" })
    .returning();

  await db.insert(userCredentialsTable).values({ userId: user.id, passwordHash });
  await seedDefaultSettings(user.id);

  console.log(`Admin user seeded: ${normalizedEmail}`);
}

export async function seedDefaults() {
  const users = await db.select().from(usersTable);

  for (const user of users) {
    await seedDefaultSettings(user.id);
  }

  console.log("Default settings seeded");
}
