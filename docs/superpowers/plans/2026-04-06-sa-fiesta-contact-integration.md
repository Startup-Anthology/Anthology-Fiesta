# SA → Fiesta Contact Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing webhook code so contact form submissions on StartupAnthology.com (horizon-marketing) create leads in Fiesta CRM, add a dedup-safe leads unique index, and add a lead→contact conversion endpoint.

**Architecture:** horizon-marketing fires a POST webhook after each contact form submission; Fiesta receives it and upserts a lead only (not a contact). A new `POST /api/leads/:id/convert` endpoint in Fiesta converts a qualified lead into a contact record and marks the lead as `"converted"`.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM, PostgreSQL, Expo/React Native, Vitest, Supertest. Two repos: `Anthology-Fiesta` (API + mobile) and `horizon-marketing`.

---

## File Map

### Anthology-Fiesta

| File | Change |
|---|---|
| `lib/db/src/schema/leads.ts` | Add `uniqueIndex("idx_leads_user_email")` |
| `scripts/dedup-leads.ts` | New — dedup migration script (run before db push) |
| `artifacts/api-server/src/lib/saSync.ts` | Harden `getDefaultUserId`, prepend notes, remove contacts upsert from `runSASync` |
| `artifacts/api-server/src/routes/saWebhook.ts` | Remove `upsertSAContacts`, add `SA_DEFAULT_USER_ID` check, simplify response |
| `artifacts/api-server/src/lib/validation.ts` | Add `convertLeadSchema` |
| `artifacts/api-server/src/routes/leads.ts` | Add `POST /leads/:id/convert` handler |
| `artifacts/api-server/src/routes/index.ts` | No change needed — `leadsRouter` already registered |
| `lib/api-spec/openapi.yaml` | Add `/leads/{id}/convert` path + `ConvertLead` / `ConvertLeadResponse` schemas |
| `artifacts/mobile/lib/api.ts` | Add `convertLead` method |
| `artifacts/mobile/app/lead/[id].tsx` | Add Convert button + mutation |
| `artifacts/mobile/app/(tabs)/funnel.tsx` | Filter `status === "converted"` leads client-side |
| `artifacts/api-server/package.json` | Add `vitest`, `supertest`, `@types/supertest`; add `test` script |
| `artifacts/api-server/vitest.config.ts` | New — Vitest config |
| `artifacts/api-server/src/test/saSync.test.ts` | New — unit tests |
| `artifacts/api-server/src/test/saWebhook.test.ts` | New — webhook HTTP tests |
| `artifacts/api-server/src/test/leadsConvert.test.ts` | New — convert endpoint HTTP tests |
| `.github/workflows/ci.yml` | Add `test-api` job |

### horizon-marketing

| File | Change |
|---|---|
| `drizzle/schema.ts` | Add `fiestaNotified` boolean to `contactFormSubmissions` |
| `server/contactAutomation.ts` | Await Fiesta webhook, update `fiestaNotified` flag on 2xx |
| `.env.example` | Document `FIESTA_WEBHOOK_URL` and `FIESTA_WEBHOOK_SECRET` |

---

## Task 1: Harden `saSync.ts` — require SA_DEFAULT_USER_ID, prepend notes, remove contacts upsert

**Files:**
- Modify: `artifacts/api-server/src/lib/saSync.ts`

- [ ] **Step 1: Write the failing unit tests first**

Create `artifacts/api-server/src/test/saSync.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We test exported helpers — pull them in after mocking db
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
  leadsTable: {},
  contactsTable: {},
  usersTable: {},
}));

// Import after mocking
const { buildLeadNotes, mapTopicToStatus } = await import("../lib/saSync.js");

describe("buildLeadNotes", () => {
  it("formats a full submission with no existing notes", () => {
    const result = buildLeadNotes(
      { name: "Alice", email: "alice@acme.com", message: "I want a demo", topic: "demo_request", company: "Acme Corp", phone: "555-1234", leadScore: 85 },
      null
    );
    expect(result).toBe(
      "[Topic: Demo Request]\nCompany: Acme Corp\nPhone: 555-1234\nLead Score: 85/100\n\nI want a demo"
    );
  });

  it("prepends new notes above existing notes with separator", () => {
    const result = buildLeadNotes(
      { name: "Alice", email: "alice@acme.com", message: "Follow-up question", topic: "support" },
      "Old manually entered notes"
    );
    expect(result).toBe(
      "[Topic: Support]\n\nFollow-up question\n\n---\n\nOld manually entered notes"
    );
  });

  it("omits Company/Phone/Lead Score lines when not provided", () => {
    const result = buildLeadNotes(
      { name: "Bob", email: "bob@b.com", message: "Hello", topic: "other" },
      null
    );
    expect(result).toBe("[Topic: Other]\n\nHello");
  });
});

describe("mapTopicToStatus", () => {
  it("returns qualified for demo_request", () => {
    expect(mapTopicToStatus("demo_request")).toBe("qualified");
  });
  it("returns qualified for partnership", () => {
    expect(mapTopicToStatus("partnership")).toBe("qualified");
  });
  it("returns new for other topics", () => {
    expect(mapTopicToStatus("support")).toBe("new");
    expect(mapTopicToStatus("feedback")).toBe("new");
    expect(mapTopicToStatus("other")).toBe("new");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
pnpm --filter api-server test
```

