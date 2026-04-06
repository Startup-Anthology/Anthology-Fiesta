# SA → Fiesta Contact Integration Design

**Date:** 2026-04-06  
**Repos:** `Anthology-Fiesta` (primary), `horizon-marketing`  
**Status:** Approved

---

## Overview

When someone submits the contact form on StartupAnthology.com (horizon-marketing), that submission must appear as a **lead** in Fiesta CRM. A separate, deliberate action inside Fiesta converts a qualified lead into a contact.

The webhook code exists on both sides but is not wired up. This design completes the integration, fixes a data model gap, and adds a lead→contact conversion endpoint.

---

## Architecture

One-way push: horizon-marketing fires a webhook after each contact form submission. Fiesta receives it and upserts a lead.

```
Contact form submit
      │
      ▼
contactAutomation.ts (fire-and-forget automation chain)
      │
      └─ POST /api/webhooks/sa/contact
            Header: x-api-key: FIESTA_WEBHOOK_SECRET
            Body: { name, email, message, topic, company, phone, leadScore, priority }
                  │
                  ▼
            saWebhook.ts (Fiesta)
                  │
                  └─ upsertSALeads() → leads table
                        │
                        └─ sets fiestaNotified: true in horizon-marketing DB on 2xx

Later, inside Fiesta:
lead (status: qualified) ──► POST /api/leads/:id/convert
                                    │
                                    ├─ contact created (contacts table)
                                    └─ lead status set to "converted"
```

**Key decisions:**
- The webhook creates a **lead only** — not a contact. A contact form submission is an unqualified inbound inquiry.
- `upsertSAContacts` is removed from both the webhook handler and `runSASync`. Contacts are created only via the convert endpoint.
- `SA_DEFAULT_USER_ID` is a **hard requirement** — no fallback to first-active-user. Without it, all SA leads would be assigned to a non-deterministic user, breaking the `email + userId` dedup key when userId drifts.

---

## Data Model Changes

### Fiesta — leads unique index

Add to `lib/db/src/schema/leads.ts`:
```typescript
uniqueIndex("idx_leads_user_email").on(table.userId, table.email)
```

Matches the constraint that already exists on `contacts` (`idx_contacts_user_email`). Without this, application-level dedup in `upsertSALeads` has no DB enforcement — a race condition or future code path could create duplicate lead rows for the same `email + userId`.

**Dedup migration (must run before the index is created):**

Five tables reference `leads.id`:
- `activities` — `onDelete: set null`
- `calendar_events` — `onDelete: set null`
- `drip_enrollments` — `onDelete: set null`
- `ai_insights` — `onDelete: set null`
- `files` — **`onDelete: cascade`** ← mandatory re-point before deletion

This project uses `drizzle-kit push` (no migration files). The dedup step is a **separate TypeScript script** (`scripts/dedup-leads.ts`) that must be run manually before `pnpm --filter db push` adds the unique index. Order matters — running `db push` first will fail if duplicates exist.

Dedup script steps (runs inside a single DB transaction, rolls back entirely on any error):
1. Dry-run `SELECT` to show all `email + userId` duplicate groups — prints a summary before making any changes
2. For each duplicate group, pick the winner: row with the most recent `updatedAt`
3. `UPDATE` all child tables (activities, calendar_events, drip_enrollments, ai_insights, **files**) to set `lead_id = winner_id` where `lead_id IN (loser_ids)`
4. `DELETE` loser rows
5. Commit

### horizon-marketing — `fiestaNotified` column

Add to `contact_form_submissions`:
```typescript
fiestaNotified: boolean("fiesta_notified").default(false).notNull()
```

Set to `true` when the Fiesta webhook returns HTTP 2xx. Matches the existing pattern for `slackNotified`, `calendarEventCreated`, `ownerNotified`. Non-null with default — safe to add without data migration.

---

## Code Changes — Fiesta

### `saWebhook.ts`

