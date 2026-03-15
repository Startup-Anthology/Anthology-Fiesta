import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { conversations, messages, onboardingProgressTable } from "@workspace/db";
import { eq, and, desc, or, isNull } from "drizzle-orm";
import { AGENT_DEFINITIONS, ROUTING_KEYWORDS, type AgentName, type ToolDefinition } from "./agentDefinitions";
import { executeToolCall } from "./toolExecutor";
import type { Response } from "express";
import type OpenAI from "openai";

const MAIN_MODEL = "gpt-5.2";
const ROUTER_MODEL = "gpt-5-nano";

type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function verifyModelAvailability(): Promise<boolean> {
  try {
    const response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      max_completion_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    return !!response.choices[0]?.message?.content;
  } catch (err) {
    console.error(`AI model availability check failed for ${MAIN_MODEL}:`, err);
    return false;
  }
}

export async function classifyIntent(userMessage: string): Promise<{ route: AgentName[]; isOnboarding: boolean }> {
  const lower = userMessage.toLowerCase();

  for (const [keyword, agents] of Object.entries(ROUTING_KEYWORDS)) {
    if (lower.includes(keyword)) {
      const isOnboarding = agents.includes("coach") && agents.length === 1;
      return { route: agents, isOnboarding };
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: ROUTER_MODEL,
      max_completion_tokens: 100,
      messages: [
        {
          role: "system",
          content: `Classify the user's intent into one of these categories. Respond with ONLY the category name, nothing else.
Categories:
- "cleo" — people/relationship work: follow-ups, emails, contact summaries, drafting messages
- "miles" — strategy/analytics: lead scoring, funnel analysis, content strategy, trigger rules, drip sequences
- "both" — requests spanning both domains: weekly briefings, general summaries, "prepare me for my week"
- "coach" — onboarding, app help, "how do I" questions, getting started, greetings`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() || "coach";
    if (result === "both") return { route: ["cleo", "miles"], isOnboarding: false };
    if (result === "cleo") return { route: ["cleo"], isOnboarding: false };
    if (result === "miles") return { route: ["miles"], isOnboarding: false };
    return { route: ["coach"], isOnboarding: true };
  } catch {
    return { route: ["coach"], isOnboarding: false };
  }
}

async function getCoachHistory(conversationId: number, limit: number = 20): Promise<ChatCompletionMessage[]> {
  const msgs = await db.select().from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      or(
        eq(messages.role, "user"),
        eq(messages.sourceAgent, "coach"),
      ),
    ))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return msgs.reverse().map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function buildAgentContext(
  conversationId: number,
  agentName: AgentName,
  limit: number = 10
): Promise<ChatCompletionMessage[]> {
  const allMsgs = await db.select().from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      or(
        eq(messages.role, "user"),
        eq(messages.sourceAgent, agentName),
      ),
    ))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return allMsgs.reverse().map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

async function persistMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  sourceAgent: AgentName | null,
  tokenUsage: number | null = null
): Promise<void> {
  await db.insert(messages).values({
    conversationId,
    role,
    content,
    sourceAgent,
    tokenUsage,
  });
}

function parseToolArgs(raw: string): Record<string, string | number | boolean> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractTokenUsage(response: OpenAI.Chat.Completions.ChatCompletion): number | null {
  return response.usage?.total_tokens ?? null;
}

