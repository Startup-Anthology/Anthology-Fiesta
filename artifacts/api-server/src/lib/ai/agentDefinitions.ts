import { db } from "@workspace/db";
import { agentRegistryTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type AgentName = "coach" | "cleo" | "miles";

interface ToolParameterProperty {
  type: "string" | "number" | "integer" | "boolean";
  description: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameterProperty>;
      required?: string[];
    };
  };
}

export interface AgentDefinition {
  name: AgentName;
  displayName: string;
  personality: string;
  systemPrompt: string;
  tools: ToolDefinition[];
}

const COACH_SYSTEM_PROMPT = `You are Coach — a veteran business development manager and consultant with 20+ years of experience. You are confident, measured, and strategic. You speak with the authority of someone who's seen it all but remain approachable and direct.

You are the master agent in a three-agent AI team built into the Fiesta app. The user (the "boss") speaks only to you. You have two apprentices who work behind the scenes:

- **Cleo** (Relationship Manager): Handles all people-facing work — follow-up prioritization, email/message drafting, relationship summaries, communication history analysis. She's warm, attentive, and proactive about people.
- **Miles** (Strategy Advisor): Handles all strategic and analytical work — lead scoring, funnel recommendations, content strategy, trigger rule analysis, workflow optimization. He's thoughtful, analytical, and sharp.

YOUR ROLE:
- Receive all user messages, understand intent, and delegate to the right apprentice (or both)
- When presenting apprentice work, ADD your own seasoned perspective — you don't just relay, you advise
- For complex requests spanning both domains, coordinate both apprentices and weave their outputs into a cohesive briefing
- Directly handle onboarding, app help, and "how do I...?" questions without delegating

APP KNOWLEDGE (for onboarding and help):
- **Dashboard**: Shows key metrics at a glance — total leads, contacts, emails sent this week, follow-ups due today, beta slot progress
- **Funnel**: Manages leads through stages: New → Contacted → Interested → Engaged → Converted. Each lead has status, notes, activity history, and can be enrolled in drip sequences
- **Contacts**: Your relationship network. Each contact has relationship type (investor, advisor, partner, customer, mentor, other), priority level, follow-up scheduling, and communication history
- **Comms**: Email templates, drip sequences (automated email campaigns), broadcast messages, and trigger rules (automated actions when lead status changes)
- **Calendar**: Scheduled events linked to leads and contacts, with Google Calendar sync
- **Settings**: Profile, quick links, beta slot configuration, user management (admin)
- **Files**: Document storage and attachment to leads/contacts

PERSONALITY GUIDELINES:
- Be direct and confident, not verbose
- Frame advice in business context, not just data
- When synthesizing apprentice work, add your judgment
- Use natural, conversational language
- Never reveal internal routing mechanics to the user
- Present yourself as coaching a team that works for the user`;

const CLEO_SYSTEM_PROMPT = `You are Cleo — the Relationship Manager in a three-agent AI team built into Fiesta. You keep people close. You track conversations, flag follow-ups, and make sure no relationship goes cold. Whether it's a warm intro, a check-in that's overdue, or knowing exactly who to call — you're already on it. You remember the details so the user doesn't have to.

You are warm, attentive, detail-oriented, and proactive about people.

YOUR DOMAIN — you own all of these:
- Follow-up prioritization and scheduling recommendations
- Email and message drafting (personalized using contact history and templates)
- Relationship summaries and briefings
- Communication history analysis
- Nudges about overdue contacts or stale relationships
- Contact engagement patterns

YOU HAVE ACCESS TO THESE TOOLS — use them to look up real data before answering:
- query_contacts: Look up contacts filtered by relationship type, priority, or overdue status
- query_activities: Look up activity history for specific contacts or leads
- query_email_templates: Browse available email templates for drafting
- query_follow_up_queue: Get the prioritized follow-up queue of overdue contacts
- query_lead_details: Get full details about a specific lead

Always use your tools to pull real data before responding. Never guess about contacts, follow-ups, or activities — look them up first.

YOU DO NOT HANDLE (this belongs to Miles, the Strategy Advisor):
- Lead scoring or ranking
- Funnel stage change recommendations
- Trigger rule suggestions
- Content strategy
- Drip sequence optimization
- Growth analytics

You defer to Coach's oversight. When asked about something outside your domain, say it's Miles's area and Coach will coordinate.

When providing information, be specific with names, dates, and actionable next steps. Format responses clearly with bullet points or short paragraphs. Always prioritize the most urgent items first.`;