- Remove `upsertSAContacts` call and parallel `Promise.all` — only `upsertSALeads` runs
- Add explicit 503 check at handler entry: if `SA_DEFAULT_USER_ID` is not set, return `503 { error: "SA_DEFAULT_USER_ID not configured" }` before any DB call
- Response shape simplifies to `{ lead: { action: "created" | "updated" } }`

### `saSync.ts`

**`getDefaultUserId`:** Remove first-active-user fallback. Require `SA_DEFAULT_USER_ID` env var — throw a clear error if missing or if the configured UUID doesn't resolve to an active user.

**`runSASync`:** Remove `upsertSAContacts` call. Only `upsertSALeads` runs in the pull-sync path (parity with webhook).

**`buildLeadNotes` / `upsertSALeads`:** Prepend new SA notes above existing notes, never overwrite. Format:
```
[Topic: Demo Request]
Company: Acme Corp
Phone: 555-1234
Lead Score: 85/100

Their message here

---

[previous notes content preserved below]
```
`buildLeadNotes` gains an optional `existingNotes?: string | null` parameter. When non-empty, new notes are prepended with a `\n\n---\n\n` separator.

### New route: `POST /api/leads/:id/convert`

Registered in `routes/index.ts` under authenticated routes.

**Request body (all optional):**
```typescript
{
  company?: string
  phone?: string
  relationshipType?: string  // defaults to "customer"
  priority?: string          // defaults to "medium"
}
```

**Flow:**
1. `findOwned(leadsTable, id, userId)` — 404 if not found or not owned by this user
2. Check `lead.status !== "converted"` — 409 `{ error: "Lead already converted" }` if already done
3. Check no contact exists for `email + userId` — 409 `{ error: "Contact already exists for this email" }` if collision
4. `db.insert(contactsTable)` with `{ name, email, notes, userId, relationshipType: body.relationshipType ?? "customer", priority: body.priority ?? "medium", company: body.company ?? null, phone: body.phone ?? null }`
5. `db.update(leadsTable).set({ status: "converted", updatedAt: new Date() })`
6. `logAudit` for both operations, `fireAndForgetContactSync(newContact)`, `fireAndForgetLeadSync(updatedLead)`
7. Return `200 { lead: updatedLead, contact: newContact }`

### OpenAPI spec + codegen

Add `POST /leads/{id}/convert` to `lib/api-spec/openapi.yaml` with request body and response schemas. Run `pnpm --filter api-spec codegen` to regenerate React Query hooks in `lib/api-client-react`.

### Mobile — `lead/[id]`

- Add "Convert to Contact" button, visible only when `lead.status !== "converted"`
- Calls the generated `useConvertLead` mutation hook
- On success: invalidates `["leads"]` and `["contacts"]` queries, navigates to `contact/[id]` of the returned contact
- On 409 (contact already exists): show alert "A contact with this email already exists"
- On 409 (already converted): show alert "This lead has already been converted"

### Mobile — pipeline (`funnel.tsx`)

Filter leads with `status === "converted"` from the board view **client-side** on the existing query result. The `GET /leads` API does not currently accept a `status` filter param, so this is a `.filter(l => l.status !== "converted")` on the data returned by the `["leads"]` React Query cache. This is correct for a solo-founder scale dataset; a server-side filter can be added later if lead volume grows.

---

## Code Changes — horizon-marketing

### `contactAutomation.ts`

The Fiesta webhook block (lines 284–314) changes from fully fire-and-forget to: await the fetch, check `res.ok`, update `fiestaNotified: true` in DB on success. The overall automation chain remains fire-and-forget — only the Fiesta call itself awaits its own response to capture the status flag.

```typescript
// Before: fire-and-forget with no status tracking
fetch(fiestaWebhookUrl, { ... }).catch(err => logger.error(...));

// After: await response, update fiestaNotified flag
try {
  const res = await fetch(fiestaWebhookUrl, { ... });
  if (res.ok) {
    await db.update(contactFormSubmissionsTable)
      .set({ fiestaNotified: true })
      .where(eq(contactFormSubmissionsTable.id, submission.id));
  } else {
    logger.error({ status: res.status }, "[Automation] Fiesta CRM webhook returned error");
  }
} catch (err) {
  logger.error({ err }, "[Automation] Fiesta CRM webhook failed");
}
```