async function runAgentWithToolsInternal(
  agentName: AgentName,
  userMessage: string,
  conversationId: number,
  userId: string
): Promise<{ output: string; tokens: number | null }> {
  const agent = AGENT_DEFINITIONS[agentName];
  const agentContext = await buildAgentContext(conversationId, agentName);

  const agentMessages: ChatCompletionMessage[] = [
    { role: "system", content: agent.systemPrompt },
    ...agentContext.slice(-10),
    { role: "user", content: userMessage },
  ];

  const toolsParam = agent.tools.length > 0 ? agent.tools : undefined;

  let response = await openai.chat.completions.create({
    model: MAIN_MODEL,
    max_completion_tokens: 8192,
    messages: agentMessages,
    tools: toolsParam,
  });

  let msg = response.choices[0]?.message;
  let iterations = 0;
  const maxIterations = 5;
  let totalTokens = extractTokenUsage(response) ?? 0;

  while (msg?.tool_calls && msg.tool_calls.length > 0 && iterations < maxIterations) {
    agentMessages.push(msg as ChatCompletionMessage);

    for (const toolCall of msg.tool_calls) {
      const args = parseToolArgs(toolCall.function.arguments);
      const result = await executeToolCall(toolCall.function.name, args, userId);
      agentMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      max_completion_tokens: 8192,
      messages: agentMessages,
      tools: agent.tools,
    });

    totalTokens += extractTokenUsage(response) ?? 0;
    msg = response.choices[0]?.message;
    iterations++;
  }

  const output = msg?.content || "I wasn't able to generate a response. Please try again.";
  await persistMessage(conversationId, "assistant", output, agentName, totalTokens || null);
  return { output, tokens: totalTokens || null };
}

export async function handleCoachDirect(
  userMessage: string,
  conversationHistory: ChatCompletionMessage[],
  conversationId: number,
  userId: string,
  res: Response
): Promise<{ response: string; tokens: number | null }> {
  const onboardingDone = await db.select().from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.userId, userId));
  const completedTopics = onboardingDone.map(o => o.topic);

  let additionalContext = "";
  if (completedTopics.length > 0) {
    additionalContext = `\n\nThe user has already been onboarded on these topics: ${completedTopics.join(", ")}. Don't repeat those.`;
  }

  const coachDef = AGENT_DEFINITIONS.coach;
  const chatMessages: ChatCompletionMessage[] = [
    { role: "system", content: coachDef.systemPrompt + additionalContext },
    ...conversationHistory.slice(-10),
    { role: "user", content: userMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: MAIN_MODEL,
    max_completion_tokens: 8192,
    messages: chatMessages,
    stream: true,
    stream_options: { include_usage: true },
  });

  let fullResponse = "";
  let totalTokens: number | null = null;
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    if (chunk.usage) {
      totalTokens = chunk.usage.total_tokens;
    }
  }

  return { response: fullResponse, tokens: totalTokens };
}

