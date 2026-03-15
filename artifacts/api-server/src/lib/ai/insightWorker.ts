import { db } from "@workspace/db";
import {
  leadsTable,
  contactsTable,
  aiInsightsTable,
  activitiesTable,
} from "@workspace/db";
import { eq, and, sql, lte, ne, isNull, or, lt, gte, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { AGENT_DEFINITIONS } from "./agentDefinitions";

const MAIN_MODEL = "gpt-5.2";
const MAX_RECORDS_PER_CATEGORY = 20;

interface HeuristicItem {
  id?: number;
  name?: string;
  company?: string | null;
  priority?: string | null;
  email?: string | null;
  status?: string;
  stage?: string;
  count?: number;
  total?: number;
  relationshipType?: string | null;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  updatedAt?: Date;
  daysSinceContact?: number | null;
  daysSinceUpdate?: number;
  distribution?: Record<string, number>;
}

interface HeuristicResult {
  category: string;
  agent: "cleo" | "miles";
  items: HeuristicItem[];
}

async function runHeuristics(userId: string): Promise<HeuristicResult[]> {
  const now = new Date();
  const results: HeuristicResult[] = [];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const overdueFollowUps = await db.select({
    id: contactsTable.id,
    name: contactsTable.name,
    company: contactsTable.company,
    priority: contactsTable.priority,
    nextFollowUpAt: contactsTable.nextFollowUpAt,
    lastContactedAt: contactsTable.lastContactedAt,
  })
    .from(contactsTable)
    .where(and(
      eq(contactsTable.userId, userId),
      lte(contactsTable.nextFollowUpAt, now),
    ))
    .orderBy(sql`CASE WHEN ${contactsTable.priority} = 'high' THEN 0 WHEN ${contactsTable.priority} = 'medium' THEN 1 ELSE 2 END`)
    .limit(MAX_RECORDS_PER_CATEGORY);

  if (overdueFollowUps.length > 0) {
    results.push({
      category: "overdue_followups",
      agent: "cleo",
      items: overdueFollowUps.map(c => ({
        id: c.id,
        name: c.name,
        company: c.company,
        priority: c.priority,
        nextFollowUpAt: c.nextFollowUpAt,
        daysSinceContact: c.lastContactedAt ? Math.floor((now.getTime() - c.lastContactedAt.getTime()) / 86400000) : null,
      })),
    });
  }

  const staleContacts = await db.select({
    id: contactsTable.id,
    name: contactsTable.name,
    company: contactsTable.company,
    priority: contactsTable.priority,
    relationshipType: contactsTable.relationshipType,
    lastContactedAt: contactsTable.lastContactedAt,
  })
    .from(contactsTable)
    .where(and(
      eq(contactsTable.userId, userId),
      ne(contactsTable.priority, "low"),
      or(
        isNull(contactsTable.lastContactedAt),
        lt(contactsTable.lastContactedAt, thirtyDaysAgo),
      ),
    ))
    .limit(MAX_RECORDS_PER_CATEGORY);

  if (staleContacts.length > 0) {
    results.push({
      category: "stale_relationships",
      agent: "cleo",
      items: staleContacts.map(c => ({
        id: c.id,
        name: c.name,
        company: c.company,
        priority: c.priority,
        relationshipType: c.relationshipType,
        lastContactedAt: c.lastContactedAt,
      })),
    });
  }

  const idleLeads = await db.select({
    id: leadsTable.id,
    name: leadsTable.name,
    email: leadsTable.email,
    status: leadsTable.status,
    updatedAt: leadsTable.updatedAt,
  })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.userId, userId),
      ne(leadsTable.status, "converted"),
      lt(leadsTable.updatedAt, fourteenDaysAgo),
    ))
    .limit(MAX_RECORDS_PER_CATEGORY);

  if (idleLeads.length > 0) {
    results.push({
      category: "idle_leads",
      agent: "miles",
      items: idleLeads.map(l => ({
        id: l.id,
        name: l.name,
        email: l.email,
        status: l.status,
        updatedAt: l.updatedAt,
        daysSinceUpdate: Math.floor((now.getTime() - l.updatedAt.getTime()) / 86400000),
      })),
    });
  }

  const stageCounts = await db.select({
    status: leadsTable.status,
    count: sql<number>`count(*)::int`,
  })
    .from(leadsTable)
    .where(eq(leadsTable.userId, userId))
    .groupBy(leadsTable.status);

  const total = stageCounts.reduce((sum, s) => sum + s.count, 0);
  if (total > 0) {
    const distribution: Record<string, number> = {};
    for (const s of stageCounts) distribution[s.status] = s.count;

    const stages = ["contacted", "interested", "engaged"];
    const bottleneck = stages.find(s => (distribution[s] || 0) > total * 0.4);

    if (bottleneck) {
      results.push({
        category: "funnel_bottleneck",
        agent: "miles",
        items: [{ stage: bottleneck, count: distribution[bottleneck], total, distribution }],
      });
    }
  }

  return results;
}

interface InsightCard {
  title: string;
  description: string;
  type: string;
  severity: string;
  leadId?: number;
  contactId?: number;
}

