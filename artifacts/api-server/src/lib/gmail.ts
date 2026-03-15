import { google } from "googleapis";

// Replit Google Mail integration — fetches credentials at runtime via connector API
let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("Gmail credentials not available");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        "Accept": "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

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

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface SendEmailResult {
  messageId: string;
  threadId: string;
  gmailLink: string;
}

export async function sendGmailEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: EmailAttachment[]
): Promise<SendEmailResult> {
  const gmail = await getUncachableGmailClient();

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
  const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

  return { messageId, threadId, gmailLink };
}

export async function getGmailHistory(startHistoryId: string) {
  const gmail = await getUncachableGmailClient();
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

export async function getGmailMessage(messageId: string) {
  const gmail = await getUncachableGmailClient();
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["From", "Subject", "Date"],
  });
  return res.data;
}

export async function setupGmailWatch(topicName: string) {
  const gmail = await getUncachableGmailClient();
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });
  return res.data;
}

export async function getGmailProfile() {
  const gmail = await getUncachableGmailClient();
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data;
}