Expected: Cannot find `buildLeadNotes` / `mapTopicToStatus` as named exports (they are currently internal functions).

- [ ] **Step 3: Update `saSync.ts`**

Replace the entire file content of `artifacts/api-server/src/lib/saSync.ts`:

```typescript
import { db } from "@workspace/db";
import { leadsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { fireAndForgetLeadSync } from "./notionSync";
import { logAudit } from "./audit";

interface SASubmission {
  id?: number;
  name: string;
  email: string;
  message: string;
  topic: string;
  company?: string | null;
  phone?: string | null;
  leadScore?: number;
  priority?: string;
  status?: string;
  submittedAt?: string;
}

interface SyncSummary {
  leads: { created: number; updated: number; errors: string[] };
}

function getSAConfig() {
  const apiKey = process.env.SA_CRM_API_KEY;
  const baseUrl = process.env.SA_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("SA sync not configured: SA_CRM_API_KEY and SA_BASE_URL are required");
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
}

export function isSAConfigured(): boolean {
  const pullSyncReady = !!(process.env.SA_CRM_API_KEY && process.env.SA_BASE_URL);
  const webhookReady = !!process.env.SA_WEBHOOK_SECRET;
  return pullSyncReady || webhookReady;
}

export async function fetchSAContacts(since?: string): Promise<SASubmission[]> {
  const { apiKey, baseUrl } = getSAConfig();
  const url = since
    ? `${baseUrl}/api/crm/contacts?since=${encodeURIComponent(since)}`
    : `${baseUrl}/api/crm/contacts`;
  const res = await fetch(url, {
    headers: { "X-CRM-API-KEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("SA API authentication failed (401)");
    if (res.status === 429) throw new Error("SA API rate limited (429). Try again later.");
    const contentType = res.headers.get("content-type") ?? "";
    if (res.status === 403 && (contentType.includes("text/html") || text.includes("Just a moment"))) {
      throw new Error(
        "SA API blocked by Cloudflare bot protection (403). " +
        "Add a WAF bypass rule in the Cloudflare dashboard for startupanthology.com: " +
        "skip managed challenges when path matches /api/crm/* or when X-CRM-API-KEY header is present."
      );
    }
    throw new Error(`SA contacts API error ${res.status}: ${text.slice(0, 200) || "Unknown error"}`);
  }
  return res.json() as Promise<SASubmission[]>;
}

async function getDefaultUserId(): Promise<string> {
  const configured = process.env.SA_DEFAULT_USER_ID;
  if (!configured) {
    throw new Error(
      "SA_DEFAULT_USER_ID is not configured. Set this env var to the UUID of the Fiesta user who owns SA inbound leads."
    );
  }
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, configured))
    .limit(1);
  if (!user) {
    throw new Error(`SA_DEFAULT_USER_ID user not found: ${configured}`);
  }
  return user.id;
}

export function topicLabel(topic: string): string {
  return topic.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function buildLeadNotes(sub: SASubmission, existingNotes?: string | null): string {
  const parts: string[] = [`[Topic: ${topicLabel(sub.topic)}]`];
  if (sub.company) parts.push(`Company: ${sub.company}`);
  if (sub.phone) parts.push(`Phone: ${sub.phone}`);
  if (sub.leadScore != null) parts.push(`Lead Score: ${sub.leadScore}/100`);
  parts.push("", sub.message);
  const newNotes = parts.join("\n");
  if (existingNotes) {
    return `${newNotes}\n\n---\n\n${existingNotes}`;
  }
  return newNotes;
}

export function mapTopicToStatus(topic: string): string {
  if (topic === "demo_request" || topic === "partnership") return "qualified";
  return "new";
}

export async function upsertSALeads(
  submissions: SASubmission[],
  assignToUserId?: string,
): Promise<{ created: number; updated: number; errors: string[] }> {
  const userId = assignToUserId || await getDefaultUserId();

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const sub of submissions) {
    try {
      if (!sub.email) {
        errors.push(`Skipped submission ${sub.id}: no email`);
        continue;
      }

      const [existing] = await db
        .select()
        .from(leadsTable)
        .where(and(eq(leadsTable.email, sub.email), eq(leadsTable.userId, userId)))
        .limit(1);

      const notes = buildLeadNotes(sub, existing?.notes);

      if (existing) {
        const [updatedLead] = await db
          .update(leadsTable)
          .set({ name: sub.name, notes, source: "startupanthology", updatedAt: new Date() })
          .where(and(eq(leadsTable.id, existing.id), eq(leadsTable.userId, userId)))
          .returning();
        logAudit("lead", existing.id, "update", userId, existing as Record<string, unknown>, updatedLead as Record<string, unknown>);
        fireAndForgetLeadSync(updatedLead);
        updated++;
      } else {
        const [lead] = await db
          .insert(leadsTable)
          .values({
            name: sub.name,
            email: sub.email,
            source: "startupanthology",
            status: mapTopicToStatus(sub.topic),
            notes,
            userId,
          })
          .returning();
        logAudit("lead", lead.id, "create", userId, null, lead as Record<string, unknown>);
        fireAndForgetLeadSync(lead);
        created++;
      }
    } catch (err: any) {
      errors.push(`Submission ${sub.email || sub.id}: ${err.message}`);
    }
  }

  return { created, updated, errors };
}

export async function runSASync(assignToUserId?: string, since?: string): Promise<SyncSummary> {
  const submissions = await fetchSAContacts(since);
  const leads = await upsertSALeads(submissions, assignToUserId);
  return { leads };
}
```