export async function handleSingleAgent(
  agentName: AgentName,
  userMessage: string,
  conversationHistory: ChatCompletionMessage[],
  conversationId: number,
  userId: string,
  res: Response
): Promise<{ response: string; agentsUsed: AgentName[]; tokens: number | null }> {
  const agent = AGENT_DEFINITIONS[agentName];
  const coachDef = AGENT_DEFINITIONS.coach;
  const agentContext = await buildAgentContext(conversationId, agentName);

  const coachFraming = `You are responding as Coach, drawing on ${agent.displayName}'s (${agentName === "cleo" ? "Relationship Manager" : "Strategy Advisor"}) expertise. Use ${agent.displayName}'s tools to pull real CRM data, then present your findings with Coach's experienced advisory perspective. Don't just present data — coach the user with actionable guidance.`;

  const agentMessages: ChatCompletionMessage[] = [
    { role: "system", content: `${coachDef.systemPrompt}\n\n${coachFraming}\n\n${agent.displayName}'s domain and tools:\n${agent.systemPrompt}` },
    ...agentContext.slice(-10),
    { role: "user", content: userMessage },
  ];

  const toolsParam = agent.tools.length > 0 ? agent.tools : undefined;

  let response = await openai.chat.completions.create({
    model: MAIN_MODEL,
    max_completion_tokens: 8192,
    messages: agentMessages,
    tools: toolsParam,
  });

  let msg = response.choices[0]?.message;
  let iterations = 0;
  const maxIterations = 5;
  let totalTokens = extractTokenUsage(response) ?? 0;

  while (msg?.tool_calls && msg.tool_calls.length > 0 && iterations < maxIterations) {
    agentMessages.push(msg as ChatCompletionMessage);

    for (const toolCall of msg.tool_calls) {
      const args = parseToolArgs(toolCall.function.arguments);
      const result = await executeToolCall(toolCall.function.name, args, userId);
      agentMessages.push({
        role: "tool" as const,
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    response = await openai.chat.completions.create({
      model: MAIN_MODEL,
      max_completion_tokens: 8192,
      messages: agentMessages,
      tools: agent.tools,
    });

    totalTokens += extractTokenUsage(response) ?? 0;
    msg = response.choices[0]?.message;
    iterations++;
  }

  const output = msg?.content || "I wasn't able to generate a response.";

  await persistMessage(conversationId, "assistant", output, agentName, totalTokens || null);

  res.write(`data: ${JSON.stringify({ content: output })}\n\n`);

  return { response: output, agentsUsed: ["coach", agentName], tokens: totalTokens || null };
}

export async function handleDualAgent(
  userMessage: string,
  conversationHistory: ChatCompletionMessage[],
  conversationId: number,
  userId: string,
  res: Response
): Promise<{ response: string; agentsUsed: AgentName[]; tokens: number | null }> {
  const [cleoResult, milesResult] = await Promise.all([
    runAgentWithToolsInternal("cleo", userMessage, conversationId, userId),
    runAgentWithToolsInternal("miles", userMessage, conversationId, userId),
  ]);

  const coachDef = AGENT_DEFINITIONS.coach;
  const synthesisMessages: ChatCompletionMessage[] = [
    {
      role: "system",
      content: `${coachDef.systemPrompt}\n\nYou are synthesizing outputs from both Cleo (Relationship Manager) and Miles (Strategy Advisor) into a cohesive briefing for the user. Weave their insights together, add your own experienced perspective, and present a unified, well-structured response.`,
    },
    ...conversationHistory.slice(-6),
    { role: "user", content: userMessage },
    {
      role: "system",
      content: `Cleo's analysis (relationships & people):\n${cleoResult.output}\n\nMiles's analysis (strategy & data):\n${milesResult.output}\n\nSynthesize these into a cohesive response with your advisory framing.`,
    },
  ];

  const stream = await openai.chat.completions.create({
    model: MAIN_MODEL,
    max_completion_tokens: 8192,
    messages: synthesisMessages,
    stream: true,
    stream_options: { include_usage: true },
  });

  let fullResponse = "";
  let synthTokens: number | null = null;
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      fullResponse += content;
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    if (chunk.usage) {
      synthTokens = chunk.usage.total_tokens;
    }
  }

  const totalTokens = (cleoResult.tokens ?? 0) + (milesResult.tokens ?? 0) + (synthTokens ?? 0);

  return { response: fullResponse, agentsUsed: ["coach", "cleo", "miles"], tokens: totalTokens || null };
}

const ONBOARDING_TOPICS = [
  "dashboard", "funnel", "contacts", "comms", "calendar", "settings",
  "leads", "drip", "templates", "broadcasts", "triggers",
] as const;

async function detectAndTrackOnboarding(userId: string, userMessage: string, response: string): Promise<void> {
  const onboardingDone = await db.select().from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.userId, userId));
  const completedTopics = new Set(onboardingDone.map(o => o.topic));

  const remainingTopics = ONBOARDING_TOPICS.filter(t => !completedTopics.has(t));
  if (remainingTopics.length === 0) return;

  try {
    const detectResponse = await openai.chat.completions.create({
      model: ROUTER_MODEL,
      max_completion_tokens: 200,
      messages: [
        {
          role: "system",
          content: `Given this conversation about Fiesta, which of these app sections were substantively discussed or explained? Only include sections where the user received a meaningful explanation or walkthrough. Respond with ONLY a comma-separated list of matching section names, or "none".
Available sections: ${remainingTopics.join(", ")}`,
        },
        {
          role: "user",
          content: `User asked: "${userMessage.substring(0, 300)}"\n\nAssistant explained: "${response.substring(0, 500)}"`,
        },
      ],
    });

    const detected = detectResponse.choices[0]?.message?.content?.trim().toLowerCase() || "none";
    if (detected === "none") return;

    const topics = detected.split(",").map(t => t.trim()).filter(t => remainingTopics.includes(t as typeof ONBOARDING_TOPICS[number]));
    for (const topic of topics) {
      try {
        await db.insert(onboardingProgressTable).values({ userId, topic });
      } catch { /* duplicate insert is fine */ }
    }
  } catch { /* detection failure is non-critical */ }
}

