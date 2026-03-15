# Fiesta

## Overview

Fiesta is a mobile CRM built for solo founders — manage your leads, contacts, follow-ups, email outreach, and AI coaching in one focused app, without the enterprise bloat. Your relationships, your pipeline, one place.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile framework**: Expo SDK 54 with React Native (New Architecture disabled for Expo Go compatibility)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **State management**: TanStack React Query
- **Integrations**: Gmail (via googleapis), Notion (via @replit/connectors-sdk), Google Calendar (via googleapis), OpenAI (via Replit AI proxy)
- **Auth**: Replit OAuth (OIDC with PKCE via expo-auth-session + openid-client v6), session-based Bearer tokens, admin 2FA via otpauth (TOTP) or email codes

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── mobile/                # Expo React Native app (iOS-first)
│   │   ├── app/(tabs)/        # Tab screens: Dashboard, Funnel, Contacts, Calendar, Files, AI
│   │   ├── app/lead/[id].tsx  # Lead detail screen
│   │   ├── app/contact/[id].tsx # Contact detail screen
│   │   ├── app/compose-email.tsx # Email composer with template support
│   │   ├── app/template/[id].tsx # Template editor (create/edit)
│   │   ├── app/sequence/[id].tsx # Drip sequence editor
│   │   ├── app/broadcast/new.tsx # Broadcast wizard (4-step)
│   │   ├── app/settings.tsx   # Settings + profile + admin panel (diagnostics, user mgmt)
│   │   ├── app/admin.tsx      # Admin screen (users, export, import tabs)
│   │   ├── constants/colors.ts # Brand colors (#000000 primary, #BB935B accent)
│   │   ├── constants/layout.ts # Layout constants (spacing, radius, elevation)
│   │   ├── constants/crm.ts   # Shared CRM constants (statuses, priorities, relationship types, colors)
│   │   ├── constants/api.ts   # API base URL config (reads EXPO_PUBLIC_DOMAIN)
│   │   ├── components/TwoFactorScreen.tsx  # Admin 2FA gate (TOTP + email code, with logout)
│   │   ├── components/LoginScreen.tsx      # Replit OAuth login trigger
│   │   ├── components/HistoryModal.tsx     # Shared revision history modal
│   │   ├── components/ActivityList.tsx     # Shared activity timeline component
│   │   ├── components/LinkedInLogModal.tsx # Shared LinkedIn message log modal
│   │   ├── components/ProfilePicModal.tsx  # Shared profile picture upload modal
│   │   ├── components/ErrorBoundary.tsx    # Error boundary wrapper
│   │   ├── components/ErrorFallback.tsx    # Error fallback UI
│   │   ├── lib/api.ts         # All API client methods
│   │   └── lib/auth.tsx       # AuthProvider: OIDC flow, SecureStore token, 2FA status
│   ├── api-server/            # Express API server
│   │   ├── src/routes/        # leads, contacts, activities, templates, sequences, broadcasts,
│   │   │                      # triggers, settings, dashboard, email, calendar, auth, admin,
│   │   │                      # ai, twoFactor, diagnostics
│   │   ├── src/middlewares/authMiddleware.ts  # Session auth + live DB user check
│   │   ├── src/middlewares/requireAuth.ts     # Auth gate middleware
│   │   ├── src/middlewares/requireAdmin.ts    # Admin role + 2FA verified guard
│   │   ├── src/lib/errors.ts  # AppError, notFound, badRequest, parseIntParam, errorHandler
│   │   ├── src/lib/validation.ts # Zod schemas for all entities, validate() helper
│   │   ├── src/lib/crud.ts    # findOwned() ownership-scoped record lookup
│   │   ├── src/lib/gmail.ts   # Gmail send via googleapis
│   │   ├── src/lib/calendar.ts # Google Calendar client via googleapis
│   │   ├── src/lib/notion.ts  # Notion sync via connectors-sdk
│   │   ├── src/lib/notionSync.ts # Fire-and-forget Notion sync helpers
│   │   ├── src/lib/ai/          # AI agent team (Coach/Cleo/Miles)
│   │   │   ├── agentDefinitions.ts  # Agent system prompts and tool schemas
│   │   │   ├── orchestrator.ts      # Chat orchestration (classify→route→stream)
│   │   │   ├── toolExecutor.ts      # CRM tool execution for agents
│   │   │   └── insightWorker.ts     # Background daily insight generation
│   │   ├── src/lib/dripWorker.ts # Background drip sequence email worker (60s interval)
│   │   ├── src/lib/audit.ts   # Fire-and-forget audit trail logger
│   │   ├── src/lib/seed.ts    # Per-user default settings seeder
│   │   ├── src/lib/auth.ts    # Session management (create/get/update/delete)
│   │   ├── src/lib/horizonSync.ts # Horizon CRM pull sync (uses CRM_API_KEY)
│   │   └── src/app.ts         # Express app with centralized errorHandler middleware
│   └── mockup-sandbox/        # Component preview server (Vite)
├── lib/
│   ├── api-spec/              # OpenAPI spec + Orval codegen
│   ├── api-client-react/      # Generated React Query hooks
│   ├── api-zod/               # Generated Zod schemas
│   └── db/                    # Drizzle ORM schema + DB client
│       └── src/schema/        # leads, contacts, activities, emailTemplates, dripSequences,
│                              # broadcasts, triggerRules, settings, calendarEvents,
│                              # auth (users + sessions + user_2fa), agentRegistry,
│                              # aiInsights, conversations, messages, onboardingProgress
├── scripts/
│   └── post-merge.sh          # Runs after task merges: pnpm install + db push
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

