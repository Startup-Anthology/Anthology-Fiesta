import { db } from "@workspace/db";
import {
  contactsTable,
  activitiesTable,
  emailTemplatesTable,
  leadsTable,
  dripSequencesTable,
  dripSequenceStepsTable,
  triggerRulesTable,
  broadcastsTable,
} from "@workspace/db";
import { eq, and, lte, sql, desc } from "drizzle-orm";

type ToolArgs = Record<string, string | number | boolean | undefined>;

export async function executeToolCall(
  toolName: string,
  args: ToolArgs,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case "query_contacts":
        return await queryContacts(args, userId);
      case "query_activities":
        return await queryActivities(args, userId);
      case "query_email_templates":
        return await queryEmailTemplates(args, userId);
      case "query_follow_up_queue":
        return await queryFollowUpQueue(args, userId);
      case "query_lead_details":
        return await queryLeadDetails(args, userId);
      case "query_leads":
        return await queryLeads(args, userId);
      case "query_funnel_stats":
        return await queryFunnelStats(userId);
      case "query_drip_sequences":
        return await queryDripSequences(args, userId);
      case "query_trigger_rules":
        return await queryTriggerRules(userId);
      case "query_broadcast_history":
        return await queryBroadcastHistory(args, userId);
      case "query_engagement_metrics":
        return await queryEngagementMetrics(args, userId);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: message });
  }
}

async function queryContacts(args: ToolArgs, userId: string): Promise<string> {
  const limit = Number(args.limit) || 20;
  const conditions = [eq(contactsTable.userId, userId)];

  if (args.relationshipType) {
    conditions.push(eq(contactsTable.relationshipType, String(args.relationshipType)));
  }
  if (args.priority) {
    conditions.push(eq(contactsTable.priority, String(args.priority)));
  }
  if (args.overdueOnly === true || args.overdueOnly === "true") {
    conditions.push(lte(contactsTable.nextFollowUpAt, new Date()));
  }

  const contacts = await db.select().from(contactsTable)
    .where(and(...conditions))
    .orderBy(sql`CASE WHEN ${contactsTable.priority} = 'high' THEN 0 WHEN ${contactsTable.priority} = 'medium' THEN 1 ELSE 2 END`)
    .limit(limit);

  return JSON.stringify(contacts.map(c => ({
    id: c.id,
    name: c.name,
    company: c.company,
    title: c.title,
    relationshipType: c.relationshipType,
    priority: c.priority,
    email: c.email,
    phone: c.phone,
    lastContactedAt: c.lastContactedAt,
    nextFollowUpAt: c.nextFollowUpAt,
    notes: c.notes?.substring(0, 200),
  })));
}

async function queryActivities(args: ToolArgs, userId: string): Promise<string> {
  const limit = Number(args.limit) || 20;
  const conditions = [eq(activitiesTable.userId, userId)];
  if (args.contactId) conditions.push(eq(activitiesTable.contactId, Number(args.contactId)));
  if (args.leadId) conditions.push(eq(activitiesTable.leadId, Number(args.leadId)));
  if (args.type) conditions.push(eq(activitiesTable.type, String(args.type)));

  const activities = await db.select().from(activitiesTable)
    .where(and(...conditions))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(limit);

  return JSON.stringify(activities.map(a => ({
    id: a.id,
    type: a.type,
    direction: a.direction,
    subject: a.subject,
    note: a.note?.substring(0, 200),
    createdAt: a.createdAt,
    leadId: a.leadId,
    contactId: a.contactId,
  })));
}

async function queryEmailTemplates(args: ToolArgs, userId: string): Promise<string> {
  const conditions = [eq(emailTemplatesTable.userId, userId)];
  if (args.audience) conditions.push(eq(emailTemplatesTable.audience, String(args.audience)));

  const templates = await db.select().from(emailTemplatesTable).where(and(...conditions));
  return JSON.stringify(templates.map(t => ({
    id: t.id,
    name: t.name,
    audience: t.audience,
    subject: t.subject,
    body: t.body.substring(0, 300),
  })));
}

async function queryFollowUpQueue(args: ToolArgs, userId: string): Promise<string> {
  const now = new Date();
  let threshold = now;

  if (args.daysOverdue) {
    threshold = new Date(now.getTime() - Number(args.daysOverdue) * 24 * 60 * 60 * 1000);
  }

  const contacts = await db.select().from(contactsTable)
    .where(and(
      eq(contactsTable.userId, userId),
      lte(contactsTable.nextFollowUpAt, threshold),
    ))
    .orderBy(sql`CASE WHEN ${contactsTable.priority} = 'high' THEN 0 WHEN ${contactsTable.priority} = 'medium' THEN 1 ELSE 2 END`);

  return JSON.stringify(contacts.map(c => ({
    id: c.id,
    name: c.name,
    company: c.company,
    priority: c.priority,
    relationshipType: c.relationshipType,
    nextFollowUpAt: c.nextFollowUpAt,
    lastContactedAt: c.lastContactedAt,
    daysSinceContact: c.lastContactedAt ? Math.floor((now.getTime() - c.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
  })));
}

async function queryLeadDetails(args: ToolArgs, userId: string): Promise<string> {
  const leadId = Number(args.leadId);
  if (!leadId) return JSON.stringify({ error: "leadId is required" });

  const [lead] = await db.select().from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId)));
  if (!lead) return JSON.stringify({ error: "Lead not found" });

  const activities = await db.select().from(activitiesTable)
    .where(and(eq(activitiesTable.leadId, lead.id), eq(activitiesTable.userId, userId)))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(10);

  return JSON.stringify({
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      source: lead.source,
      status: lead.status,
      isBeta: lead.isBeta,
      notes: lead.notes?.substring(0, 500),
      createdAt: lead.createdAt,
    },
    recentActivities: activities.map(a => ({
      type: a.type,
      direction: a.direction,
      subject: a.subject,
      createdAt: a.createdAt,
    })),
  });
}

