import { db } from "@workspace/db";
import { leadsTable, contactsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fireAndForgetLeadSync, fireAndForgetContactSync } from "./notionSync";
import { logAudit } from "./audit";

interface HorizonUser {
  id: string;
  fullName: string;
  email: string;
  isBetaUser: boolean;
  effectivePlanTier: string;
  hasForecasterPro: boolean;
  status: string;
  createdAt: string;
}

interface HorizonContact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

interface SyncSummary {
  leads: { created: number; updated: number; errors: string[] };
  contacts: { created: number; updated: number; errors: string[] };
}

function getHorizonConfig() {
  const apiKey = process.env.CRM_API_KEY;
  const baseUrl = process.env.HORIZON_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("Horizon sync not configured: CRM_API_KEY and HORIZON_BASE_URL are required");
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
}

export async function fetchHorizonUsers(): Promise<HorizonUser[]> {
  const { apiKey, baseUrl } = getHorizonConfig();
  const res = await fetch(`${baseUrl}/api/crm/users`, {
    headers: { "X-CRM-API-KEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Horizon API authentication failed (401)");
    if (res.status === 429) throw new Error("Horizon API rate limited (429). Try again later.");
    throw new Error(`Horizon users API error ${res.status}: ${text || "Unknown error"}`);
  }
  return res.json();
}

export async function fetchHorizonContacts(): Promise<HorizonContact[]> {
  const { apiKey, baseUrl } = getHorizonConfig();
  const res = await fetch(`${baseUrl}/api/crm/contacts`, {
    headers: { "X-CRM-API-KEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Horizon API authentication failed (401)");
    if (res.status === 429) throw new Error("Horizon API rate limited (429). Try again later.");
    throw new Error(`Horizon contacts API error ${res.status}: ${text || "Unknown error"}`);
  }
  return res.json();
}

async function getDefaultUserId(): Promise<string | null> {
  const configured = process.env.HORIZON_DEFAULT_USER_ID;
  if (configured) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, configured))
      .limit(1);
    return user?.id ?? null;
  }
  const [first] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .limit(1);
  return first?.id ?? null;
}

function buildUserNotes(user: HorizonUser): string {
  const parts: string[] = [];
  parts.push(`Plan: ${user.effectivePlanTier}`);
  if (user.hasForecasterPro) parts.push("Forecaster Pro: Yes");
  parts.push(`Account status: ${user.status}`);
  return parts.join(" | ");
}

export async function upsertHorizonUsers(users: HorizonUser[], assignToUserId?: string): Promise<{ created: number; updated: number; errors: string[] }> {
  const userId = assignToUserId || await getDefaultUserId();
  if (!userId) {
    throw new Error("No active user found to assign leads");
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const horizonUser of users) {
    try {
      if (!horizonUser.email) {
        errors.push(`Skipped user ${horizonUser.id}: no email`);
        continue;
      }

      const notes = buildUserNotes(horizonUser);

      const [existing] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.email, horizonUser.email), eq(leadsTable.userId, userId)))
        .limit(1);

      if (existing) {
        const [updatedLead] = await db
          .update(leadsTable)
          .set({
            name: horizonUser.fullName,
            notes,
            isBeta: horizonUser.isBetaUser,
            source: "horizon",
            updatedAt: new Date(),
          })
          .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.userId, userId)))
          .returning();
        logAudit("lead", existing.id, "update", userId, existing as Record<string, unknown>, updatedLead as Record<string, unknown>);
        fireAndForgetLeadSync(updatedLead);
        updated++;
      } else {
        const [lead] = await db
          .insert(leadsTable)
          .values({
            name: horizonUser.fullName,
            email: horizonUser.email,
            source: "horizon",
            status: "new",
            notes,
            isBeta: horizonUser.isBetaUser,
            userId,
          })
          .returning();
        logAudit("lead", lead.id, "create", userId, null, lead as Record<string, unknown>);
        fireAndForgetLeadSync(lead);
        created++;
      }
    } catch (err: any) {
      errors.push(`User ${horizonUser.email || horizonUser.id}: ${err.message}`);
    }
  }

  return { created, updated, errors };
}

export async function upsertHorizonContacts(contacts: HorizonContact[], assignToUserId?: string): Promise<{ created: number; updated: number; errors: string[] }> {
  const userId = assignToUserId || await getDefaultUserId();
  if (!userId) {
    throw new Error("No active user found to assign contacts");
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const horizonContact of contacts) {
    try {
      if (!horizonContact.email) {
        errors.push(`Skipped contact ${horizonContact.id}: no email`);
        continue;
      }

      const combinedNotes = [
        horizonContact.subject ? `Subject: ${horizonContact.subject}` : null,
        horizonContact.message,
      ].filter(Boolean).join("\n") || null;

      const [existing] = await db
        .select()
        .from(contactsTable)
        .where(and(eq(contactsTable.email, horizonContact.email), eq(contactsTable.userId, userId)))
        .limit(1);

      if (existing) {
        const [updatedContact] = await db
          .update(contactsTable)
          .set({
            name: horizonContact.name,
            ...(combinedNotes && { notes: combinedNotes }),
            updatedAt: new Date(),
          })
          .where(and(eq(contactsTable.id, existing.id), eq(contactsTable.userId, userId)))
          .returning();
        logAudit("contact", existing.id, "update", userId, existing as Record<string, unknown>, updatedContact as Record<string, unknown>);
        fireAndForgetContactSync(updatedContact);
        updated++;
      } else {
        const [contact] = await db
          .insert(contactsTable)
          .values({
            name: horizonContact.name,
            email: horizonContact.email,
            notes: combinedNotes,
            relationshipType: "other",
            priority: "medium",
            userId,
          })
          .returning();
        logAudit("contact", contact.id, "create", userId, null, contact as Record<string, unknown>);
        fireAndForgetContactSync(contact);
        created++;
      }
    } catch (err: any) {
      errors.push(`Contact ${horizonContact.email || horizonContact.id}: ${err.message}`);
    }
  }

  return { created, updated, errors };
}

export async function runHorizonSync(assignToUserId?: string): Promise<SyncSummary> {
  const [horizonUsers, horizonContacts] = await Promise.all([
    fetchHorizonUsers(),
    fetchHorizonContacts(),
  ]);

  const [leadsResult, contactsResult] = await Promise.all([
    upsertHorizonUsers(horizonUsers, assignToUserId),
    upsertHorizonContacts(horizonContacts, assignToUserId),
  ]);

  return {
    leads: leadsResult,
    contacts: contactsResult,
  };
}