- [ ] **Step 4: Run tests — they should now pass**

```bash
pnpm --filter api-server test
```

Expected: all 7 `saSync` tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
git add artifacts/api-server/src/lib/saSync.ts artifacts/api-server/src/test/saSync.test.ts
git commit -m "feat: harden saSync — require SA_DEFAULT_USER_ID, prepend notes, remove contacts upsert"
```

---

## Task 2: Set up Vitest + Supertest in api-server

**Files:**
- Modify: `artifacts/api-server/package.json`
- Create: `artifacts/api-server/vitest.config.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
pnpm --filter api-server add -D vitest supertest @types/supertest
```

- [ ] **Step 2: Create Vitest config**

Create `artifacts/api-server/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `artifacts/api-server/package.json`, add `"test": "vitest run"` to the `scripts` object:

```json
{
  "scripts": {
    "dev": "pnpm run lint && NODE_ENV=development node --env-file=../../.env --import tsx/esm ./src/index.ts",
    "dev:fast": "NODE_ENV=development node --env-file=../../.env --import tsx/esm ./src/index.ts",
    "build": "tsx ./build.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint src",
    "check": "pnpm run lint",
    "check:full": "pnpm -w run typecheck:libs && pnpm run typecheck && pnpm run lint",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Verify existing saSync tests still run**

```bash
pnpm --filter api-server test
```

Expected: 7 saSync tests pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/package.json artifacts/api-server/vitest.config.ts
git commit -m "chore: add Vitest + Supertest to api-server"
```

---

## Task 3: Update `saWebhook.ts` — leads only, SA_DEFAULT_USER_ID check

**Files:**
- Modify: `artifacts/api-server/src/routes/saWebhook.ts`
- Create: `artifacts/api-server/src/test/saWebhook.test.ts`

- [ ] **Step 1: Write the failing webhook tests**

Create `artifacts/api-server/src/test/saWebhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock saSync before importing the router
vi.mock("../lib/saSync.js", () => ({
  upsertSALeads: vi.fn(),
}));

const { upsertSALeads } = await import("../lib/saSync.js");
const saWebhookRouter = (await import("../routes/saWebhook.js")).default;

const app = express();
app.use(express.json());
app.use(saWebhookRouter);

const validPayload = {
  name: "Alice",
  email: "alice@example.com",
  message: "I want a demo",
  topic: "demo_request",
};

beforeEach(() => {
  vi.stubEnv("SA_WEBHOOK_SECRET", "test-secret");
  vi.stubEnv("SA_DEFAULT_USER_ID", "user-uuid-123");
  vi.mocked(upsertSALeads).mockResolvedValue({ created: 1, updated: 0, errors: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /webhooks/sa/contact", () => {
  it("returns 401 when x-api-key header is missing", async () => {
    const res = await request(app).post("/webhooks/sa/contact").send(validPayload);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid API key");
  });

  it("returns 401 when x-api-key header is wrong", async () => {
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "wrong-secret")
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it("returns 503 when SA_WEBHOOK_SECRET is not set", async () => {
    vi.stubEnv("SA_WEBHOOK_SECRET", "");
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Webhook not configured");
  });

  it("returns 503 when SA_DEFAULT_USER_ID is not set", async () => {
    vi.stubEnv("SA_DEFAULT_USER_ID", "");
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("SA_DEFAULT_USER_ID not configured");
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send({ name: "Alice" }); // missing email, message, topic
    expect(res.status).toBe(400);
  });

  it("returns 201 when a new lead is created", async () => {
    vi.mocked(upsertSALeads).mockResolvedValue({ created: 1, updated: 0, errors: [] });
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ lead: { action: "created" } });
  });

  it("returns 200 when an existing lead is updated", async () => {
    vi.mocked(upsertSALeads).mockResolvedValue({ created: 0, updated: 1, errors: [] });
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lead: { action: "updated" } });
  });

  it("returns 500 when upsertSALeads throws", async () => {
    vi.mocked(upsertSALeads).mockRejectedValue(new Error("DB connection failed"));
    const res = await request(app)
      .post("/webhooks/sa/contact")
      .set("x-api-key", "test-secret")
      .send(validPayload);
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter api-server test
```

