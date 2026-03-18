# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Fiesta CRM

Mobile-first CRM for solo founders. Full-stack monorepo, runs locally on macOS.

## Tech Stack

- **Backend**: Express 5, TypeScript 5.9, Drizzle ORM 0.45, PostgreSQL 16
- **Frontend**: Expo SDK 54 (React Native), React 19, React Query v5, Tailwind CSS v4 (mockup-sandbox only; mobile uses React Native StyleSheet)
- **AI**: OpenAI direct (`OPENAI_API_KEY`), configurable models via `AI_MAIN_MODEL`/`AI_ROUTER_MODEL` (defaults: gpt-4o/gpt-4o-mini), 3-agent architecture (Coach aka "Forecaster Pro"/Cleo/Miles)
- **Auth**: Email/password with session-based auth (random SIDs, DB-backed sessions via `bcryptjs` + PostgreSQL `sessions` table), 2FA (TOTP + email) for admin
- **Integrations**: "Bring Your Own" per-user OAuth — Gmail, Outlook, Google Calendar, Outlook Calendar, Notion. Tokens encrypted at rest (AES-256-GCM). Storage: S3-compatible (Cloudflare R2, AWS S3, MinIO)
- **Package Manager**: pnpm with workspaces

## Project Structure

```
artifacts/
  api-server/       # Express API (port 8080)
  mobile/           # Expo mobile app (Expo Router, file-based routing under app/)
  mockup-sandbox/   # Component preview server
lib/
  db/               # Drizzle ORM schema + config; schema split per entity in src/schema/
  api-spec/         # OpenAPI spec + Orval codegen config
  api-zod/          # Zod validation schemas
  api-client-react/ # React Query client hooks (generated via Orval)
  integrations-openai-ai-server/  # OpenAI client + batch/image/audio helpers
  integrations-openai-ai-react/   # OpenAI client integration for React
scripts/            # Build and utility scripts
```

## Key Commands

```bash
pnpm install                         # Install dependencies
pnpm --filter api-server dev         # Run API server (runs lint first)
pnpm --filter api-server dev:fast    # Run API server (skip lint)
pnpm --filter mobile dev             # Run Expo dev server (runs lint first)
pnpm --filter mobile dev:fast        # Run Expo dev server (skip lint)
pnpm run build                       # Typecheck + build all packages
pnpm run typecheck                   # Typecheck libs then all artifacts
pnpm run lint                        # Lint all artifacts
pnpm run check:all:full              # Full typecheck + lint
pnpm --filter db push                # Push DB schema changes (drizzle-kit push)
pnpm --filter api-spec codegen       # Regenerate React Query hooks from OpenAPI spec via Orval
```

## API Client Codegen

`lib/api-spec` contains the OpenAPI spec and an Orval config. Running `pnpm --filter api-spec codegen` regenerates the typed React Query hooks in `lib/api-client-react`. When adding or changing API endpoints, update the spec and regenerate — the mobile app consumes only the generated client.

## Environment Variables

See `.env.example` for the full list. Required:
- `DATABASE_URL` — PostgreSQL connection string
- `PORT` — API server port (default 8080)
- `AUTH_JWT_SECRET` — 256-bit hex secret for session signing
- `INTEGRATION_ENCRYPTION_KEY` — 256-bit hex key for OAuth token encryption at rest
- `OPENAI_API_KEY` — OpenAI API key
- `ALLOWED_ORIGINS` — comma-separated allowed CORS origins

Optional: `S3_*` vars for file storage, `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `NOTION_CLIENT_ID/SECRET` for OAuth integrations, `AI_MAIN_MODEL`, `AI_ROUTER_MODEL`, `API_BASE_URL` (OAuth callbacks + Gmail webhook audience fallback), `HORIZON_WEBHOOK_SECRET`, `HORIZON_DEFAULT_USER_ID`, `INTEGRATION_SUCCESS_REDIRECT`

## Architecture Notes

- All DB queries are scoped by `userId` — never query without user filtering
- Audit trail on all CRUD operations via `logAudit()` in `artifacts/api-server/src/lib/audit.ts`. It is **fire-and-forget** (no `await`) — failures are logged but never thrown
- Auth middleware: `requireAuth` for authenticated routes, `requireAdmin` + 2FA for admin routes
- Object ownership enforced via `findOwned()` in `artifacts/api-server/src/lib/crud.ts` — throws 404 if row not found or userId mismatch
- AI orchestrator (`artifacts/api-server/src/lib/ai/orchestrator.ts`) uses `gpt-4o-mini` (`AI_ROUTER_MODEL` default) to classify intent, then routes to Cleo (relationships), Miles (strategy), or Coach (onboarding/help); keyword shortcuts bypass the classifier call
- AI streaming is the primary path (`POST /api/ai/chat`); a sync variant exists at `/api/ai/chat/sync`
- Drip campaign worker runs on `setInterval` (every 60 seconds) via `artifacts/api-server/src/lib/dripWorker.ts`; uses advisory locking (`lockedAt` column) with 5-minute stale lock timeout
- No test suite exists — only linting and type-checking in CI
- Horizon CRM integration (`horizonSync.ts`, `horizonWebhook.ts`) — pull sync via `POST /api/horizon/sync` and inbound webhooks at `POST /api/webhooks/horizon/*`; uses `CRM_API_KEY`/`HORIZON_BASE_URL`
- AI Insight Worker (`insightWorker.ts`) runs daily via `setInterval` (first run after 60s), generates insight cards per user using heuristics + OpenAI framing
- Agent Registry seeded on startup via `seedAgentRegistry()` — upserts Coach/Cleo/Miles definitions into `agent_registry` table
- Onboarding progress tracked in `onboarding_progress` table; orchestrator detects explained topics via router model and skips covered ones

## Known Issues (from March 2026 audit)

### Fixed (March 2026 rebuild)
- CORS now uses `ALLOWED_ORIGINS` env var (no longer `origin: true`)
- Storage download now enforces file ownership via DB lookup
- Auth replaced with email/password + sessions (no OIDC)
- Admin 2FA bypass via Bearer: fixed — both cookie and Bearer paths go through `getSession(sid)?.twoFactorVerified`
- Drip enrollment duplicate check: fixed — application-level pre-check (409) + DB unique constraint (code 23505)
- AI orchestrator duplicate messages: fixed — history fetched before user message is persisted; agent context functions no longer deduplicate the current message
- UI/UX: error states (`ErrorState` component), offline banner (`OfflineBanner` + `useOnline` hook), settings split into sub-screens, logout confirmation dialog

### Remaining
- Gmail webhook: PubSub signature verification requires `GMAIL_WEBHOOK_AUDIENCE` or `API_BASE_URL` env var; without either, webhook returns 401 (fails closed, not insecure)
- Delete operations missing `userId` in WHERE clause (relies on pre-check only — cascade deletes in sequences, junction table deletes in files)
