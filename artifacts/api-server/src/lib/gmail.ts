// Legacy shim — delegates to the per-user integration system.
// Kept for backward compatibility with existing call sites.
// New code should use: import { getEmailProvider } from "./integrations/registry"

export type { EmailAttachment, SendEmailResult } from "./integrations/types";
import { getEmailProvider } from "./integrations/registry";

export async function sendGmailEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: import("./integrations/types").EmailAttachment[],
  userId?: string,
): Promise<import("./integrations/types").SendEmailResult> {
  if (!userId) throw new Error("userId required for sendGmailEmail");
  const provider = await getEmailProvider(userId);
  if (!provider) throw new Error("No email provider connected");
  return provider.sendEmail(to, subject, body, attachments);
}

export async function getGmailHistory(startHistoryId: string, userId?: string): Promise<any> {
  if (!userId) throw new Error("userId required");
  const provider = await getEmailProvider(userId);
  if (!provider) throw new Error("No email provider connected");
  return provider.getHistory(startHistoryId);
}

export async function getGmailMessage(messageId: string, userId?: string): Promise<any> {
  if (!userId) throw new Error("userId required");
  const provider = await getEmailProvider(userId);
  if (!provider) throw new Error("No email provider connected");
  return provider.getMessage(messageId);
}

export async function getGmailProfile(userId?: string): Promise<{ email: string }> {
  if (!userId) throw new Error("userId required");
  const provider = await getEmailProvider(userId);
  if (!provider) throw new Error("No email provider connected");
  return provider.getProfile();
}

// setupGmailWatch is Gmail-specific; skip on non-Gmail providers
export async function setupGmailWatch(topicName: string, userId?: string): Promise<any> {
  if (!userId) throw new Error("userId required");
  const { GmailProvider } = await import("./integrations/email/gmail");
  const { getIntegration, getTokens, isTokenExpiringSoon } = await import("./integrations/tokenManager");
  const { google } = await import("googleapis");

  const integration = await getIntegration(userId, "gmail");
  if (!integration) throw new Error("Gmail not connected");

  const tokens = await getTokens(integration.id);
  if (!tokens) throw new Error("Gmail tokens not found");

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: tokens.accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: { topicName, labelIds: ["INBOX"] },
  });
  return res.data;
}