Expected: `saWebhook` tests fail — handler still calls `upsertSAContacts`, response still has `contact` key.

- [ ] **Step 3: Update `saWebhook.ts`**

Replace the full content of `artifacts/api-server/src/routes/saWebhook.ts`:

```typescript
import { Router, type Request, type Response } from "express";
import { upsertSALeads } from "../lib/saSync";
import { validate, saContactSchema } from "../lib/validation";

const router = Router();

function verifyApiKey(req: Request, res: Response): boolean {
  const secret = process.env.SA_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Webhook not configured" });
    return false;
  }
  const provided = req.headers["x-api-key"];
  if (provided !== secret) {
    res.status(401).json({ error: "Invalid API key" });
    return false;
  }
  return true;
}

router.post("/webhooks/sa/contact", async (req: Request, res: Response) => {
  try {
    if (!verifyApiKey(req, res)) return;

    if (!process.env.SA_DEFAULT_USER_ID) {
      res.status(503).json({ error: "SA_DEFAULT_USER_ID not configured" });
      return;
    }

    const data = validate(saContactSchema, req.body);

    const leadsResult = await upsertSALeads([data]);

    const leadAction = leadsResult.created > 0 ? "created" : "updated";

    res.status(leadsResult.created > 0 ? 201 : 200).json({
      lead: { action: leadAction },
    });
  } catch (err: any) {
    console.error("SA contact webhook error:", err.message);
    if (err.statusCode === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
```

- [ ] **Step 4: Run tests — all should pass**

```bash
pnpm --filter api-server test
```

Expected: all 15 tests pass (7 saSync + 8 saWebhook).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/saWebhook.ts artifacts/api-server/src/test/saWebhook.test.ts
git commit -m "feat: webhook creates lead only, require SA_DEFAULT_USER_ID"
```

---

## Task 4: Add `convertLeadSchema` to validation and `POST /leads/:id/convert` route

**Files:**
- Modify: `artifacts/api-server/src/lib/validation.ts`
- Modify: `artifacts/api-server/src/routes/leads.ts`
- Create: `artifacts/api-server/src/test/leadsConvert.test.ts`

- [ ] **Step 1: Write the failing convert endpoint tests**

Create `artifacts/api-server/src/test/leadsConvert.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock db and auth middleware
vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  leadsTable: { id: "id", userId: "userId", email: "email", status: "status" },
  contactsTable: { id: "id", userId: "userId", email: "email" },
}));

vi.mock("../lib/notionSync.js", () => ({
  fireAndForgetLeadSync: vi.fn(),
  fireAndForgetContactSync: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  logAudit: vi.fn(),
}));

// Import after mocks
const leadsRouter = (await import("../routes/leads.js")).default;

// Fake auth middleware
const app = express();
app.use(express.json());
app.use((req: any, _res: any, next: any) => {
  req.user = { id: "user-1" };
  next();
});
app.use(leadsRouter);

// Error handler matching production shape
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err.statusCode) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
});

const { db } = await import("@workspace/db");

function mockDbChain(returnValue: any) {
  const chain: any = { from: vi.fn(), where: vi.fn(), limit: vi.fn(), returning: vi.fn(), set: vi.fn(), values: vi.fn() };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(returnValue);
  chain.returning.mockResolvedValue(returnValue);
  chain.set.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  return chain;
}

const fakeLead = { id: 1, userId: "user-1", name: "Alice", email: "alice@example.com", status: "qualified", notes: null };
const fakeContact = { id: 10, userId: "user-1", name: "Alice", email: "alice@example.com", relationshipType: "customer", priority: "medium", company: null, phone: null };
const fakeUpdatedLead = { ...fakeLead, status: "converted" };