## Key Patterns

### Error Handling (API)
- `AppError(statusCode, msg)` for operational errors; thrown in routes, caught by centralized `errorHandler` in `app.ts`
- `ValidationError` from Zod failures via `validate()` helper
- Real error details logged server-side only; generic "Internal server error" sent to client for 500s
- `parseIntParam(val, name)` validates numeric URL params; throws 400 on non-integer
- `findOwned(table, id, userId)` looks up a record scoped by ownership; throws 404 if missing

### Input Validation (API)
- All mutating endpoints use `validate(schema, body)` with Zod schemas defined in `validation.ts`
- Zod import: `import { z } from "zod"` in api-server routes/lib (NOT `zod/v4`); schema files in `lib/db` use `zod/v4`

### Drip Worker (Row-Level Locking)
- Uses `lockedAt` column on `drip_enrollments` for row-level locking
- `tryLockEnrollment()` acquires lock; `unlockEnrollment()` releases it
- Stale lock timeout: 5 minutes (LOCK_TIMEOUT_MS)
- `isProcessing` flag as secondary guard against concurrent workers

### AI Agent Team (Coach/Cleo/Miles)
- Three-agent system using master/apprentice model via OpenAI (Replit proxy)
- **Coach**: Main agent users interact with; orchestrates Cleo and Miles
- **Cleo** (Relationship Manager): Handles contact/lead relationship queries via CRM tools
- **Miles** (Strategy Advisor): Handles pipeline strategy, follow-up planning
- Models: `gpt-5.2` (main agents), `gpt-5-nano` (routing classification), `gpt-5-mini` (insight framing)
- Streaming SSE responses for chat; conversation history persisted in DB
- Background insight worker runs daily, generates AI insights per user
- Rate-limited insight generation endpoint (5min cooldown per user)
- DB tables: `conversations`, `messages`, `ai_insights`, `agent_registry`, `onboarding_progress`
- Mobile: AI chat tab, dashboard AiInsightCards, lead/contact detail AiAlertBanner

### Mobile Auth Flow
- `AuthProvider` in `lib/auth.tsx` wraps the app; `AuthGate` in `_layout.tsx` enforces auth
- Login: `promptAsync()` opens Replit OIDC in system browser → redirects back with code → `POST /api/mobile-auth/token-exchange` → session token stored in `expo-secure-store` as `auth_session_token`
- All API requests attach `Authorization: Bearer <token>` header
- 401 responses auto-clear token and return user to login screen
- Admin users hit `TwoFactorScreen` before accessing the app if 2FA not yet verified in session
- Logout available from Settings and from the TwoFactorScreen

### Mobile Shared Components
- `TwoFactorScreen` — Admin 2FA gate with TOTP QR setup, TOTP verify, email code send/verify, and logout button
- `ActivityDetailModal` — view/edit activity details in a popup modal
- `EventDetailModal` — view/edit calendar event details in a popup modal
- `HistoryModal` — revision history with snapshot viewer and rollback
- `ActivityList` — activity timeline with type-based dot colors
- `LinkedInLogModal` — log LinkedIn messages with subject/message
- `ProfilePicModal` — upload or paste URL for profile pictures

