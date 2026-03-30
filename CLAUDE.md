# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Fiesta CRM

Mobile-first CRM for solo founders. Full-stack monorepo, runs locally on macOS.

## Tech Stack

- **Backend**: Express 5, TypeScript 5.9, Drizzle ORM 0.45, PostgreSQL 16
- **Frontend**: Expo SDK 54 (React Native 0.81), React 19, React Query v5, Expo Router 6 (file-based routing)
- **Design System**: Shadcn/UI + Radix UI + Tailwind CSS v4 (mockup-sandbox only; mobile uses React Native StyleSheet). Mobile brand: Startup Anthology gold (#BB935B), slate-blue palette, Hanken Grotesk (body) / Lato (page titles) / League Spartan (section headings) / Roboto Mono (code)
- **AI**: OpenAI direct (`OPENAI_API_KEY`), configurable models via `AI_MAIN_MODEL`/`AI_ROUTER_MODEL` (defaults: gpt-4o/gpt-4o-mini), 3-agent architecture (Coach aka "Forecaster Pro"/Cleo/Miles)
- **Auth**: Email/password with session-based auth (random SIDs, DB-backed sessions via `bcryptjs` + PostgreSQL `sessions` table), 2FA (TOTP via `otpauth` + email) for admin
- **Integrations**: "Bring Your Own" per-user OAuth -- Gmail, Outlook, Google Calendar, Outlook Calendar, Notion, Slack. Tokens encrypted at rest (AES-256-GCM). Storage: S3-compatible (Cloudflare R2, AWS S3, MinIO)
- **PWA**: Production-ready Progressive Web App (iOS Safari "Add to Home Screen"), service worker for app shell caching, Web App Manifest
- **Deployment**: Single Render Web Service (Express serves API + PWA static files), Neon PostgreSQL. Production URL: `https://anthology-fiesta.onrender.com`
- **Package Manager**: pnpm 10 with workspaces
- **Runtime**: Node 24

## Project Structure

```
artifacts/
  api-server/       # Express API (port 8080) — routes, middleware, AI orchestrator, workers
  mobile/           # Expo mobile app (Expo Router, file-based routing under app/)
  mockup-sandbox/   # Vite-based component preview/design system (Shadcn/UI + Radix)
lib/
  db/               # Drizzle ORM schema + config; schema split per entity in src/schema/
  api-spec/         # OpenAPI spec (openapi.yaml) + Orval codegen config
  api-zod/          # Zod validation schemas (generated types in src/generated/types/)
  api-client-react/ # React Query client hooks (generated via Orval from api-spec)
  integrations-openai-ai-server/  # OpenAI server client + batch/image/audio helpers
  integrations-openai-ai-react/   # OpenAI React hooks (voice recorder, audio playback, voice stream)
scripts/            # Build/utility scripts + git hooks (post-merge.sh)
.agents/skills/     # ~45 AI assistant skill definitions (Expo, design, testing, etc.)
.github/workflows/  # CI: lint + typecheck (api-server, mobile), build, PR labeling/size checks
```

## Key Commands

```bash
pnpm install                         # Install dependencies (enforces pnpm-only via preinstall)
pnpm --filter api-server dev         # Run API server (runs lint first)
pnpm --filter api-server dev:fast    # Run API server (skip lint)
pnpm --filter mobile dev             # Run Expo dev server (runs lint first)
pnpm --filter mobile dev:fast        # Run Expo dev server (skip lint)
pnpm run build                       # Typecheck + build all packages (excludes mockup-sandbox)
pnpm run typecheck                   # Typecheck libs (tsc --build) then all artifacts
pnpm run typecheck:libs              # Typecheck shared libs only (tsc --build)
pnpm run lint                        # Lint all artifacts
pnpm run check:all:full              # Full typecheck + lint
pnpm --filter db push                # Push DB schema changes (drizzle-kit push)
pnpm --filter api-spec codegen       # Regenerate React Query hooks from OpenAPI spec via Orval
```

## API Client Codegen

`lib/api-spec` contains the OpenAPI spec (`openapi.yaml`) and an Orval config. Running `pnpm --filter api-spec codegen` regenerates the typed React Query hooks in `lib/api-client-react`. When adding or changing API endpoints, update the spec and regenerate -- the mobile app consumes only the generated client.

## Database Schema

Schema is in `lib/db/src/schema/` with one file per entity:

| File | Entity |
|------|--------|
| `leads.ts` | Lead management |
| `contacts.ts` | Contacts |
| `activities.ts` | Activity log |
| `emailTemplates.ts` | Email templates |
| `dripSequences.ts` | Drip campaign sequences + steps + enrollments |
| `broadcasts.ts` | Email broadcasts |
| `triggerRules.ts` | Automation trigger rules |
| `settings.ts` | Per-user settings |
| `auth.ts` | Users + sessions |
| `calendarEvents.ts` | Calendar events |
| `auditLog.ts` | Audit trail |
| `files.ts` | File storage metadata |
| `conversations.ts` | Conversations |
| `messages.ts` | Chat messages |
| `aiInsights.ts` | AI-generated insight cards |
| `onboardingProgress.ts` | Onboarding state tracking |
| `agentRegistry.ts` | AI agent definitions (Coach/Cleo/Miles) |
| `integrations.ts` | OAuth token storage (encrypted) |

All tables are exported via `lib/db/src/schema/index.ts`.

## API Routes

All routes are mounted under `/api` (see `artifacts/api-server/src/routes/index.ts`).

**Public (no auth):** health, auth (login/logout), Gmail webhook, Horizon webhook

**Authenticated (requireAuth middleware):** leads, contacts, activities, templates, sequences, broadcasts, triggers, settings, dashboard, email, calendar, audit, storage, files, AI (chat/streaming), Horizon sync, diagnostics, integrations, twoFactor, admin

## Mobile App Structure

Expo Router file-based routing in `artifacts/mobile/app/`:

- `(tabs)/` -- Main tab navigation: Dashboard (`index`), Pipeline (`funnel`), Calendar, AI insights, Inbox, Contacts (hidden), More (hidden)
- Modal routes: `lead/[id]`, `contact/[id]`, `compose-email`, `template/[id]`, `sequence/[id]`, `broadcast/[id]`, `broadcast/new`, `comms`, `files`, `settings/*`, `admin`

Key providers (in `_layout.tsx`): QueryClientProvider, AuthProvider, ThemeProvider, ErrorBoundary

Shared code: `lib/auth.tsx` (AuthProvider + useAuth), `lib/api.ts` (fetch wrapper + session management), `lib/theme.tsx` (ThemeProvider + useTheme), `lib/useOnline.ts` (offline detection)

## Environment Variables

See `.env.example` for the full list. Required:
- `DATABASE_URL` -- PostgreSQL connection string
- `PORT` -- API server port (default 8080)
- `AUTH_JWT_SECRET` -- 256-bit hex secret for session signing
- `INTEGRATION_ENCRYPTION_KEY` -- 256-bit hex key for OAuth token encryption at rest
- `OPENAI_API_KEY` -- OpenAI API key
- `ALLOWED_ORIGINS` -- comma-separated allowed CORS origins

Optional: `S3_*` vars for file storage, `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, `NOTION_CLIENT_ID/SECRET`, `SLACK_CLIENT_ID/SECRET` for OAuth integrations, `AI_MAIN_MODEL`, `AI_ROUTER_MODEL`, `OPENAI_BASE_URL` (Azure OpenAI or local proxy), `API_BASE_URL` (OAuth callbacks + Gmail webhook audience fallback), `CRM_API_KEY`/`HORIZON_BASE_URL`, `HORIZON_WEBHOOK_SECRET`, `HORIZON_DEFAULT_USER_ID`, `GMAIL_WEBHOOK_AUDIENCE`, `INTEGRATION_SUCCESS_REDIRECT`, `SA_CRM_API_KEY`/`SA_BASE_URL` (StartupAnthology.com poll sync — both required to enable worker; Cloudflare WAF bypass rule also required), `SA_WEBHOOK_SECRET` (inbound SA webhook auth), `SA_DEFAULT_USER_ID` (optional UUID; falls back to first active user)

## Architecture Notes

### Data Access
- All DB queries are scoped by `userId` -- never query without user filtering
- Object ownership enforced via `findOwned()` in `artifacts/api-server/src/lib/crud.ts` -- throws 404 if row not found or userId mismatch
- Audit trail on all CRUD operations via `logAudit()` in `artifacts/api-server/src/lib/audit.ts`. It is **fire-and-forget** (no `await`) -- failures are logged but never thrown

### Auth & Security
- Auth middleware: `requireAuth` for authenticated routes, `requireAdmin` + 2FA for admin routes
- CORS uses `ALLOWED_ORIGINS` env var; localhost auto-allowed in non-production mode
- Session-based auth (cookie name `sid`, 7-day TTL) with cookie + Bearer token paths, both go through `getSession(sid)?.twoFactorVerified`
- Passwords hashed with bcryptjs (salt rounds 12)
- OAuth tokens encrypted at rest via `tokenManager.ts` (AES-256-GCM)
- Rate limiting: login 5/min per IP, registration 3/hour per IP, AI chat 20/min per user
- Supply-chain defense: `minimumReleaseAge: 1440` in pnpm-workspace.yaml (1-day buffer for new npm packages)

### AI System
- AI orchestrator (`artifacts/api-server/src/lib/ai/orchestrator.ts`) uses `gpt-4o-mini` (`AI_ROUTER_MODEL` default) to classify intent, then routes to:
  - **Cleo** -- relationships/contacts
  - **Miles** -- strategy/sales
  - **Coach** (aka "Forecaster Pro") -- onboarding/help
- Keyword shortcuts bypass the classifier call
- AI streaming is the primary path (`POST /api/ai/chat`); a sync variant exists at `/api/ai/chat/sync`
- Tool execution via `toolExecutor.ts` for agent actions
- Agent Registry seeded on startup via `seedAgentRegistry()` -- upserts Coach/Cleo/Miles definitions into `agent_registry` table
- Onboarding progress tracked in `onboarding_progress` table; orchestrator detects explained topics via router model and skips covered ones
- Model availability verified on startup (`verifyModelAvailability()`)

### Background Workers
- **Drip campaign worker** (`dripWorker.ts`): runs on `setInterval` (every 60 seconds); uses advisory locking (`lockedAt` column) with 5-minute stale lock timeout
- **AI Insight Worker** (`insightWorker.ts`): runs daily via `setInterval` (first run after 60s); generates insight cards per user using heuristics + OpenAI framing
- **Slack Digest Worker** (`slackDigestWorker.ts`): checks hourly, sends daily pipeline summary to configured Slack channel (configurable send hour per user)
- **Notion Pull Worker** (`notionPullWorker.ts`): runs every 5 minutes (first run after 3 min); polls Notion databases for changes and pulls them into CRM (last-write-wins conflict resolution; matches by `notionPageId` then falls back to email)
- **Horizon Sync Worker** (`horizonSyncWorker.ts`): runs every 15 minutes; auto-syncs Horizon users → leads and contacts → contacts; posts Slack notification on new records
- **SA Sync Worker** (`saSyncWorker.ts`): runs every 15 minutes (first run after 90s, staggered from Horizon's 60s); polls `SA_BASE_URL/api/crm/contacts`, upserts into leads + contacts, saves `sa_last_sync_at` etc. to `app_settings`. Only activates when both `SA_CRM_API_KEY` and `SA_BASE_URL` are set. **Note:** Cloudflare bot protection on `startupanthology.com` blocks server-to-server requests — a WAF bypass rule is required for pull sync to work. Inbound webhook (`POST /api/webhooks/sa/contact`) works regardless and is the primary real-time path. `isSAConfigured()` returns true when either pull sync vars OR `SA_WEBHOOK_SECRET` is set (webhook-only is a valid configured state).
- All workers start after `app.listen()` callback in `index.ts`

### Startup Sequence
1. Express app listens on `PORT`
2. `seedDefaults()` -- seeds default data
3. `seedAgentRegistry()` -- upserts AI agent definitions
4. `verifyModelAvailability()` -- checks OpenAI model access (async, non-blocking)
5. `startDripWorker()` + `startInsightWorker()` + `startSlackDigestWorker()` + `startNotionPullWorker()` + `startHorizonSyncWorker()` + `startSASyncWorker()` -- starts background workers

### Integrations
- Integration registry pattern in `artifacts/api-server/src/lib/integrations/registry.ts`
- Calendar: Google Calendar (`calendar/google.ts`), Outlook Calendar (`calendar/outlook.ts`)
- Email: Gmail (`email/gmail.ts`), Outlook (`email/outlook.ts`)
- Notes: Notion (`notes/notion.ts`) -- two-way sync; push (CRM → Notion) fires on save via `notionSync.ts`; pull (Notion → CRM) via `notionPullWorker.ts` (5-min interval, first run at 3 min); full export via `POST /api/integrations/notion/export`. Requires manually created Notion databases with exact property schemas; database IDs stored as settings keys `notion_leads_db` / `notion_contacts_db` / `notion_activities_db`. Setup guide: `attached_assets/notion-integration-guide.md`
- Messaging: Slack (`messaging/slack.ts`) -- CRM event notifications (`slackNotify.ts`), daily pipeline digest worker (`slackDigestWorker.ts`)
- Horizon CRM (`horizonSync.ts`, `horizonWebhook.ts`) -- pull sync via `POST /api/horizon/sync`, auto-sync worker (`horizonSyncWorker.ts`, 15-min interval), inbound webhooks at `POST /api/webhooks/horizon/*`; uses `CRM_API_KEY`/`HORIZON_BASE_URL`
- StartupAnthology.com (`saSync.ts`, `saSyncWorker.ts`, `saWebhook.ts`) -- contact form submissions → leads + contacts; pull sync via `POST /api/sa/sync`, auto-sync worker (`saSyncWorker.ts`, 15-min, requires `SA_CRM_API_KEY`+`SA_BASE_URL`+Cloudflare WAF bypass), inbound webhook at `POST /api/webhooks/sa/contact` (auth via `SA_WEBHOOK_SECRET`); status at `GET /api/sa/status`

### State Management (Mobile)
- **Server state**: TanStack React Query v5
- **Auth state**: React Context (AuthProvider in `lib/auth.tsx`)
- **Theme state**: React Context (ThemeProvider in `lib/theme.tsx`), light/dark mode persisted
- **Secure storage**: `lib/secureStorage.ts` -- platform-aware (localStorage on web, expo-secure-store on native)
- **API client**: Custom fetch wrapper in `lib/api.ts` with JWT injection + `credentials: 'include'` for cookie auth on web
- **Cross-platform utilities**: `lib/alert.ts` (window.confirm on web, Alert.alert on native), `lib/filePicker.ts` (hidden input on web, expo-document-picker/image-picker on native)

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- **ci.yml**: Runs on push to `master` and PRs. Three jobs:
  1. `api-server` -- typecheck shared libs, typecheck + lint API server
  2. `mobile` -- typecheck shared libs, typecheck + lint mobile
  3. `build-api` -- build API server (depends on api-server lint passing)
- **pr-checks.yml**: Auto-labels PRs by changed files, adds size labels (XS/S/M/L/XL), comments on large PRs
- **labeler.yml**: Label rules -- `api`, `mobile`, `database`, `ci`, `dependencies`, `config`, `documentation`

CI uses Node 24, pnpm 10.26.1, `--frozen-lockfile`, with pnpm store caching.

**No test suite exists** -- only linting and type-checking in CI.

## Conventions

- pnpm-only enforced via `preinstall` script (rejects npm/yarn)
- Workspace filter names use `@workspace/` prefix (e.g., `@workspace/api-server`, `@workspace/mobile`)
- TypeScript strict mode enabled (`tsconfig.base.json`)
- Module resolution: `bundler` with ES2022 target
- esbuild version overridden globally to 0.27.3 (drizzle-kit vulnerability fix)
- API server runs via `tsx` in dev (Node `--import tsx/esm`), esbuild bundle for production
- API server loads `.env` from repo root via Node `--env-file=../../.env`

## Known Issues (from March 2026 audit)

### Fixed (March 2026 rebuild)
- CORS now uses `ALLOWED_ORIGINS` env var (no longer `origin: true`)
- Storage download now enforces file ownership via DB lookup
- Auth replaced with email/password + sessions (no OIDC)
- Admin 2FA bypass via Bearer: fixed -- both cookie and Bearer paths go through `getSession(sid)?.twoFactorVerified`
- Drip enrollment duplicate check: fixed -- application-level pre-check (409) + DB unique constraint (code 23505)
- AI orchestrator duplicate messages: fixed -- history fetched before user message is persisted; agent context functions no longer deduplicate the current message
- UI/UX: error states (`ErrorState` component), offline banner (`OfflineBanner` + `useOnline` hook), settings split into sub-screens, logout confirmation dialog

### Remaining
- Gmail webhook: PubSub signature verification requires `GMAIL_WEBHOOK_AUDIENCE` or `API_BASE_URL` env var; without either, webhook returns 401 (fails closed, not insecure)

### Fixed (March 2026 PWA update)
- Sequence cascade deletes now wrapped in transaction for atomicity (defense-in-depth)
- Legacy `/mobile-auth/logout` route removed (no longer referenced)
- Web auth: `secureStorage.ts` created (was gitignored and missing), `credentials: 'include'` added to all fetch calls
- PWA: manifest, service worker, custom HTML document with Apple meta tags, icons
- Unified server: Express serves both API and PWA static build (single-service architecture)
- Cross-platform: Alert.alert → showAlert, file pickers, FormData web compatibility
- Expo Router origin set to `https://anthology-fiesta.onrender.com`
- API URLs use relative paths on web production (same-origin)

### Fixed (March 2026 brand guide update)
- Typography: SpaceGrotesk replaced with Hanken Grotesk (body), Lato (page titles), League Spartan (section headings), Roboto Mono (code)
- Color palette: slate-blue light/dark theme (background #f5f8fc / #0b0f1a, text #0f172a / #f5f8fc, border #dde3ed / #1f2937)
- Layout radii aligned to brand guide: cardRadius 12, inputRadius 6, badgeRadius 3, chips fully rounded
- PWA theme-color updated to brand amber #C4A57B
- Card shadows applied to dashboard, pipeline, inbox, contacts
- Tab bar hardcoded colors replaced with theme tokens

### Fixed (March 2026 integrations update)
- Google OAuth configured: `fiesta-crm` project in Google Cloud (Gmail API + Google Calendar API enabled); test user `jeremy@startupanthology.com`; credentials in Render as `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- SA webhook wired end-to-end: marketing site (`horizon-marketing`) fires `FIESTA_WEBHOOK_URL` on contact form submit; Fiesta receives at `POST /api/webhooks/sa/contact`; `SA_BASE_URL` removed from Render (Cloudflare blocks pull sync; webhook is the active path)
- `isSAConfigured()` fixed: now returns true when `SA_WEBHOOK_SECRET` is set, not only when pull-sync vars present
- Integrations screen back button: falls back to `router.replace("/settings")` when `router.canGoBack()` is false (e.g. after OAuth callback redirect)

### Fixed (March 2026 HTML email update)
- All outgoing emails (drip, broadcast, manual compose) now send `multipart/alternative` with clickable links: bare `https://` URLs auto-link; `[text](url)` markdown renders as anchor tags
- `renderTemplateBody(text): { html, text }` in `lib/emailRenderer.ts` — call after merge tag substitution; pass `html` as 6th arg to `sendGmailEmail`; store `text` (plain) in activity log
- Link syntax hint added to template editor and compose screen

### Fixed (March 2026 web parity update)
- Web PWA now renders in a centered 430px column with colored margins on desktop (matches native phone width); implemented via `WebShell` wrapper in `app/_layout.tsx`
- Shadow tokens (`constants/layout.ts`) now include explicit `boxShadow` CSS strings via `Platform.select` for forward compatibility with react-native-web (deprecated `shadow*` → `boxShadow` auto-translation)
- HamburgerMenu shadow-clipping bug fixed: `overflow:"hidden"` was on same element as shadow (clips CSS box-shadow); separated into outer shadow wrapper + inner clip wrapper
- All inline FAB/picker shadows consolidated into `Layout.shadow.*` tokens (comms, contacts, calendar, funnel, LoginScreen, HamburgerMenu)
- Pipeline Kanban column width moved from static `Dimensions.get("window")` at module scope to reactive `useWindowDimensions()` inside component, capped at 430px
- Service worker cache bumped to `fiesta-v3` to bust stale cached assets on deploy