describe("POST /leads/:id/convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when lead is not found", async () => {
    vi.mocked(db.select).mockReturnValue(mockDbChain([]));
    const res = await request(app).post("/leads/99/convert").send({});
    expect(res.status).toBe(404);
  });

  it("returns 409 when lead is already converted", async () => {
    vi.mocked(db.select).mockReturnValueOnce(mockDbChain([{ ...fakeLead, status: "converted" }]));
    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Lead already converted");
  });

  it("returns 409 when a contact with the same email already exists", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(mockDbChain([fakeLead]))   // findOwned lead
      .mockReturnValueOnce(mockDbChain([fakeContact])); // contact exists check
    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Contact already exists for this email");
  });

  it("returns 200 with lead and contact on happy path (no body)", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(mockDbChain([fakeLead]))  // findOwned lead
      .mockReturnValueOnce(mockDbChain([]));          // no existing contact
    vi.mocked(db.insert).mockReturnValue(mockDbChain([fakeContact]));
    vi.mocked(db.update).mockReturnValue(mockDbChain([fakeUpdatedLead]));

    const res = await request(app).post("/leads/1/convert").send({});
    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe("converted");
    expect(res.body.contact.relationshipType).toBe("customer");
    expect(res.body.contact.priority).toBe("medium");
  });

  it("passes company and phone from body to the new contact", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(mockDbChain([fakeLead]))
      .mockReturnValueOnce(mockDbChain([]));
    const insertChain = mockDbChain([{ ...fakeContact, company: "Acme", phone: "555-0000" }]);
    vi.mocked(db.insert).mockReturnValue(insertChain);
    vi.mocked(db.update).mockReturnValue(mockDbChain([fakeUpdatedLead]));

    const res = await request(app)
      .post("/leads/1/convert")
      .send({ company: "Acme", phone: "555-0000" });
    expect(res.status).toBe(200);
    expect(res.body.contact.company).toBe("Acme");
    expect(res.body.contact.phone).toBe("555-0000");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter api-server test
```

Expected: `leadsConvert` tests fail — route does not exist yet.

- [ ] **Step 3: Add `convertLeadSchema` to `validation.ts`**

Add at the end of `artifacts/api-server/src/lib/validation.ts`:

```typescript
export const convertLeadSchema = z.object({
  company: z.string().nullish(),
  phone: z.string().nullish(),
  relationshipType: z.string().optional(),
  priority: z.string().optional(),
});
```

- [ ] **Step 4: Add convert handler to `leads.ts`**

Add the following imports to the top of `artifacts/api-server/src/routes/leads.ts`, updating the existing import lines:

```typescript
import { leadsTable, triggerRulesTable, dripEnrollmentsTable, activitiesTable, contactsTable } from "@workspace/db";
```

```typescript
import { validate, createLeadSchema, updateLeadSchema, updateStatusSchema, convertLeadSchema } from "../lib/validation";
```

```typescript
import { fireAndForgetLeadSync, fireAndForgetActivitySync, fireAndForgetContactSync } from "../lib/notionSync";
```

Then add this route at the bottom of `artifacts/api-server/src/routes/leads.ts`, before `export default router;`:

```typescript
router.post("/leads/:id/convert", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const leadId = parseIntParam(req.params.id);
    const body = validate(convertLeadSchema, req.body);

    const lead = await findOwned(leadsTable, leadId, userId);

    if ((lead.status as string) === "converted") {
      res.status(409).json({ error: "Lead already converted" });
      return;
    }

    const [existingContact] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.email, lead.email as string), eq(contactsTable.userId, userId)))
      .limit(1);

    if (existingContact) {
      res.status(409).json({ error: "Contact already exists for this email" });
      return;
    }

    const [contact] = await db
      .insert(contactsTable)
      .values({
        name: lead.name as string,
        email: lead.email as string,
        notes: lead.notes as string | null ?? null,
        userId,
        relationshipType: body.relationshipType ?? "customer",
        priority: body.priority ?? "medium",
        company: body.company ?? null,
        phone: body.phone ?? null,
      })
      .returning();

    const [updatedLead] = await db
      .update(leadsTable)
      .set({ status: "converted", updatedAt: new Date() })
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.userId, userId)))
      .returning();

    logAudit("lead", leadId, "update", userId, lead as Record<string, unknown>, updatedLead as Record<string, unknown>);
    logAudit("contact", contact.id, "create", userId, null, contact as Record<string, unknown>);
    fireAndForgetContactSync(contact);
    fireAndForgetLeadSync(updatedLead);

    res.json({ lead: updatedLead, contact });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Run all tests — all should pass**

```bash
pnpm --filter api-server test
```