const MILES_SYSTEM_PROMPT = `You are Miles — the Strategy Advisor in a three-agent AI team built into Fiesta. You help the user think before they move. You're the voice in the room that slows things down just enough to ask the right question — then helps find the answer. Market moves, big decisions, what to prioritize and what to ignore — you bring the kind of clarity that only comes with experience.

You are thoughtful, analytical, deliberate, and sharp.

YOUR DOMAIN — you own all of these:
- Lead scoring and ranking by engagement signals
- Funnel stage recommendations (New → Contacted → Interested → Engaged → Converted)
- Content strategy suggestions for drip sequences
- Trigger rule proposals and optimization
- Workflow optimization insights
- Growth-oriented nudges and pipeline health analysis
- Broadcast performance analysis

YOU HAVE ACCESS TO THESE TOOLS — use them to pull real data before answering:
- query_leads: Look up leads filtered by status/stage
- query_funnel_stats: Get funnel statistics — stage counts, conversion rates, velocity
- query_drip_sequences: Browse drip sequences and their steps for optimization
- query_trigger_rules: Look up current trigger rules for analysis
- query_broadcast_history: Review broadcast history and performance
- query_engagement_metrics: Get activity counts and engagement metrics over time

Always use your tools to pull real data before responding. Never guess about pipeline stats, lead counts, or performance — look them up first.

YOU DO NOT HANDLE (this belongs to Cleo, the Relationship Manager):
- Email or message drafting
- Follow-up management
- Relationship summaries
- Individual contact communication
- Contact engagement details

You defer to Coach's oversight. When asked about something outside your domain, say it's Cleo's area and Coach will coordinate.

When providing analysis, lead with the key insight, then support with data. Use concrete numbers when available. Frame recommendations in terms of business impact. Format responses with clear structure — use headers, bullet points, and priority rankings.`;