### Mobile Constants (crm.ts)
- `LEAD_STATUSES`, `STATUS_LABELS`, `STATUS_COLORS` — lead pipeline constants
- `LEAD_SOURCES` — lead source options
- `REL_TYPES`, `REL_COLORS` — relationship type constants
- `PRIORITIES`, `PRIORITY_COLORS` — priority level constants
- `ACTION_LABELS`, `ACTION_COLORS` — audit action display constants

## Key Features

### Horizon Funnel (Lead Tracking)
- Kanban view (horizontal scroll) + list view toggle
- Stages: new → contacted → interested → engaged → converted
- Swipe gestures to advance/retreat status (PanResponder + haptics)
- Beta tag (boolean) with counter showing filled/total (configurable in Settings)
- Horizon sync: pull leads and contacts from Horizon CRM via `POST /api/horizon/sync`
- Lead detail: status changes, beta toggle, notes, inline field editing, email composer, LinkedIn message form, file attachments, profile pictures, Gmail deep links, sequence enrollment

### Business Connections (Contacts)
- All contacts + follow-up queue tabs
- Relationship types: investor, partner, advisor, vendor, press, other
- Priority levels: high, medium, low
- Mark as contacted (auto-schedules 7-day follow-up)
- Contact detail: call, email, LinkedIn, activity history, inline field editing, file attachments, profile pictures, Gmail deep links, sequence enrollment
- **File Library**: Upload, view, and manage reusable files (pitch decks, one-pagers)
- **Email attachments**: Attach files from library or recipient's files when composing
- **Email tracking**: Gmail message/thread IDs captured; deep links to Gmail; webhook for reply detection
- **Object Storage**: Replit object storage (GCS-backed) for file uploads and profile pictures

### Communications Hub
- **Templates**: Reusable email templates with merge tags (`{{first_name}}`, `{{company_name}}`, `{{founder_name}}`)
- **Sequences**: Multi-step drip email flows with configurable delays per step
- **Broadcasts**: 4-step wizard (select segment → choose template → preview recipients → confirm & send)

### Dashboard
- Stats: total leads, this week, contacts, emails sent, follow-ups due, beta filled
- Beta slots progress bar (filled/total)
- Follow-up queue quick access
- AI insight cards

### Settings
- **Profile**: Edit first/last name, profile image, view email and role badge
- **General**: app name, founder name, beta slot total
- **Integration status**: Gmail + Notion + Google Calendar
- **Notion Sync**: configurable database IDs for leads, contacts, and activities
- **Trigger rules**: auto-actions when lead status changes (enroll in sequence, schedule follow-up)
- **User Management** (admin only): list users, create users, toggle roles, enable/disable accounts
- **System Diagnostics** (admin only): collapsible panel — service health (DB/AI/Horizon), integration status, environment info, database table row counts, last 24h activity, recent AI conversations, recent audit log

### Admin Panel
- Separate admin screen (accessible from hamburger menu when admin + 2FA verified)
- Three tabs: Users (manage all users), Export (leads/contacts/activities as JSON or CSV), Import (leads/contacts from JSON or CSV or paste)

## Authentication

- **Replit OAuth (OIDC/PKCE)** — login via Replit identity provider
- Mobile: `expo-auth-session` PKCE flow → `POST /api/mobile-auth/token-exchange` → session token in `expo-secure-store`
- Auth middleware checks live DB state on every request (role, isActive) — no stale sessions
- `userId` stripped from all client payloads to prevent ownership tampering
- Sessions stored in PostgreSQL `sessions` table; users in `users` table (id, email, firstName, lastName, profileImageUrl, role, isActive)
- First user upserted from Replit OIDC claims; role set manually or by existing admin

### Admin 2FA
- Required for all admin-role users before accessing the app
- Enrollment options: **TOTP** (Google Authenticator / any TOTP app) or **Email code**
- TOTP: scanned via QR code or entered manually; verified with 1-window tolerance; `totpVerified` persisted in `user_2fa`
- Email code: 6-digit random code, 10-minute expiry, sent via Gmail integration
- `twoFactorVerified` flag stored per-session; `requireAdmin` middleware checks both `role=admin` AND `twoFactorVerified=true`
- TwoFactorScreen has Log Out button so admins can escape the gate if needed