Expected: all tests pass (7 saSync + 8 saWebhook + 5 leadsConvert).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/validation.ts artifacts/api-server/src/routes/leads.ts artifacts/api-server/src/test/leadsConvert.test.ts
git commit -m "feat: add POST /leads/:id/convert endpoint"
```

---

## Task 5: Add leads unique index + dedup migration script

**Files:**
- Modify: `lib/db/src/schema/leads.ts`
- Create: `scripts/dedup-leads.ts`

- [ ] **Step 1: Create the dedup script**

Create `scripts/dedup-leads.ts`:

```typescript
/**
 * Dedup leads by (email, userId) — must be run BEFORE db push adds the unique index.
 *
 * Usage: node --env-file=.env --import tsx/esm scripts/dedup-leads.ts
 *
 * Pass --execute to actually make changes (dry-run by default).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const isDryRun = !process.argv.includes("--execute");

if (isDryRun) {
  console.log("DRY RUN — pass --execute to commit changes\n");
} else {
  console.log("EXECUTE MODE — changes will be committed\n");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Step 1: Find duplicates
const dupsResult = await client.query(`
  SELECT email, user_id, COUNT(*) as cnt, array_agg(id ORDER BY updated_at DESC) as ids
  FROM leads
  GROUP BY email, user_id
  HAVING COUNT(*) > 1
`);

if (dupsResult.rows.length === 0) {
  console.log("No duplicate leads found. Safe to run db push.");
  await client.end();
  process.exit(0);
}

console.log(`Found ${dupsResult.rows.length} duplicate group(s):\n`);
for (const row of dupsResult.rows) {
  const [winner, ...losers] = row.ids as number[];
  console.log(`  email=${row.email} userId=${row.user_id} — keep id=${winner}, remove ids=${losers.join(",")}`);
}

if (isDryRun) {
  console.log("\nDry run complete. Run with --execute to apply.");
  await client.end();
  process.exit(0);
}

// Step 2: Execute inside a transaction
await client.query("BEGIN");
try {
  for (const row of dupsResult.rows) {
    const [winner, ...losers] = row.ids as number[];
    if (losers.length === 0) continue;
    const loserList = losers.join(",");

    // Re-point child records to winner before deleting losers
    await client.query(`UPDATE activities SET lead_id = $1 WHERE lead_id = ANY(ARRAY[${loserList}]::int[])`, [winner]);
    await client.query(`UPDATE calendar_events SET lead_id = $1 WHERE lead_id = ANY(ARRAY[${loserList}]::int[])`, [winner]);
    await client.query(`UPDATE drip_enrollments SET lead_id = $1 WHERE lead_id = ANY(ARRAY[${loserList}]::int[])`, [winner]);
    await client.query(`UPDATE ai_insights SET lead_id = $1 WHERE lead_id = ANY(ARRAY[${loserList}]::int[])`, [winner]);
    await client.query(`UPDATE lead_files SET lead_id = $1 WHERE lead_id = ANY(ARRAY[${loserList}]::int[])`, [winner]);

    // Delete loser rows
    await client.query(`DELETE FROM leads WHERE id = ANY(ARRAY[${loserList}]::int[])`);
    console.log(`  Merged losers [${loserList}] into winner ${winner}`);
  }
  await client.query("COMMIT");
  console.log("\nDedup complete. Now run: pnpm --filter db push");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Error during dedup — rolled back:", err);
  process.exit(1);
}

await client.end();
```

- [ ] **Step 2: Run the dry-run to check for duplicates**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
node --env-file=.env --import tsx/esm scripts/dedup-leads.ts
```

Expected: either "No duplicate leads found. Safe to run db push." OR a list of duplicates. If duplicates exist, run with `--execute`:

```bash
node --env-file=.env --import tsx/esm scripts/dedup-leads.ts --execute
```

- [ ] **Step 3: Add unique index to `leads.ts`**

In `lib/db/src/schema/leads.ts`, update the imports and table definition:

```typescript
import { index, uniqueIndex, pgTable, serial, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  source: text("source").notNull().default("other"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  linkedinUrl: text("linkedin_url"),
  profilePictureUrl: text("profile_picture_url"),
  isBeta: boolean("is_beta").notNull().default(false),
  notionPageId: text("notion_page_id"),
  userId: varchar("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_leads_user_id").on(table.userId),
  index("idx_leads_email").on(table.email),
  index("idx_leads_status").on(table.status),
  uniqueIndex("idx_leads_user_email").on(table.userId, table.email),
]);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
```

- [ ] **Step 4: Push the schema change to the database**

```bash
pnpm --filter db push
```

Expected: Drizzle applies the new unique index. If it errors with "duplicate key" — the dedup script from Step 2 did not run successfully. Re-run with `--execute` first.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/leads.ts scripts/dedup-leads.ts
git commit -m "feat: add unique index on leads(userId, email) + dedup script"
```

---

## Task 6: Add `POST /leads/{id}/convert` to OpenAPI spec + regenerate hooks

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Add the path and schemas to openapi.yaml**

In `lib/api-spec/openapi.yaml`, add the new path after `/leads/{id}/status`:

```yaml
  /leads/{id}/convert:
    post:
      operationId: convertLead
      tags: [leads]
      summary: Convert a qualified lead into a contact
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ConvertLead"
      responses:
        "200":
          description: Lead converted to contact
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConvertLeadResponse"
        "404":
          description: Lead not found
        "409":
          description: Already converted or contact already exists
```

In the `components/schemas` section, add after `UpdateLead`:

```yaml
    ConvertLead:
      type: object
      properties:
        company:
          type: string
          nullable: true
        phone:
          type: string
          nullable: true
        relationshipType:
          type: string
        priority:
          type: string

    ConvertLeadResponse:
      type: object
      required: [lead, contact]
      properties:
        lead:
          $ref: "#/components/schemas/Lead"
        contact:
          $ref: "#/components/schemas/Contact"
```

- [ ] **Step 2: Regenerate React Query hooks**

```bash
pnpm --filter api-spec codegen
```

Expected: `lib/api-client-react` is updated with a `useConvertLead` mutation hook.

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-client-react/
git commit -m "feat: add convertLead to OpenAPI spec, regenerate hooks"
```

---

## Task 7: Mobile — Convert button on lead detail screen + filter pipeline

**Files:**
- Modify: `artifacts/mobile/lib/api.ts`
- Modify: `artifacts/mobile/app/lead/[id].tsx`
- Modify: `artifacts/mobile/app/(tabs)/funnel.tsx`

- [ ] **Step 1: Add `convertLead` to `api.ts`**

In `artifacts/mobile/lib/api.ts`, add after the `updateLeadStatus` line:

```typescript
  convertLead: (id: number, data?: { company?: string | null; phone?: string | null; relationshipType?: string; priority?: string }) =>
    request(`/leads/${id}/convert`, { method: "POST", body: JSON.stringify(data ?? {}) }),
```

- [ ] **Step 2: Add Convert mutation + button to `lead/[id].tsx`**

Add the convert mutation after `deleteMut` in `artifacts/mobile/app/lead/[id].tsx` (around line 94):

```typescript
  const convertMut = useMutation({
    mutationFn: () => api.convertLead(leadId),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      router.replace({ pathname: "/contact/[id]", params: { id: String(data.contact.id) } });
    },
    onError: (err: Error) => {
      if (err.message === "Lead already converted") {
        showAlert("Already converted", "This lead has already been converted to a contact.");
      } else if (err.message === "Contact already exists for this email") {
        showAlert("Contact exists", "A contact with this email already exists.");
      } else {
        showAlert("Conversion failed", err.message);
      }
    },
  });
```

Add a Convert button in the `actionRow` View (after the "Log LI" Pressable, around line 349):

```typescript
        {lead.status !== "converted" && (
          <Pressable
            style={styles.actionBtn}
            onPress={() => showAlert(
              "Convert to contact?",
              "This will mark the lead as converted and create a contact record.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Convert", onPress: () => convertMut.mutate() },
              ]
            )}
            disabled={convertMut.isPending}
          >
            <Feather name="user-check" size={18} color={colors.accent} />
            <Text style={styles.actionText}>{convertMut.isPending ? "Converting..." : "Convert"}</Text>
          </Pressable>
        )}
```

- [ ] **Step 3: Filter converted leads from pipeline in `funnel.tsx`**

In `artifacts/mobile/app/(tabs)/funnel.tsx`, find `filteredLeads` around line 196:

```typescript
  const filteredLeads = params.filter === "week"
    ? leads.filter((l: any) => new Date(l.createdAt) >= weekAgo)
    : leads;
```

Replace it with:

```typescript
  const filteredLeads = (params.filter === "week"
    ? leads.filter((l: any) => new Date(l.createdAt) >= weekAgo)
    : leads
  ).filter((l: any) => l.status !== "converted");
```

This is the only change needed — `filteredLeads` is already used everywhere in both kanban and list view rendering.

- [ ] **Step 4: Run lint + typecheck**

```bash
pnpm run lint
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/lib/api.ts artifacts/mobile/app/lead/\[id\].tsx artifacts/mobile/app/\(tabs\)/funnel.tsx
git commit -m "feat: add Convert to Contact button on lead screen, filter converted from pipeline"
```

---

## Task 8: Add `test-api` job to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read the current CI config**

```bash
cat /Users/gentlecoma/Documents/Anthology-Fiesta/.github/workflows/ci.yml
```

- [ ] **Step 2: Add `test-api` job**

In `.github/workflows/ci.yml`, add a new job after the existing `api-server` job:

```yaml
  test-api:
    needs: api-server
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api-server test
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add test-api job running Vitest after api-server lint"
```

---

## Task 9: horizon-marketing — `fiestaNotified` column + update webhook code

**Repo:** `/Users/gentlecoma/Documents/horizon-marketing`

**Files:**
- Modify: `drizzle/schema.ts`
- Modify: `server/contactAutomation.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `fiestaNotified` column to schema**

In `/Users/gentlecoma/Documents/horizon-marketing/drizzle/schema.ts`, add `fiestaNotified` to `contactFormSubmissions` after `ownerNotified`:

```typescript
    ownerNotified: boolean("ownerNotified").default(false).notNull(),
    fiestaNotified: boolean("fiestaNotified").default(false).notNull(),
```

- [ ] **Step 2: Push schema to database**

```bash
cd /Users/gentlecoma/Documents/horizon-marketing
pnpm drizzle-kit push
```

Expected: Drizzle adds the `fiestaNotified` column with `DEFAULT false`.

- [ ] **Step 3: Update the Fiesta webhook block in `contactAutomation.ts`**

In `/Users/gentlecoma/Documents/horizon-marketing/server/contactAutomation.ts`, replace lines 284–314 (the existing Fiesta CRM webhook block) with:

```typescript
  // 6. Fiesta CRM webhook — awaited to capture sync status
  try {
    const fiestaWebhookUrl = process.env.FIESTA_WEBHOOK_URL;
    const fiestaWebhookSecret = process.env.FIESTA_WEBHOOK_SECRET;
    if (fiestaWebhookUrl && fiestaWebhookSecret) {
      const fiestaRes = await fetch(fiestaWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": fiestaWebhookSecret,
        },
        body: JSON.stringify({
          name: submission.name,
          email: submission.email,
          message: submission.message,
          topic: submission.topic,
          company: submission.company,
          phone: submission.phone,
          leadScore: results.leadScore,
          priority: results.priority,
        }),
      });
      if (fiestaRes.ok) {
        await db
          .update(contactFormSubmissions)
          .set({ fiestaNotified: true })
          .where(eq(contactFormSubmissions.id, submission.id));
        results.fiestaNotified = true;
        logger.info("[Automation] Fiesta CRM lead created/updated");
      } else {
        logger.error({ status: fiestaRes.status }, "[Automation] Fiesta CRM webhook returned error");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "[Automation] Fiesta CRM webhook failed");
  }
```

Note: `eq` is already imported from `drizzle-orm` in this file. Verify `contactFormSubmissions` is in scope (it is — it's the table variable used throughout the file).

- [ ] **Step 4: Update `.env.example`**

In `/Users/gentlecoma/Documents/horizon-marketing/.env.example`, add at the end:

```
# Fiesta CRM webhook integration
FIESTA_WEBHOOK_URL=        # Fiesta webhook endpoint (POST /api/webhooks/sa/contact)
FIESTA_WEBHOOK_SECRET=     # Shared secret — must match SA_WEBHOOK_SECRET in Fiesta
```

- [ ] **Step 5: Commit in horizon-marketing**

```bash
cd /Users/gentlecoma/Documents/horizon-marketing
git add drizzle/schema.ts server/contactAutomation.ts .env.example
git commit -m "feat: add fiestaNotified tracking, await Fiesta webhook response"
```

---

## Task 10: Configure environment variables

This task has no code changes — it's configuring secrets. Do it in both environments.

**Local (Anthology-Fiesta):**

- [ ] **Step 1: Generate a shared secret**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output — this is your shared secret.

- [ ] **Step 2: Get your Fiesta user UUID**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
node --env-file=.env --import tsx/esm -e "
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db';
const users = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable);
console.log(users);
process.exit(0);
"
```

Copy the UUID of the user who should own SA inbound leads.

- [ ] **Step 3: Update Fiesta local `.env`**

Add to `/Users/gentlecoma/Documents/Anthology-Fiesta/.env`:

```
SA_WEBHOOK_SECRET=<shared-secret-from-step-1>
SA_DEFAULT_USER_ID=<uuid-from-step-2>
```

- [ ] **Step 4: Update horizon-marketing local `.env`**

Add to `/Users/gentlecoma/Documents/horizon-marketing/.env`:

```
FIESTA_WEBHOOK_URL=http://localhost:8080/api/webhooks/sa/contact
FIESTA_WEBHOOK_SECRET=<same-shared-secret-from-step-1>
```

**Production (Render):**

- [ ] **Step 5: Add vars to Render (horizon-marketing service)**

In the Render dashboard for the horizon-marketing service, add:
- `FIESTA_WEBHOOK_URL` = `https://anthology-fiesta.onrender.com/api/webhooks/sa/contact`
- `FIESTA_WEBHOOK_SECRET` = `<same shared secret>`

- [ ] **Step 6: Verify Render (Anthology-Fiesta service)**

In the Render dashboard for anthology-fiesta, confirm:
- `SA_WEBHOOK_SECRET` = `<same shared secret>` (update if value differs)
- `SA_DEFAULT_USER_ID` = `<user UUID>` (add if not present)

---

## Task 11: End-to-end smoke test

Verify the full flow works locally before declaring done.

- [ ] **Step 1: Start Fiesta API**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
pnpm --filter api-server dev:fast
```

- [ ] **Step 2: Trigger a test webhook**

In a second terminal:

```bash
curl -s -X POST http://localhost:8080/api/webhooks/sa/contact \
  -H "Content-Type: application/json" \
  -H "x-api-key: $(grep SA_WEBHOOK_SECRET /Users/gentlecoma/Documents/Anthology-Fiesta/.env | cut -d= -f2)" \
  -d '{"name":"Test User","email":"test@example.com","message":"I want a demo","topic":"demo_request","company":"Test Co","leadScore":80,"priority":"high"}' | jq .
```

Expected response:
```json
{ "lead": { "action": "created" } }
```

- [ ] **Step 3: Verify lead was created**

```bash
curl -s http://localhost:8080/api/leads \
  -H "Authorization: Bearer <your-session-token>" | jq '.[0]'
```

Expected: lead with `name: "Test User"`, `source: "startupanthology"`, `status: "qualified"`.

- [ ] **Step 4: Test missing SA_DEFAULT_USER_ID**

```bash
SA_DEFAULT_USER_ID= curl -s -X POST http://localhost:8080/api/webhooks/sa/contact \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{}' | jq .
```

Expected: `{ "error": "SA_DEFAULT_USER_ID not configured" }` with status 503.

- [ ] **Step 5: Run full test suite one final time**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
pnpm --filter api-server test
pnpm run typecheck
pnpm run lint
```

Expected: all tests pass, no type errors, no lint errors.
