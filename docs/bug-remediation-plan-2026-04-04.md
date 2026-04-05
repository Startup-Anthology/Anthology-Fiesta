# Fiesta CRM Bug Remediation Plan (Verified) — 2026-04-04

## Verification Summary

I reviewed `docs/bug-audit-2026-04-04.md` against the current code.

- Confirmed bugs: 27
- Partially valid (real issue, but severity/root cause in report is off): 8
- Not reproducible / already mitigated: 14
- Additional bugs found outside the report: 5

## Reported Findings: Verification Status

### Confirmed (27)

- Critical: `C-2`, `C-3`, `C-4`, `C-6`
- High: `H-1`, `H-2`, `H-4`, `H-5`, `H-7`, `H-14`, `H-15`
- Medium: `M-2`, `M-5`, `M-6`, `M-7`, `M-8`, `M-10`, `M-12`, `M-13`, `M-14`, `M-15`
- Low: `L-1`, `L-2`, `L-4`, `L-5`, `L-9`, `L-11`

### Partially Valid (8)

- `C-1`: Not exploitable as described (ownership pre-check exists), but update query should still include `userId` for defense-in-depth.
- `H-3`: Parsing issue exists as observability gap; worker already falls back instead of crashing.
- `H-12`: No crash path found; still worth normalizing unknown activity types.
- `M-1`: Lock release mostly handled; stale-lock timeout already limits impact.
- `M-3`: Errors are logged; missing user-visible health signal is the real gap.
- `M-4`: Webhook-only mode returns an error for pull sync, but not a clear mode-specific message.
- `M-16`: Timeout errors bubble up, but messaging is inconsistent by screen.
- `L-3`: Exact claim is off; broader integration state handling still needs cleanup.

### Not Reproducible / Already Mitigated (14)

- `C-5`, `H-6`, `H-8`, `H-9`, `H-10`, `H-11`, `H-13`, `M-9`, `M-11`, `M-17`, `L-6`, `L-7`, `L-8`, `L-10`

## Additional Bugs Found (Not in Original Report)

- `A-1` Login email normalization mismatch: register lowercases email, login does not.
  - File: `artifacts/api-server/src/routes/auth.ts`
- `A-2` Disabled users can still receive a successful login response before auth middleware clears session.
  - File: `artifacts/api-server/src/routes/auth.ts`
- `A-3` Lead/contact note-save path uses fire-and-forget `api.createActivity(...).then(...)` without catch.
  - Files: `artifacts/mobile/app/lead/[id].tsx`, `artifacts/mobile/app/contact/[id].tsx`
- `A-4` Broadcast status is always finalized as `sent` even when some recipient sends fail.
  - File: `artifacts/api-server/src/routes/broadcasts.ts`
- `A-5` Repo health bug: `check:all:full` currently fails due mockup-sandbox TypeScript ref-type mismatch.
  - Files: `artifacts/mockup-sandbox/src/components/ui/calendar.tsx`, `artifacts/mockup-sandbox/src/components/ui/spinner.tsx`

## Full Execution Plan

## Phase 0: Security + Data Integrity (Ship First)

### Task P0-1: Harden AI insight dismiss path

- Bugs: `C-1`
- File: `artifacts/api-server/src/routes/ai.ts`
- Change:
  - Keep ownership pre-check.
  - Also add `userId` to `UPDATE ... WHERE`.

### Task P0-2: Add lead email uniqueness and normalization

- Bugs: `C-2`, `H-7`, `A-1`
- Files:
  - `lib/db/src/schema/leads.ts`
  - `artifacts/api-server/src/lib/validation.ts`
  - `artifacts/api-server/src/routes/auth.ts`
- Change:
  - DB unique composite `(userId, email)` on leads.
  - Normalize lead/contact emails in validation or route layer.
  - Normalize login email with `trim().toLowerCase()`.

### Task P0-3: Block inactive users at login

- Bugs: `A-2`
- File: `artifacts/api-server/src/routes/auth.ts`
- Change:
  - Return `401` for inactive users in login handler.

### Task P0-4: Persist OAuth state

- Bugs: `L-11`
- Files:
  - `artifacts/api-server/src/routes/integrations.ts`
  - `lib/db/src/schema` (new oauth state table)
- Change:
  - Replace in-memory `pendingStates` map with DB-backed short-TTL state.

## Phase 1: Reliability + External Calls

### Task P1-1: Add timeout/cancellation for OpenAI + OAuth HTTP

- Bugs: `H-1`, `M-6`
- Files:
  - `artifacts/api-server/src/lib/ai/orchestrator.ts`
  - `artifacts/api-server/src/lib/integrations/oauth.ts`
- Change:
  - Use abort signal timeout for all outbound calls.
  - Emit explicit timeout errors for UI/logging.

### Task P1-2: Add worker startup guardrails and session cleanup job

- Bugs: `H-2`, `C-3`
- Files:
  - `artifacts/api-server/src/index.ts`
  - new helper: `artifacts/api-server/src/lib/sessionCleanupWorker.ts`
- Change:
  - Wrap each worker start with explicit error logging.
  - Add daily session purge (`expire < now`).

### Task P1-3: Fix token manager failure modes