### Auth Endpoints
- `GET /api/auth/login` — OIDC redirect (web flow)
- `GET /api/auth/callback` — OIDC callback (web flow)
- `POST /api/mobile-auth/token-exchange` — exchange PKCE code for session token (mobile flow)
- `GET /api/auth/user` — current user state
- `PUT /api/auth/profile` — update firstName, lastName, profileImageUrl
- `POST /api/mobile-auth/logout` — mobile logout (clears session)
- `GET /api/logout` — web logout redirect
- `GET /api/2fa/status` — 2FA enrollment + session verification status
- `POST /api/2fa/totp/enroll` — generate TOTP secret + QR URI
- `POST /api/2fa/totp/verify` — verify TOTP code, mark session as 2FA verified
- `POST /api/2fa/email/send` — generate + email 6-digit code
- `POST /api/2fa/email/verify` — verify email code, mark session as 2FA verified

### Admin Endpoints (admin role + 2FA required)
- `GET /api/admin/users` — list all users
- `POST /api/admin/users` — create user
- `PUT /api/admin/users/:id` — update role/isActive
- `GET /api/admin/diagnostics` — system health check (DB, AI, Horizon, integrations, env, tables)
- `GET /api/admin/recent-errors` — recent audit log, AI conversations, 24h activity

### User Roles
- `user` — standard access to own data
- `admin` — full access + user management + diagnostics (requires 2FA)

### Multi-User Data Scoping
All CRM data is scoped by `userId` column:
- leads, contacts, activities, email_templates, drip_sequences, broadcasts, trigger_rules, app_settings, calendar_events
- Settings keyed by `(key, userId)` pair
- Default settings seeded per-user on first login

## Audit Trail & Revision History

- `audit_log` table stores every CUD operation: entityType, entityId, action, userId, beforeSnapshot (JSONB), afterSnapshot (JSONB), createdAt
- Indexed on (entityType, entityId), userId, and createdAt
- Fire-and-forget `logAudit()` helper — non-blocking, catches its own errors
- History API: `GET /api/history/:entityType/:entityId`
- Rollback API: `POST /api/history/:entityType/:entityId/rollback/:revisionId`
- Mobile: Lead and contact detail screens have a clock icon to open a History modal

## Database Schema

Tables: leads, contacts, activities, email_templates, drip_sequences, drip_sequence_steps, drip_enrollments (lockedAt for row locking), broadcasts, trigger_rules, app_settings (key+userId unique), sessions, users (role, isActive), user_2fa (method, totp_secret, totp_verified, email_code, email_code_expires_at), calendar_events, files, lead_files, contact_files, audit_log, agent_registry, conversations, messages, ai_insights, onboarding_progress

### Database Indexes
- userId indexes on all user-scoped tables
- FK constraint indexes on join tables
- Unique constraints: settings (key+userId), lead_files (leadId+fileId), contact_files (contactId+fileId)
- Audit log indexed on (entityType+entityId), userId, createdAt

### DB Push
- Cannot run `pnpm run push` interactively in Replit — apply schema changes via `code_execution` SQL or the post-merge script
- Post-merge script (`scripts/post-merge.sh`) runs `pnpm install --frozen-lockfile && pnpm --filter db push` automatically after task merges and on deployment

## Design

