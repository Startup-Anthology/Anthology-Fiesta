import crypto from "crypto";
import { db, userIntegrationsTable, integrationTokensTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be set");
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv(12) + tag(16) + ciphertext — all base64
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType?: string;
  scopes?: string;
}

export async function getTokens(integrationId: number): Promise<TokenSet | null> {
  const [row] = await db
    .select()
    .from(integrationTokensTable)
    .where(eq(integrationTokensTable.integrationId, integrationId));

  if (!row) return null;

  try {
    return {
      accessToken: decryptToken(row.accessToken),
      refreshToken: row.refreshToken ? decryptToken(row.refreshToken) : undefined,
      expiresAt: row.expiresAt ?? undefined,
      tokenType: row.tokenType ?? undefined,
      scopes: row.scopes ?? undefined,
    };
  } catch (err) {
    console.error("Failed to decrypt integration tokens:", err);
    await markIntegrationError(integrationId);
    return null;
  }
}

export async function storeTokens(integrationId: number, tokens: TokenSet): Promise<void> {
  const values = {
    integrationId,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt ?? null,
    tokenType: tokens.tokenType ?? "Bearer",
    scopes: tokens.scopes ?? null,
  };

  const [existing] = await db
    .select()
    .from(integrationTokensTable)
    .where(eq(integrationTokensTable.integrationId, integrationId));

  if (existing) {
    await db
      .update(integrationTokensTable)
      .set(values)
      .where(eq(integrationTokensTable.integrationId, integrationId));
  } else {
    await db.insert(integrationTokensTable).values(values);
  }
}

// Returns true if token expires within 5 minutes
export function isTokenExpiringSoon(expiresAt?: Date): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
}

export async function markIntegrationError(integrationId: number): Promise<void> {
  await db
    .update(userIntegrationsTable)
    .set({ status: "error" })
    .where(eq(userIntegrationsTable.id, integrationId));
}

export async function markIntegrationSuccess(integrationId: number): Promise<void> {
  await db
    .update(userIntegrationsTable)
    .set({ status: "active" })
    .where(eq(userIntegrationsTable.id, integrationId));
}

export async function getIntegration(userId: string, provider: string) {
  const [row] = await db
    .select()
    .from(userIntegrationsTable)
    .where(
      and(
        eq(userIntegrationsTable.userId, userId),
        eq(userIntegrationsTable.provider, provider),
        eq(userIntegrationsTable.status, "active"),
      )
    );
  return row ?? null;
}
