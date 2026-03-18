# Fiesta CRM

Fiesta is a mobile CRM built for solo founders — manage your leads, contacts, follow-ups, email outreach, and AI coaching in one focused app, without the enterprise bloat. Your relationships, your pipeline, one place.

## What it does

- **Leads funnel** — Kanban pipeline (new → contacted → interested → engaged → converted) with swipe gestures, beta slot tracking, and Horizon sync
- **Business connections** — Contact management with relationship types, follow-up queue, priority levels, and LinkedIn logging
- **Communications** — Email templates, drip sequences, and broadcast campaigns via Gmail
- **AI assistant** — Three-agent team (Coach, Cleo, Miles) for CRM queries and founder coaching
- **Calendar** — Event management synced two-ways with Google Calendar (auto-syncs on tab open)
- **File library** — Pitch decks, one-pagers attached to leads/contacts and sent as email attachments
- **Audit trail** — Every create/update/delete is logged with full before/after snapshots; one-tap rollback to any revision

## Running locally

### Prerequisites

- Node.js 20+, pnpm, PostgreSQL 16

### Setup

```bash
cp .env.example .env      # fill in required values
pnpm install
pnpm --filter db push     # push DB schema
```

Then start the services:

| Service | Command | What it does |
|---|---|---|
| `artifacts/api-server` | `pnpm --filter api-server dev:fast` | Express API on port 8080 |
| `artifacts/mobile` | `pnpm --filter mobile dev:fast` | Expo dev server (web + Expo Go) |
| `artifacts/mockup-sandbox` | `pnpm --filter mockup-sandbox dev` | Component preview server |

## Using on your iPhone (Expo Go)

No TestFlight or Apple Developer Program needed.

1. Download **Expo Go** from the App Store
2. Open the Expo dev server logs and copy the `exp://` URL
3. In Expo Go, tap **Enter URL manually** and paste it

The app connects to your local dev server. Hot reload is enabled — changes reflect instantly.

## Installing as a PWA (web)

When deployed, the app is a fully installable Progressive Web App:

1. Open the deployed URL in Safari (iOS) or Chrome (desktop/Android)
2. Tap **Share → Add to Home Screen** (iOS) or the install icon in the address bar (Chrome)
3. The app installs with its own icon, runs full-screen, and caches assets for fast load times

Hashed JS/CSS assets are cached for one year. HTML is never cached so updates are picked up immediately on next open.

## Authentication

Login uses **email/password**. Register an account via `POST /api/auth/register`, then log in via `POST /api/auth/login`.

Sessions are stored in PostgreSQL and delivered via cookie or `Authorization: Bearer <sid>` header. The mobile app stores the session token in `expo-secure-store`.

**Admin users** are required to complete 2FA (TOTP authenticator app or email code) before accessing anything. You can always log out from the 2FA screen if needed.

## Setting up integrations

Each user connects their own accounts from **Settings → Integrations** in the app.

### Gmail & Google Calendar
1. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
2. Tap **Connect** next to Gmail or Google Calendar in the app

### Outlook & Outlook Calendar
1. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` in `.env`
2. Tap **Connect** next to Outlook or Outlook Calendar in the app

### Notion
1. Set `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET` in `.env`
2. Connect Notion from **Settings → Integrations**
3. In **Settings → Notion Sync**, paste your Notion database IDs

OAuth tokens are encrypted at rest with AES-256-GCM using `INTEGRATION_ENCRYPTION_KEY`.

## Admin setup

The first account created becomes a regular user. To promote to admin:

1. Connect to the database and run:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
   ```
2. Log in to the app — you'll be prompted to enroll in 2FA
3. Choose **Authenticator App** (scan QR with Google Authenticator) or **Email Code**
4. After verifying, you'll have access to the full admin panel

The admin panel (accessible from the hamburger menu) includes user management, data export/import (JSON/CSV), and system diagnostics.

## Environment variables

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API server port (default 8080) |
| `AUTH_JWT_SECRET` | 256-bit hex secret for session signing |
| `INTEGRATION_ENCRYPTION_KEY` | 256-bit hex key for OAuth token encryption at rest |
| `OPENAI_API_KEY` | OpenAI API key |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS origins |

### Optional

| Variable | Purpose |
|---|---|
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | S3-compatible file storage |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Gmail + Google Calendar OAuth |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Outlook + Outlook Calendar OAuth |
| `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` | Notion OAuth |
| `AI_MAIN_MODEL` | Override main AI model (default: gpt-4o) |
| `AI_ROUTER_MODEL` | Override router/classifier model (default: gpt-4o-mini) |
| `CRM_API_KEY` | API key for Horizon CRM sync |
| `HORIZON_BASE_URL` | Base URL for Horizon (e.g. `https://horizon.startupanthology.com`) |
| `API_BASE_URL` | Server base URL, used for OAuth callbacks and Gmail webhook audience fallback |

## Tech stack

- **Mobile**: Expo SDK 54, React Native, Expo Router, TanStack React Query
- **Web/PWA**: Metro web bundler, SPA serving with long-lived asset cache, installable on iOS/Android/desktop
- **API**: Express 5, TypeScript, Drizzle ORM
- **Database**: PostgreSQL
- **Auth**: Email/password (bcryptjs), DB-backed sessions, expo-secure-store
- **AI**: OpenAI direct (gpt-4o / gpt-4o-mini), configurable via `AI_MAIN_MODEL`/`AI_ROUTER_MODEL`
- **Integrations**: Gmail, Outlook, Google Calendar, Outlook Calendar, Notion (per-user OAuth), Horizon CRM (API key)
- **Typography**: Space Grotesk (Regular / Medium / SemiBold / Bold)
- **Monorepo**: pnpm workspaces