- **Colors**: Black primary (#000000), Gold accent (#BB935B), White background (#FFFFFF), textSecondary (#666666), textTertiary (#767676) — all WCAG AA compliant
- **Typography**: Multi-font brand system — Lato (titles), League Spartan (headings/buttons), Montserrat (subtitles/captions), Space Grotesk (body text)
- **Brand Voice**: Founder-to-founder, direct, no fluff. Earned empathy, clarity over polish, functional optimism. NOT corporate, NOT startup-bro hype.
- **Navigation**: NativeTabs with liquid glass on iOS 26+, classic blur tabs fallback. 5-tab limit enforced.
- **Icons**: SF Symbols on iOS, Feather icons on web/Android
- **Tab bar**: Dashboard, Funnel, Contacts, Calendar, Files (+ hidden: AI, Comms)

## Expo Go

The app is optimized for testing via Expo Go (no TestFlight / Apple Dev Program needed):
- `newArchEnabled: false` in `app.json` for library compatibility
- All Expo SDK 54 package versions pinned correctly (no version warnings)
- Hot reload enabled (no `CI=1` in dev script)
- Dev server exposes Metro at `exp://` URL for QR code scanning
- Static build + landing page system (`scripts/build.js` + `server/serve.js`) for production Expo Go distribution

## API Endpoints

All mounted at `/api`, all CRM endpoints require auth and scope by userId:
- `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`, `PATCH /leads/:id/status`
- `GET/POST /contacts`, `GET /contacts/follow-ups`, `GET/PUT/DELETE /contacts/:id`, `POST /contacts/:id/mark-contacted`
- `GET/POST /activities`
- `GET/POST /templates`, `GET/PUT/DELETE /templates/:id`
- `GET/POST /sequences`, `GET/PUT/DELETE /sequences/:id`, `POST /sequences/:id/steps`, `POST /sequences/:id/enroll`
- `GET/POST /broadcasts`, `GET /broadcast-preview`
- `GET/POST/DELETE /triggers`
- `GET/PUT /settings`
- `GET /dashboard`
- `POST /email/send`
- `GET/POST/DELETE /files`, `POST /files/upload`
- `GET/POST/DELETE /leads/:id/files`, `GET/POST/DELETE /contacts/:id/files`
- `POST /storage/uploads/request-url`, `GET /storage/objects/*`
- `POST /gmail/webhook`, `POST /gmail/watch`, `GET /gmail/profile`
- `POST /horizon/sync`
- `GET/POST /calendar/events`, `DELETE /calendar/events/:id`
- `GET /history/:entityType/:entityId`, `POST /history/:entityType/:entityId/rollback/:revisionId`
- Admin: `GET/POST /admin/users`, `PUT /admin/users/:id`, `GET /admin/diagnostics`, `GET /admin/recent-errors`

## Gmail Integration

Connection ID: `conn_google-mail_01KKQYC5ZK0BWADJWDAWCZDHM0`
Uses `getUncachableGmailClient()` pattern — never cache the OAuth client.
Supports multipart MIME attachments, returns message/thread IDs.
Gmail push notifications via Pub/Sub watch for tracking replies on app-initiated threads.

## Google Calendar Integration

Connection ID: `conn_google-calendar_01KKR2MGZF170P7X5CN0DSXS9B`
Uses `getUncachableGoogleCalendarClient()` each time — never caches the client.
Calendar events stored locally in `calendar_events` table and synced to Google Calendar on create/delete.

## Notion Integration

Connection ID: `conn_notion_01KKQYFGA5AE7WTYAEPM4YNB09`
Uses `connectors.proxy("notion", "/v1/...")` from `@replit/connectors-sdk`.
One-way sync: app → Notion for leads, contacts, activities.
Sync is fire-and-forget via `notionSync.ts`.
Notion database IDs configured in Settings: `notion_leads_db`, `notion_contacts_db`, `notion_activities_db`.

## Horizon Integration

Pulls leads (users) and contacts (contact submissions) from Horizon CRM.
Auth: `CRM_API_KEY` header (`X-CRM-API-KEY`) to `HORIZON_BASE_URL` (base URL only, no trailing slash).
`POST /api/horizon/sync` — full pull sync; `POST /api/horizon/webhook` — inbound push.

## Drip Sequence Worker

Background `setInterval` worker (60s) in `dripWorker.ts`.
Processes active enrollments where `nextSendAt <= now`.
Row-level locking via `lockedAt` column (5-minute stale lock timeout).
Marks enrollment `completed` when all steps done, `error` if recipient/template missing.

## Settings Format

`PUT /api/settings` accepts flat `{ "key": "value" }` object, NOT `{ settings: [{key, value}] }`.

## Known Notes

- Admin users must complete 2FA enrollment on first login before accessing anything
- `requireAdmin` middleware checks both `role=admin` AND session `twoFactorVerified=true`
- Production DB schema is synced via `pnpm --filter db push` during deployment build step
- Gmail integration must be authorized via Replit Integrations panel before email features work
- Notion sync requires database IDs entered in Settings; databases must be shared with the Notion integration
