import type { MessagingProvider } from "../types";

const SLACK_API = "https://slack.com/api";

export class SlackProvider implements MessagingProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async slackRequest(method: string, body?: Record<string, unknown>): Promise<any> {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Slack API HTTP error ${res.status}: ${text}`);
      return null;
    }

    const data = await res.json();
    if (!data.ok) {
      console.error(`Slack API error: ${data.error}`);
      return null;
    }

    return data;
  }

  async sendMessage(channelId: string, text: string, blocks?: unknown[]): Promise<string | null> {
    const body: Record<string, unknown> = { channel: channelId, text };
    if (blocks) body.blocks = blocks;
    const data = await this.slackRequest("chat.postMessage", body);
    return data?.ts ?? null;
  }

  async listChannels(): Promise<{ id: string; name: string }[]> {
    const data = await this.slackRequest("conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    });
    if (!data?.channels) return [];
    return data.channels.map((ch: any) => ({ id: ch.id, name: ch.name }));
  }

  async postDigest(channelId: string, summary: {
    newLeads: number;
    pipelineCounts: Record<string, number>;
    overdueFollowUps: number;
    upcomingEvents: number;
  }): Promise<string | null> {
    const pipelineLines = Object.entries(summary.pipelineCounts)
      .map(([status, count]) => `  *${status}*: ${count}`)
      .join("\n");

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "Daily Pipeline Digest", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*New Leads (24h):*\n${summary.newLeads}` },
          { type: "mrkdwn", text: `*Overdue Follow-ups:*\n${summary.overdueFollowUps}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Pipeline Breakdown:*\n${pipelineLines || "  No leads yet"}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Upcoming Events (7d):*\n${summary.upcomingEvents}` },
        ],
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Sent from Fiesta CRM | ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}` },
        ],
      },
    ];

    return this.sendMessage(channelId, `Daily digest: ${summary.newLeads} new leads, ${summary.overdueFollowUps} overdue follow-ups`, blocks);
  }
}