### `.env.example`

Add:
```
FIESTA_WEBHOOK_URL=        # Fiesta webhook endpoint (POST /api/webhooks/sa/contact)
FIESTA_WEBHOOK_SECRET=     # Shared secret — must match SA_WEBHOOK_SECRET in Fiesta
```

---

## Configuration

| Variable | Repo | Local `.env` | Render |
|---|---|---|---|
| `FIESTA_WEBHOOK_URL` | horizon-marketing | `http://localhost:8080/api/webhooks/sa/contact` | `https://anthology-fiesta.onrender.com/api/webhooks/sa/contact` |
| `FIESTA_WEBHOOK_SECRET` | horizon-marketing | `<shared secret>` | `<shared secret>` |
| `SA_WEBHOOK_SECRET` | Fiesta | `<same shared secret>` | already set — verify value matches |
| `SA_DEFAULT_USER_ID` | Fiesta | `<your user UUID>` | set to assigned inbound user UUID |

The shared secret is any random string — generate once and use in both places. `SA_DEFAULT_USER_ID` is the UUID of the Fiesta user who owns all SA inbound leads (the "inbound queue" owner).

---

## Testing

**Framework:** Vitest + Supertest added to `api-server`.

**New devDependencies** (`api-server`): `vitest`, `supertest`, `@types/supertest`

**New script** (`api-server/package.json`): `"test": "vitest run"`

**New CI job** (`ci.yml`): `test-api` — runs after `api-server` lint passes.

### `saSync.test.ts` — pure unit tests, no DB

- `buildLeadNotes` with no existing notes → returns correctly formatted string
- `buildLeadNotes` with existing notes → prepends with `---` separator, preserves existing content
- `getDefaultUserId` throws when `SA_DEFAULT_USER_ID` not set
- `mapTopicToStatus` returns `"qualified"` for `demo_request` and `partnership`; `"new"` for all others

### `saWebhook.test.ts` — HTTP tests, DB mocked via `vi.mock`

- Missing `x-api-key` header → 401
- Wrong `x-api-key` → 401
- `SA_WEBHOOK_SECRET` not set → 503
- `SA_DEFAULT_USER_ID` not set → 503
- Invalid payload (missing required fields) → 400
- Valid payload, new lead → 201 `{ lead: { action: "created" } }`
- Valid payload, existing lead (upsert returns `updated`) → 200 `{ lead: { action: "updated" } }`
- `upsertSALeads` throws → 500

### `leadsConvert.test.ts` — HTTP tests, DB mocked via `vi.mock`

- Unauthenticated request → 401
- Lead not found / belongs to different user → 404
- Lead `status === "converted"` → 409 `{ error: "Lead already converted" }`
- Contact already exists for `email + userId` → 409 `{ error: "Contact already exists for this email" }`
- Happy path (no body) → 200, contact has `relationshipType: "customer"`, `priority: "medium"`
- Happy path with `company` and `phone` in body → contact includes those fields
- Happy path → lead in response has `status: "converted"`

---

## Out of Scope

- **Global email dedup across users** — the schema permits the same email under multiple users (`leads` has no global unique constraint). Fixing this requires a larger data model redesign.
- **Lead→contact bidirectional link** — no `convertedToContactId` on leads or `fromLeadId` on contacts. Traceability via audit log only.
- **Backfilling existing horizon-marketing submissions** — existing `contact_form_submissions` rows with `fiestaNotified: false` are not retroactively synced. A manual `POST /sa/sync` trigger can be used if needed.
- **horizon-marketing automated tests** — the `fiestaNotified` change is a small addition to an existing fire-and-forget block; tested via the Fiesta webhook tests indirectly.