async function frameInsightsWithAgent(
  category: string,
  agent: "cleo" | "miles",
  items: HeuristicItem[]
): Promise<InsightCard[]> {
  const agentDef = AGENT_DEFINITIONS[agent];
  const coachDef = AGENT_DEFINITIONS.coach;

  const prompt = `You are Coach, presenting ${agentDef.displayName}'s findings as actionable insight cards for the CRM dashboard.

${agentDef.displayName}'s domain: ${agentDef.personality}

Category: ${category}
Data: ${JSON.stringify(items)}

Generate concise insight cards. For each actionable insight, respond with a JSON array of objects with these fields:
- title: Short, action-oriented title from Coach's perspective (max 60 chars)
- description: Brief explanation with specific details (max 200 chars)
- type: "${category}"
- severity: "high", "medium", or "low" based on urgency
- leadId: (number or null) if this is about a specific lead
- contactId: (number or null) if this is about a specific contact

Frame insights with Coach's advisory tone — not just data, but guidance. Group related items when possible. Max 5 insights per category. Respond with ONLY the JSON array.`;

  try {
    const response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: coachDef.systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content || "[]";
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return items.slice(0, 3).map(item => ({
      title: category === "overdue_followups"
        ? `Follow up with ${item.name}`
        : category === "stale_relationships"
          ? `Reconnect with ${item.name}`
          : category === "idle_leads"
            ? `${item.name} needs attention`
            : `Funnel bottleneck at ${item.stage}`,
      description: category === "overdue_followups"
        ? `${item.priority} priority contact overdue for follow-up`
        : category === "stale_relationships"
          ? `No contact in 30+ days — ${item.relationshipType}`
          : category === "idle_leads"
            ? `Stuck in ${item.status} stage for ${item.daysSinceUpdate} days`
            : `${item.count} of ${item.total} leads stuck`,
      type: category,
      severity: category === "overdue_followups" && item.priority === "high" ? "high" : "medium",
      leadId: item.id && category === "idle_leads" ? item.id : null,
      contactId: item.id && (category === "overdue_followups" || category === "stale_relationships") ? item.id : null,
    }));
  }
}

export async function generateInsightsForUser(userId: string): Promise<number> {
  const heuristics = await runHeuristics(userId);
  let totalInserts = 0;

  await db.delete(aiInsightsTable)
    .where(and(
      eq(aiInsightsTable.userId, userId),
      eq(aiInsightsTable.status, "active"),
    ));

  for (const result of heuristics) {
    const insights = await frameInsightsWithAgent(result.category, result.agent, result.items);

    for (const insight of insights) {
      await db.insert(aiInsightsTable).values({
        userId,
        type: insight.type,
        severity: insight.severity,
        sourceAgent: result.agent,
        title: insight.title,
        description: insight.description,
        status: "active",
        leadId: insight.leadId || null,
        contactId: insight.contactId || null,
      });
      totalInserts++;

      if (insight.contactId || insight.leadId) {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
          const dedupConditions = [
            eq(activitiesTable.userId, userId),
            eq(activitiesTable.type, "ai_insight"),
            eq(activitiesTable.subject, insight.title),
            gte(activitiesTable.createdAt, thirtyDaysAgo),
          ];
          if (insight.contactId) dedupConditions.push(eq(activitiesTable.contactId, insight.contactId));
          if (insight.leadId) dedupConditions.push(eq(activitiesTable.leadId, insight.leadId));

          const existing = await db.select({ id: activitiesTable.id })
            .from(activitiesTable)
            .where(and(...dedupConditions))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(activitiesTable).values({
              userId,
              type: "ai_insight",
              subject: insight.title,
              body: insight.description,
              note: `${result.agent === "cleo" ? "Cleo" : "Miles"} recommendation`,
              contactId: insight.contactId || null,
              leadId: insight.leadId || null,
            });
          }
        } catch (err) {
          console.error("Failed to create activity for AI insight:", err);
        }
      }
    }
  }

  return totalInserts;
}

let insightIntervalId: ReturnType<typeof setInterval> | null = null;
const MAX_CONCURRENT_USERS = 5;

export function startInsightWorker() {
  if (insightIntervalId) return;
  console.log("AI Insight worker started (daily interval, first run in 60s)");

  const runForAllUsers = async () => {
    try {
      const { usersTable } = await import("@workspace/db");
      const users = await db.select({ id: usersTable.id }).from(usersTable);

      for (let i = 0; i < users.length; i += MAX_CONCURRENT_USERS) {
        const batch = users.slice(i, i + MAX_CONCURRENT_USERS);
        await Promise.allSettled(
          batch.map(async (user) => {
            try {
              await generateInsightsForUser(user.id);
              console.log(`AI Insight worker: generated insights for user ${user.id}`);
            } catch (err) {
              console.error(`AI Insight worker: error for user ${user.id}:`, err);
            }
          })
        );
      }
    } catch (err) {
      console.error("AI Insight worker: run error:", err);
    }
  };

  setTimeout(runForAllUsers, 60_000);
  insightIntervalId = setInterval(runForAllUsers, 24 * 60 * 60 * 1000);
}

export function stopInsightWorker() {
  if (insightIntervalId) {
    clearInterval(insightIntervalId);
    insightIntervalId = null;
    console.log("AI Insight worker stopped");
  }
}