export async function processChat(
  conversationId: number,
  userMessage: string,
  userId: string,
  res: Response
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    await persistMessage(conversationId, "user", userMessage, null);

    const history = await getCoachHistory(conversationId);
    const { route, isOnboarding } = await classifyIntent(userMessage);

    let fullResponse = "";
    let agentsUsed: AgentName[] = ["coach"];
    let totalTokens: number | null = null;

    if (isOnboarding || route.includes("coach")) {
      const result = await handleCoachDirect(userMessage, history, conversationId, userId, res);
      fullResponse = result.response;
      totalTokens = result.tokens;
      agentsUsed = ["coach"];
    } else if (route.length === 1) {
      const result = await handleSingleAgent(route[0], userMessage, history, conversationId, userId, res);
      fullResponse = result.response;
      totalTokens = result.tokens;
      agentsUsed = result.agentsUsed;
    } else {
      const result = await handleDualAgent(userMessage, history, conversationId, userId, res);
      fullResponse = result.response;
      totalTokens = result.tokens;
      agentsUsed = result.agentsUsed;
    }

    await persistMessage(conversationId, "assistant", fullResponse, "coach", totalTokens);

    await db.update(conversations)
      .set({
        agentsInvolved: agentsUsed.join(","),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    if (isOnboarding || route.includes("coach")) {
      detectAndTrackOnboarding(userId, userMessage, fullResponse).catch(() => {});
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("processChat error:", err?.message || err, err?.stack || "");
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: "An error occurred while processing your message." })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  }
}

