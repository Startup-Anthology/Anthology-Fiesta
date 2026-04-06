import { db } from "@workspace/db";
import { leadsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fireAndForgetLeadSync } from "./notionSync";
import { logAudit } from "./audit";

interface SASubmission {
  id?: number;
  name: string;
  email: string;
  message: string;
  topic: string;
  company?: string | null;
  phone?: string | null;
  leadScore?: number;
  priority?: string;
  status?: string;
  submittedAt?: string;
}

interface SyncSummary {
  leads: { created: number; updated: number; errors: string[] };
}

function getSAConfig() {
  const apiKey = process.env.SA_CRM_API_KEY;
  const baseUrl = process.env.SA_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("SA sync not configured: SA_CRM_API_KEY and SA_BASE_URL are required");
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
}

export function isSAConfigured(): boolean {
  const pullSyncReady = !!(process.env.SA_CRM_API_KEY && process.env.SA_BASE_URL);
  const webhookReady = !!process.env.SA_WEBHOOK_SECRET;
  return pullSyncReady || webhookReady;
}

export async function fetchSAContacts(since?: string): Promise<SASubmission[]> {
  const { apiKey, baseUrl } = getSAConfig();
  const url = since
    ? `${baseUrl}/api/crm/contacts?since=${encodeURIComponent(since)}`
    : `${baseUrl}/api/crm/contacts`;
  const res = await fetch(url, {
    headers: { "X-CRM-API-KEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("SA API authentication failed (401)");
    if (res.status === 429) throw new Error("SA API rate limited (429). Try again later.");
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status === 403 && (contentType.includes("text/html") || text.includes("Just a moment"))) {
      throw new Error(
        "SA API blocked by Cloudflare bot protection (403). " +
        "Add a WAF bypass rule in the Cloudflare dashboard for startupanthology.com: " +
        "skip managed challenges when path matches /api/crm/* or when X-CRM-API-KEY header is present."
      );
    }
    throw new Error(`SA contacts API error ${res.status}: ${text.slice(0, 200) || "Unknown error"}`);
  }
  return res.json() as Promise<SASubmission[]>;
}

async function getDefaultUserId(): Promise<string> {
  const configured = process.env.SA_DEFAULT_USER_ID;
  if (!configured) {
    throw new Error(
      "SA_DEFAULT_USER_ID is not configured. Set this env var to the UUID of the Fiesta user who owns SA inbound leads."
    );
  }
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, configured))
    .limit(1);
  if (!user) {
    throw new Error(`SA_DEFAULT_USER_ID user not found: ${configured}`);
  }
  return user.id;
}

export function topicLabel(topic: string): string {
  return topic.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function buildLeadNotes(sub: SASubmission, existingNotes?: string | null): string {
  const parts: string[] = [`[Topic: ${topicLabel(sub.topic)}]`];
  if (sub.company) parts.push(`Company: ${sub.company}`);
  if (sub.phone) parts.push(`Phone: ${sub.phone}`);
  if (sub.leadScore != null) parts.push(`Lead Score: ${sub.leadScore}/100`);
  parts.push("", sub.message);
  const newNotes = parts.join("\n");
  if (existingNotes) {
    return `${newNotes}\n\n---\n\n${existingNotes}`;
  }
  return newNotes;
}

export function mapTopicToStatus(topic: string): string {
  if (topic === "demo_request" || topic === "partnership") return "qualified";
  return "new";
}

export async function upsertSALeads(
  submissions: SASubmission[],
  assignToUserId?: string,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const userId = assignToUserId || await getDefaultUserId();

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const sub of submissions) {
    try {
      if (!sub.email) {
        errors.push(`Skipped submission ${sub.id}: no email`);
        continue;
      }

      const [existing] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.email, sub.email), eq(leadsTable.userId, userId)))
        .limit(1);

      const notes = buildLeadNotes(sub, existing?.notes);

      if (existing) {
        const [updatedLead] = await db
          .update(leadsTable)
          .set({ name: sub.name, notes, source: "startupanthology", updatedAt: new Date() })
          .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.userId, userId)))
          .returning();
        logAudit("lead", existing.id, "update", userId, existing as Record<string, unknown>, updatedLead as Record<string, unknown>);
        fireAndForgetLeadSync(updatedLead);
        updated++;
      } else {
        const [lead] = await db
          .insert(leadsTable)
          .values({
            name: sub.name,
            email: sub.email,
            source: "startupanthology",
            status: mapTopicToStatus(sub.topic),
            notes,
            userId,
          })
          .returning();
        logAudit("lead", lead.id, "create", userId, null, lead as Record<string, unknown>);
        fireAndForgetLeadSync(lead);
        created++;
      }
    } catch (err: any) {
      errors.push(`Submission ${sub.email || sub.id}: ${err.message}`);
    }
  }

  return { created, updated, errors };
}

export async function runSASync(assignToUserId?: string, since?: string): Promise<SyncSummary> {
  const submissions = await fetchSAContacts(since);
  const leads = await upsertSALeads(submissions, assignToUserId);
  return { leads };
}