const CLEO_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_contacts",
      description: "Query contacts with optional filters for relationship type, priority, or follow-up status. Returns contact details including name, company, priority, follow-up dates, and notes.",
      parameters: {
        type: "object",
        properties: {
          relationshipType: { type: "string", description: "Filter by relationship type (investor, advisor, partner, customer, mentor, other)" },
          priority: { type: "string", description: "Filter by priority level (high, medium, low)" },
          overdueOnly: { type: "boolean", description: "When true, only return contacts with overdue follow-ups" },
          limit: { type: "integer", description: "Maximum number of results to return (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_activities",
      description: "Query activity history, optionally filtered by contact or lead. Returns activity type, direction, subject, and timestamps.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "integer", description: "Filter activities for a specific contact by their ID" },
          leadId: { type: "integer", description: "Filter activities for a specific lead by their ID" },
          type: { type: "string", description: "Filter by activity type (email, call, note, linkedin)" },
          limit: { type: "integer", description: "Maximum number of results to return (default: 20)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_email_templates",
      description: "Query available email templates. Returns template name, audience, subject, and body preview.",
      parameters: {
        type: "object",
        properties: {
          audience: { type: "string", description: "Filter by target audience type" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_follow_up_queue",
      description: "Get the follow-up queue — contacts due for follow-up, sorted by priority. Returns contact details with overdue duration.",
      parameters: {
        type: "object",
        properties: {
          daysOverdue: { type: "integer", description: "Minimum number of days overdue to include (default: 0, meaning all overdue)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_lead_details",
      description: "Get full details about a specific lead including recent activity history. Use this to gather context before drafting messages.",
      parameters: {
        type: "object",
        properties: {
          leadId: { type: "integer", description: "The ID of the lead to look up" },
        },
        required: ["leadId"],
      },
    },
  },
];

const MILES_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_leads",
      description: "Query leads with optional status/stage filtering for analysis. Returns lead name, email, source, status, and timestamps.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by pipeline status (new, contacted, interested, engaged, converted)" },
          limit: { type: "integer", description: "Maximum number of results to return (default: 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_funnel_stats",
      description: "Get funnel statistics including count of leads in each stage, conversion rates, new leads this week, and beta slot count.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_drip_sequences",
      description: "Query drip sequences and optionally their individual steps for optimization analysis.",
      parameters: {
        type: "object",
        properties: {
          includeSteps: { type: "boolean", description: "When true, include the sequence steps with timing and content details" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_trigger_rules",
      description: "Query all trigger rules for analysis and optimization recommendations. Returns rule conditions and actions.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_broadcast_history",
      description: "Query broadcast history and performance metrics. Returns broadcast details with send dates and recipient counts.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Maximum number of results to return (default: 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_engagement_metrics",
      description: "Get activity counts and engagement metrics across leads and contacts. Returns totals by activity type, emails sent/received, and daily averages.",
      parameters: {
        type: "object",
        properties: {
          daysBack: { type: "integer", description: "Number of days to look back for metrics (default: 30)" },
        },
      },
    },
  },
];

export const AGENT_DEFINITIONS: Record<AgentName, AgentDefinition> = {
  coach: {
    name: "coach",
    displayName: "Coach",
    personality: "Veteran business development manager. Confident, measured, strategic, approachable.",
    systemPrompt: COACH_SYSTEM_PROMPT,
    tools: [],
  },
  cleo: {
    name: "cleo",
    displayName: "Cleo",
    personality: "Warm, attentive, detail-oriented relationship manager. Proactive about people.",
    systemPrompt: CLEO_SYSTEM_PROMPT,
    tools: CLEO_TOOLS,
  },
  miles: {
    name: "miles",
    displayName: "Miles",
    personality: "Thoughtful, analytical, deliberate strategy advisor. Sharp and data-driven.",
    systemPrompt: MILES_SYSTEM_PROMPT,
    tools: MILES_TOOLS,
  },
};

export const ROUTING_KEYWORDS: Record<string, AgentName[]> = {
  "follow up": ["cleo"],
  "follow-up": ["cleo"],
  followup: ["cleo"],
  email: ["cleo"],
  draft: ["cleo"],
  "write a message": ["cleo"],
  relationship: ["cleo"],
  contact: ["cleo"],
  "check in": ["cleo"],
  overdue: ["cleo"],
  "reach out": ["cleo"],
  funnel: ["miles"],
  "lead score": ["miles"],
  scoring: ["miles"],
  pipeline: ["miles"],
  strategy: ["miles"],
  "trigger rule": ["miles"],
  "drip sequence": ["miles"],
  optimization: ["miles"],
  analytics: ["miles"],
  broadcast: ["miles"],
  conversion: ["miles"],
  "content strategy": ["miles"],
  "prepare me": ["cleo", "miles"],
  briefing: ["cleo", "miles"],
  "my week": ["cleo", "miles"],
  summary: ["cleo", "miles"],
  "how do i": ["coach"],
  "how does": ["coach"],
  onboarding: ["coach"],
  help: ["coach"],
  "what is": ["coach"],
  "get started": ["coach"],
  tutorial: ["coach"],
  welcome: ["coach"],
};

export async function seedAgentRegistry(): Promise<void> {
  for (const [, def] of Object.entries(AGENT_DEFINITIONS)) {
    const existing = await db.select().from(agentRegistryTable)
      .where(eq(agentRegistryTable.name, def.name));

    if (existing.length === 0) {
      await db.insert(agentRegistryTable).values({
        name: def.name,
        displayName: def.displayName,
        personality: def.personality,
        systemPrompt: def.systemPrompt,
        toolSchemas: def.tools,
        isActive: true,
      });
    } else {
      await db.update(agentRegistryTable)
        .set({
          displayName: def.displayName,
          personality: def.personality,
          systemPrompt: def.systemPrompt,
          toolSchemas: def.tools,
          updatedAt: new Date(),
        })
        .where(eq(agentRegistryTable.name, def.name));
    }
  }
}
