import type { EmailProvider, EmailAttachment, SendEmailResult } from "../types";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export class OutlookEmailProvider implements EmailProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async graphRequest(path: string, method: string, body?: unknown): Promise<any> {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Graph API error ${res.status}: ${text}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
  ): Promise<SendEmailResult> {
    const message: Record<string, unknown> = {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    };

    if (attachments && attachments.length > 0) {
      message.attachments = attachments.map((att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.filename,
        contentType: att.mimeType,
        contentBytes: att.content.toString("base64"),
      }));
    }

    const res = await this.graphRequest("/me/sendMail", "POST", { message });
    // Graph sendMail returns 202 with no body; we generate a placeholder ID
    const messageId = `outlook_${Date.now()}`;
    return { messageId, threadId: messageId, link: "https://outlook.live.com/mail" };
  }

  async getHistory(_startHistoryId: string): Promise<any> {
    // Microsoft Graph doesn't have a direct equivalent; return null
    return null;
  }

  async getMessage(messageId: string): Promise<any> {
    return this.graphRequest(`/me/messages/${messageId}`, "GET");
  }

  async getProfile(): Promise<{ email: string }> {
    const data = await this.graphRequest("/me", "GET");
    return { email: data.mail || data.userPrincipalName || "" };
  }
}
