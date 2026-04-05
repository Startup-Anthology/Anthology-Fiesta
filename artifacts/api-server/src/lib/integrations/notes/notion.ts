import type { NotesProvider } from "../types";

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionProvider implements NotesProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async notionRequest(path: string, method: string, body?: unknown): Promise<any> {
    const res = await fetch(`${NOTION_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Notion API error ${res.status}: ${text}`);
      return null;
    }

    return res.json();
  }

  private buildLeadProperties(lead: any): Record<string, unknown> {
    const props: Record<string, unknown> = {
      Name: { title: [{ text: { content: lead.name } }] },
      Email: { email: lead.email },
      Status: { select: { name: lead.status } },
      Source: { select: { name: lead.source } },
      "Is Beta": { checkbox: lead.isBeta },
    };

    if (lead.notes) {
      props.Notes = { rich_text: [{ text: { content: lead.notes.slice(0, 2000) } }] };
    }

    if (lead._activitySummary) {
      props.Activity = { rich_text: [{ text: { content: lead._activitySummary.slice(0, 2000) } }] };
    }

    if (lead._fileUrls?.length) {
      props.Files = {
        files: lead._fileUrls.map((f: { name: string; url: string }) => ({
          type: "external",
          name: f.name,
          external: { url: f.url },
        })),
      };
    }

    return props;
  }

  async syncLead(lead: any, databaseId: string): Promise<string | null> {
    try {
      const properties = this.buildLeadProperties(lead);
      if (lead.notionPageId) {
        await this.notionRequest(`/pages/${lead.notionPageId}`, "PATCH", { properties });
        return lead.notionPageId;
      } else {
        const res = await this.notionRequest("/pages", "POST", {
          parent: { database_id: databaseId },
          properties,
        });
        return res?.id || null;
      }
    } catch (err) {
      console.error("Notion lead sync error:", err);
      return null;
    }
  }

  async syncContact(contact: any, databaseId: string): Promise<string | null> {
    try {
      if (contact.notionPageId) {
        await this.notionRequest(`/pages/${contact.notionPageId}`, "PATCH", {
          properties: {
            Name: { title: [{ text: { content: contact.name } }] },
            Email: contact.email ? { email: contact.email } : undefined,
            Company: contact.company ? { rich_text: [{ text: { content: contact.company } }] } : undefined,
            Type: { select: { name: contact.relationshipType } },
            Priority: { select: { name: contact.priority } },
          },
        });
        return contact.notionPageId;
      } else {
        const res = await this.notionRequest("/pages", "POST", {
          parent: { database_id: databaseId },
          properties: {
            Name: { title: [{ text: { content: contact.name } }] },
            Email: contact.email ? { email: contact.email } : undefined,
            Company: contact.company ? { rich_text: [{ text: { content: contact.company } }] } : undefined,
            Type: { select: { name: contact.relationshipType } },
            Priority: { select: { name: contact.priority } },
          },
        });
        return res?.id || null;
      }
    } catch (err) {
      console.error("Notion contact sync error:", err);
      return null;
    }
  }

  async syncActivity(activity: any, databaseId: string): Promise<string | null> {
    try {
      const res = await this.notionRequest("/pages", "POST", {
        parent: { database_id: databaseId },
        properties: {
          Type: { title: [{ text: { content: activity.type } }] },
          Direction: activity.direction ? { select: { name: activity.direction } } : undefined,
          Subject: activity.subject ? { rich_text: [{ text: { content: activity.subject } }] } : undefined,
          Note: activity.note ? { rich_text: [{ text: { content: activity.note } }] } : undefined,
        },
      });
      return res?.id || null;
    } catch (err) {
      console.error("Notion activity sync error:", err);
      return null;
    }
  }
}