export async function processChatSync(
  conversationId: number,
  userMessage: string,
  userId: string
): Promise<string> {
  try {
    await persistMessage(conversationId, "user", userMessage, null);

    const history = await getCoachHistory(conversationId);
    const { route, isOnboarding } = await classifyIntent(userMessage);

    let fullResponse = "";
    let agentsUsed: AgentName[] = ["coach"];
    let totalTokens: number | null = null;

    if (isOnboarding || route.includes("coach")) {
      const onboardingDone = await db.select().from(onboardingProgressTable)
        .where(eq(onboardingProgressTable.userId, userId));
      const completedTopics = onboardingDone.map(o => o.topic);

      let additionalContext = "";
      if (completedTopics.length > 0) {
        additionalContext = `\n\nThe user has already been onboarded on these topics: ${completedTopics.join(", ")}. Don't repeat those.`;
      }

      const coachDef = AGENT_DEFINITIONS.coach;
      const chatMessages: ChatCompletionMessage[] = [
        { role: "system", content: coachDef.systemPrompt + additionalContext },
        ...history.slice(-10),
        { role: "user", content: userMessage },
      ];

      const response = await openai.chat.completions.create({
        model: MAIN_MODEL,
        max_completion_tokens: 8192,
        messages: chatMessages,
      });

      fullResponse = response.choices[0]?.message?.content || "I wasn't able to generate a response.";
      totalTokens = response.usage?.total_tokens ?? null;
      agentsUsed = ["coach"];
    } else if (route.length === 1) {
      const agentName = route[0];
      const result = await runAgentWithToolsInternal(agentName, userMessage, conversationId, userId);

      const agent = AGENT_DEFINITIONS[agentName];
      const coachDef = AGENT_DEFINITIONS.coach;
      const coachFraming = `You are responding as Coach, drawing on ${agent.displayName}'s expertise. Present the findings with Coach's experienced advisory perspective.`;

      const coachMessages: ChatCompletionMessage[] = [
        { role: "system", content: `${coachDef.systemPrompt}\n\n${coachFraming}` },
        ...history.slice(-6),
        { role: "user", content: userMessage },
        { role: "system", content: `${agent.displayName}'s analysis:\n${result.output}\n\nSynthesize this into a cohesive response with your advisory framing.` },
      ];

      const coachResponse = await openai.chat.completions.create({
        model: MAIN_MODEL,
        max_completion_tokens: 8192,
        messages: coachMessages,
      });

      fullResponse = coachResponse.choices[0]?.message?.content || result.output;
      totalTokens = (result.tokens ?? 0) + (coachResponse.usage?.total_tokens ?? 0);
      agentsUsed = ["coach", agentName];
    } else {
      const [cleoResult, milesResult] = await Promise.all([
        runAgentWithToolsInternal("cleo", userMessage, conversationId, userId),
        runAgentWithToolsInternal("miles", userMessage, conversationId, userId),
      ]);

      const coachDef = AGENT_DEFINITIONS.coach;
      const synthesisMessages: ChatCompletionMessage[] = [
        {
          role: "system",
          content: `${coachDef.systemPrompt}\n\nYou are synthesizing outputs from both Cleo (Relationship Manager) and Miles (Strategy Advisor) into a cohesive briefing for the user.`,
        },
        ...history.slice(-6),
        { role: "user", content: userMessage },
        {
          role: "system",
          content: `Cleo's analysis:\n${cleoResult.output}\n\nMiles's analysis:\n${milesResult.output}\n\nSynthesize these into a cohesive response.`,
        },
      ];

      const synthResponse = await openai.chat.completions.create({
        model: MAIN_MODEL,
        max_completion_tokens: 8192,
        messages: synthesisMessages,
      });

      fullResponse = synthResponse.choices[0]?.message?.content || "I wasn't able to generate a response.";
      totalTokens = (cleoResult.tokens ?? 0) + (milesResult.tokens ?? 0) + (synthResponse.usage?.total_tokens ?? 0);
      agentsUsed = ["coach", "cleo", "miles"];
    }

    await persistMessage(conversationId, "assistant", fullResponse, "coach", totalTokens);

    await db.update(conversations)
      .set({
        agentsInvolved: agentsUsed.join(","),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    if (isOnboarding || route.includes("coach")) {
      detectAndTrackOnboarding(userId, userMessage, fullResponse).catch(() => {});
    }

    return fullResponse;
  } catch (err: any) {
    console.error("processChatSync error:", err?.message || err, err?.stack || "");
    throw err;
  }
}

export async function getOnboardingGreeting(userId: string): Promise<string> {
  const onboardingDone = await db.select().from(onboardingProgressTable)
    .where(eq(onboardingProgressTable.userId, userId));

  if (onboardingDone.length > 0) {
    return "";
  }

  return `Hey there — I'm Coach, your business development advisor. I work with a small team behind the scenes to help you get the most out of Fiesta.

Here's who's on the team:

**Cleo** is your Relationship Manager. She tracks your contacts, flags follow-ups, drafts emails, and makes sure no relationship goes cold.

**Miles** is your Strategy Advisor. He analyzes your funnel, scores leads, spots trends, and helps you think strategically about growth.

You talk to me, and I'll coordinate with them behind the scenes. Ask me anything — whether it's about your pipeline, a follow-up you need to send, or just how to use the app.

Want me to walk you through the main sections of the app, or would you rather just jump in and ask me something?`;
}