- Bugs: `H-4`, `H-5`, `L-3` (broader state handling)
- Files:
  - `artifacts/api-server/src/lib/integrations/registry.ts`
  - `artifacts/api-server/src/lib/integrations/tokenManager.ts`
- Change:
  - Add in-flight refresh dedupe per `userId:provider`.
  - Catch decrypt failures and mark integration for reconnect.
  - Normalize status transitions (`active`/`error`) after retries.

### Task P1-4: Notion sync concurrency and status signaling

- Bugs: `M-3`, `M-7`
- Files:
  - `artifacts/api-server/src/lib/notionSync.ts`
  - `artifacts/api-server/src/lib/integrations/notes/notion.ts`
  - `lib/db/src/schema/integrations.ts` (if status metadata extension needed)
- Change:
  - Add per-entity sync lock and idempotency checks.
  - Surface sync health flag for UI.

## Phase 2: Mobile UX + Error Handling

### Task P2-1: Fix profile/broadcast/insight error UX

- Bugs: `C-4`, `C-6`, `H-14`, `M-15`, `M-16`
- Files:
  - `artifacts/mobile/app/settings/profile.tsx`
  - `artifacts/mobile/app/broadcast/new.tsx`
  - `artifacts/mobile/components/AiInsightCards.tsx`
- Change:
  - Add explicit query error states and retry CTAs.
  - Wrap post-success refresh path in local try/catch with user messaging.
  - Add dismiss mutation `onError` feedback.

### Task P2-2: Sequence + template editor safety

- Bugs: `M-14`, `H-15`
- Files:
  - `artifacts/mobile/app/sequence/[id].tsx`
  - `artifacts/mobile/app/template/[id].tsx`
- Change:
  - Add pending save loading/disable behavior.
  - Validate merge tags before save.

### Task P2-3: Detail-screen resilience

- Bugs: `M-13`, `L-9`, `A-3`
- Files:
  - `artifacts/mobile/app/lead/[id].tsx`
  - `artifacts/mobile/app/contact/[id].tsx`
  - `artifacts/mobile/components/HistoryModal.tsx`
- Change:
  - Fallback display names for blank values.
  - Add accessibility labels for close controls.
  - Add catch handlers for fire-and-forget note activity writes.

## Phase 3: Schema + Integration Hardening

### Task P3-1: Add missing schema constraints/indexes

- Bugs: `M-10`, `M-12`, `L-5`
- Files:
  - `lib/db/src/schema/activities.ts`
  - `lib/db/src/schema/calendarEvents.ts`
- Change:
  - Activity type enum.
  - Calendar event type enum.
  - Composite index `(userId, gmailLink)`.

### Task P3-2: Sync conflict policy for external CRMs

- Bugs: `M-8`, `M-4`, `M-5`
- Files:
  - `artifacts/api-server/src/lib/horizonSync.ts`
  - `artifacts/api-server/src/lib/saSync.ts`
  - `artifacts/api-server/src/routes/saSync.ts`
  - `artifacts/api-server/src/routes/gmailWebhook.ts`
- Change:
  - Add `updatedAt` conflict checks.
  - Add explicit webhook-only mode response for SA pull sync.
  - Startup warning for Gmail webhook audience config.

### Task P3-3: Email/calendar provider input validation

- Bugs: `L-1`, `L-2`, `L-4`
- Files:
  - `artifacts/api-server/src/lib/integrations/calendar/outlook.ts`
  - `artifacts/api-server/src/lib/integrations/email/gmail.ts`
  - `artifacts/api-server/src/lib/integrations/messaging/slack.ts`
- Change:
  - Validate event start/end ordering.
  - Validate total attachment size pre-send.
  - Validate Slack blocks shape before API call.

### Task P3-4: Broadcast delivery status accuracy

- Bugs: `A-4`
- File: `artifacts/api-server/src/routes/broadcasts.ts`
- Change:
  - Track success + failure counts.
  - Set status to `sent`, `partial`, or `failed`.

## Phase 4: Repo Health + CI Gate

### Task P4-1: Fix mockup-sandbox typecheck break

- Bugs: `A-5`
- Files:
  - `artifacts/mockup-sandbox/src/components/ui/calendar.tsx`
  - `artifacts/mockup-sandbox/src/components/ui/spinner.tsx`
- Change:
  - Resolve React type mismatch from duplicate/ref signature conflict.

### Task P4-2: Add regression tests and release checklist

- Scope: all confirmed and partial bugs that become accepted fixes
- Additions:
  - API route tests for auth, AI dismiss, broadcast status, OAuth state.
  - Integration tests for timeout and refresh dedupe behavior.
  - Mobile smoke tests for profile save, broadcast wizard failure states, modal save/retry.

## Suggested Implementation Order

1. Phase 0 (security/data integrity)
2. Phase 1 (backend reliability)
3. Phase 2 (mobile UX and error recovery)
4. Phase 3 (schema/integration hardening)
5. Phase 4 (CI and regression safety net)

## Verification Commands

- `pnpm --filter @workspace/api-server run typecheck`
- `pnpm --filter @workspace/api-server run lint`
- `pnpm --filter @workspace/mobile run typecheck`
- `pnpm --filter @workspace/mobile run lint`
- `pnpm run check:all:full` (currently failing due `A-5`, expected until fixed)
