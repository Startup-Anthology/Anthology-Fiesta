# Fiesta CRM

Fiesta is a mobile CRM built for solo founders — manage your leads, contacts, follow-ups, email outreach, and AI coaching in one focused app, without the enterprise bloat. Your relationships, your pipeline, one place.

Available as a **PWA** at [fiesta.startupanthology.com](https://fiesta.startupanthology.com) and as a native app via Expo Go.

## What it does

- **Leads funnel** — Kanban pipeline (new → contacted → interested → engaged → converted) with swipe gestures, beta slot tracking, and Horizon sync
- **Business connections** — Contact management with relationship types, follow-up queue, priority levels, and LinkedIn logging
- **Communications** — Email templates, drip sequences, and broadcast campaigns via Gmail or Outlook
- **AI assistant** — Three-agent team (Coach, Cleo, Miles) for CRM queries and founder coaching
- **Calendar** — Event management synced two-ways with Google Calendar or Outlook Calendar
- **File library** — Pitch decks, one-pagers attached to leads/contacts and sent as email attachments
- **Audit trail** — Every create/update/delete is logged with full before/after snapshots; one-tap rollback to any revision
- **Slack notifications** — Real-time CRM event notifications and daily pipeline digest to your Slack channel
- **Notion sync** — Two-way sync between CRM and Notion databases, plus full database export
- **Horizon integration** — Auto-sync users from [horizon.startupanthology.com](https://horizon.startupanthology.com) into your pipeline every 15 minutes

## Architecture

```
                     Cloudflare CDN
                          │
              fiesta.startupanthology.com
                          │
                   ┌──────┴──────┐
                   │   Render    │
                   │  Web Svc    │
                   └──────┬──────┘
                          │
              ┌───────────┴───────────┐
              │    Express Server     │
              │                       │
              │  /api/*  → API routes │
              │  /*      → PWA build  │
              └───────────┬───────────┘
                          │
                   ┌──────┴──────┐
                   │    Neon     │
                   │ PostgreSQL  │
                   └─────────────┘
```

Single-service architecture: one Express server serves both the REST API and the PWA static build. No CORS complexity on web — same-origin requests.

## Running locally

### Prerequisites

- Node.js 24+, pnpm 10, PostgreSQL 16

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

Hashed JS/CSS assets are cached for one year. HTML and the service worker are never cached so updates are picked up immediately on next open.

## Authentication

Login uses **email/password**. Register an account via `POST /api/auth/register`, then log in via `POST /api/auth/login`.

Sessions are stored in PostgreSQL and delivered via cookie (`sid`, 7-day TTL) or `Authorization: Bearer <sid>` header. On web, `credentials: 'include'` ensures cookie auth works in standalone PWA mode. On native, the session token is stored in `expo-secure-store`.

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
3. In **Settings → General → Notion Sync**, paste your Notion database IDs (Leads DB, Contacts DB, Activities DB)
4. Two-way sync runs automatically every 5 minutes (Notion → CRM, last-write-wins conflict resolution)
5. Use **Export All to Notion** in integrations to bulk-sync your entire database

### Slack
1. Set `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` in `.env`
2. Connect Slack from **Settings → Integrations**
3. In **Settings → General → Slack**, enter the Channel ID for notifications
4. Enable **Daily Digest** toggle and set the send hour (UTC) for a daily pipeline summary

CRM events that trigger Slack notifications:
- New lead created
- Lead status changed
- New contact added
- Sequence enrollment
- Horizon sync completed (when new records found)

### Horizon CRM
1. Set `CRM_API_KEY` and `HORIZON_BASE_URL` in `.env`
2. Use **Sync Now** in **Settings → Integrations → CRM Sync** for manual sync
3. Auto-sync runs every 15 minutes (Horizon users → leads, Horizon contacts → contacts)
4. Sync status and last sync stats are displayed in the integrations UI

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

## Deployment

### Infrastructure

| Component | Service | Purpose |
|---|---|---|
| Database | [Neon](https://neon.tech) | PostgreSQL 16, point-in-time recovery |
| Hosting | [Render](https://render.com) | Single Web Service (Node 24) |
| DNS/CDN | [Cloudflare](https://cloudflare.com) | TLS, DDoS protection, edge caching |
| Domain | `fiesta.startupanthology.com` | CNAME → Render |

### Build & Deploy

```bash
# Build command (Render)
pnpm install --frozen-lockfile && pnpm run build && cd artifacts/mobile && npx expo export --platform web

# Start command (Render)
node artifacts/api-server/dist/index.js
```

The build chains: typecheck + bundle API server → export web PWA → Express serves both `/api/*` and static files.

### Background Workers

These run inside the same process (no separate worker dyno needed):

| Worker | Interval | Purpose |
|---|---|---|
| Drip campaign | 60s | Sends scheduled drip sequence emails |
| AI Insights | 24h | Generates daily insight cards per user |
| Slack Digest | 1h check | Posts daily pipeline summary to Slack |
| Notion Pull | 5 min | Polls Notion for changes → syncs into CRM |
| Horizon Sync | 15 min | Auto-syncs Horizon users/contacts into CRM |

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
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack OAuth (notifications + digest) |
| `AI_MAIN_MODEL` | Override main AI model (default: gpt-4o) |
| `AI_ROUTER_MODEL` | Override router/classifier model (default: gpt-4o-mini) |
| `CRM_API_KEY` | API key for Horizon CRM sync |
| `HORIZON_BASE_URL` | Base URL for Horizon (e.g. `https://horizon.startupanthology.com`) |
| `HORIZON_WEBHOOK_SECRET` | Secret for inbound Horizon webhook verification |
| `HORIZON_DEFAULT_USER_ID` | Assign synced records to a specific user (default: first active user) |
| `API_BASE_URL` | Server base URL, used for OAuth callbacks and Gmail webhook audience fallback |
| `GMAIL_WEBHOOK_AUDIENCE` | Gmail PubSub webhook audience (overrides `API_BASE_URL`) |
| `INTEGRATION_SUCCESS_REDIRECT` | Post-OAuth redirect URL (default: `/`) |

## Tech stack

- **Mobile**: Expo SDK 54, React Native 0.81, Expo Router 6, TanStack React Query v5
- **Web/PWA**: Metro web bundler, service worker for app shell caching, installable on iOS/Android/desktop
- **API**: Express 5, TypeScript 5.9, Drizzle ORM 0.45
- **Database**: PostgreSQL 16 (Neon in production)
- **Auth**: Email/password (bcryptjs, salt 12), DB-backed sessions (7-day TTL), 2FA for admin
- **AI**: OpenAI direct (gpt-4o / gpt-4o-mini), 3-agent architecture with intent classification
- **Integrations**: Gmail, Outlook, Google Calendar, Outlook Calendar, Notion (two-way), Slack (notifications + digest), Horizon CRM (auto-sync)
- **Security**: AES-256-GCM token encryption, CORS allowlist, rate limiting, HSTS, X-Frame-Options DENY
- **Typography**: Space Grotesk (Regular / Medium / SemiBold / Bold)
- **Monorepo**: pnpm 10 workspaces, Node 24
