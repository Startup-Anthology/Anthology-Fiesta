import { google } from "googleapis";
import type { EmailProvider, EmailAttachment, SendEmailResult } from "../types";

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n\\]/g, "_").trim();
}

function sanitizeMimeType(type: string): string {
  return type.replace(/[^\w/.\-+]/g, "").trim() || "application/octet-stream";
}

function generateBoundary(): string {
  return "boundary_" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export class GmailProvider implements EmailProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private getClient() {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: this.accessToken });
    return google.gmail({ version: "v1", auth: oauth2Client });
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
  ): Promise<SendEmailResult> {
    const gmail = this.getClient();
    const safeTo = sanitizeHeader(to);
    const safeSubject = sanitizeHeader(subject);

    let raw: string;

    if (attachments && attachments.length > 0) {
      const boundary = generateBoundary();
      let mimeMessage = `To: ${safeTo}\r\nSubject: ${safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
      mimeMessage += `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;

      for (const att of attachments) {
        const b64 = att.content.toString("base64");
        const safeName = sanitizeFilename(att.filename);
        const safeType = sanitizeMimeType(att.mimeType);
        mimeMessage += `--${boundary}\r\nContent-Type: ${safeType}; name="${safeName}"\r\nContent-Disposition: attachment; filename="${safeName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`;
      }
      mimeMessage += `--${boundary}--`;
      raw = Buffer.from(mimeMessage).toString("base64url");
    } else {
      raw = Buffer.from(
        `To: ${safeTo}\r\nSubject: ${safeSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      ).toString("base64url");
    }

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const messageId = response.data.id || "";
    const threadId = response.data.threadId || "";
    return {
      messageId,
      threadId,
      link: `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
    };
  }

  async getHistory(startHistoryId: string): Promise<any> {
    const gmail = this.getClient();
    try {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
      });
      return res.data;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  async getMessage(messageId: string): Promise<any> {
    const gmail = this.getClient();
    const res = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    return res.data;
  }

  async getProfile(): Promise<{ email: string }> {
    const gmail = this.getClient();
    const res = await gmail.users.getProfile({ userId: "me" });
    return { email: res.data.emailAddress || "" };
  }
}