async function queryLeads(args: ToolArgs, userId: string): Promise<string> {
  const limit = Number(args.limit) || 30;
  const conditions = [eq(leadsTable.userId, userId)];
  if (args.status) conditions.push(eq(leadsTable.status, String(args.status)));

  const leads = await db.select().from(leadsTable)
    .where(and(...conditions))
    .orderBy(desc(leadsTable.createdAt))
    .limit(limit);

  return JSON.stringify(leads.map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    source: l.source,
    status: l.status,
    isBeta: l.isBeta,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  })));
}

async function queryFunnelStats(userId: string): Promise<string> {
  const stageCounts = await db.select({
    status: leadsTable.status,
    count: sql<number>`count(*)::int`,
  })
    .from(leadsTable)
    .where(eq(leadsTable.userId, userId))
    .groupBy(leadsTable.status);

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of stageCounts) {
    counts[row.status] = row.count;
    total += row.count;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [newThisWeekResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.userId, userId),
      sql`${leadsTable.createdAt} >= ${weekAgo}`,
    ));

  const [betaResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.userId, userId),
      eq(leadsTable.isBeta, true),
    ));

  return JSON.stringify({
    total,
    newThisWeek: newThisWeekResult?.count || 0,
    betaCount: betaResult?.count || 0,
    byStage: counts,
    conversionRate: total > 0 ? `${Math.round(((counts["converted"] || 0) / total) * 100)}%` : "0%",
  });
}

async function queryDripSequences(args: ToolArgs, userId: string): Promise<string> {
  const sequences = await db.select().from(dripSequencesTable)
    .where(eq(dripSequencesTable.userId, userId));

  if (args.includeSteps === true || args.includeSteps === "true") {
    const result = [];
    for (const seq of sequences) {
      const steps = await db.select().from(dripSequenceStepsTable)
        .where(eq(dripSequenceStepsTable.sequenceId, seq.id));
      result.push({ ...seq, steps: steps.sort((a, b) => a.stepOrder - b.stepOrder) });
    }
    return JSON.stringify(result);
  }

  return JSON.stringify(sequences);
}

async function queryTriggerRules(userId: string): Promise<string> {
  const rules = await db.select().from(triggerRulesTable)
    .where(eq(triggerRulesTable.userId, userId));
  return JSON.stringify(rules);
}

async function queryBroadcastHistory(args: ToolArgs, userId: string): Promise<string> {
  const limit = Number(args.limit) || 10;
  const broadcasts = await db.select().from(broadcastsTable)
    .where(eq(broadcastsTable.userId, userId))
    .orderBy(desc(broadcastsTable.createdAt))
    .limit(limit);
  return JSON.stringify(broadcasts);
}

async function queryEngagementMetrics(args: ToolArgs, userId: string): Promise<string> {
  const daysBack = Number(args.daysBack) || 30;
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const typeCounts = await db.select({
    type: activitiesTable.type,
    count: sql<number>`count(*)::int`,
  })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.userId, userId),
      sql`${activitiesTable.createdAt} >= ${since}`,
    ))
    .groupBy(activitiesTable.type);

  const byType: Record<string, number> = {};
  let totalActivities = 0;
  for (const row of typeCounts) {
    byType[row.type] = row.count;
    totalActivities += row.count;
  }

  const [emailsSentResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.userId, userId),
      eq(activitiesTable.type, "email"),
      eq(activitiesTable.direction, "sent"),
      sql`${activitiesTable.createdAt} >= ${since}`,
    ));

  const [emailsReceivedResult] = await db.select({
    count: sql<number>`count(*)::int`,
  })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.userId, userId),
      eq(activitiesTable.type, "email"),
      eq(activitiesTable.direction, "received"),
      sql`${activitiesTable.createdAt} >= ${since}`,
    ));

  return JSON.stringify({
    period: `Last ${daysBack} days`,
    totalActivities,
    byType,
    emailsSent: emailsSentResult?.count || 0,
    emailsReceived: emailsReceivedResult?.count || 0,
    avgActivitiesPerDay: Math.round(totalActivities / daysBack * 10) / 10,
  });
}
