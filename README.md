# Fiesta CRM

Fiesta is a mobile CRM built for solo founders — manage your leads, contacts, follow-ups, email outreach, and AI coaching in one focused app, without the enterprise bloat. Your relationships, your pipeline, one place.

## What it does

- **Leads funnel** — Kanban pipeline (new → contacted → interested → engaged → converted) with swipe gestures, beta slot tracking, and Horizon sync
- **Business connections** — Contact management with relationship types, follow-up queue, priority levels, and LinkedIn logging
- **Communications** — Email templates, drip sequences, and broadcast campaigns via Gmail
- **AI assistant** — Three-agent team (Coach, Cleo, Miles) for CRM queries and founder coaching
- **Calendar** — Event management synced to Google Calendar
- **File library** — Pitch decks, one-pagers attached to leads/contacts and sent as email attachments

## Running locally

Everything runs in Replit. Three services start automatically:

| Service | What it does |
|---|---|
| `artifacts/api-server` | Express API on port 8080 |
| `artifacts/mobile` | Expo dev server (web + Expo Go) |
| `artifacts/mockup-sandbox` | Component preview server |

The web version of the app is available in the Replit preview pane immediately.

## Using on your iPhone (Expo Go)

No TestFlight or Apple Developer Program needed.

1. Download **Expo Go** from the App Store
2. Open the Expo dev server logs and copy the `exp://` URL
3. In Expo Go, tap **Enter URL manually** and paste it

The app connects directly to the Replit dev server. Hot reload is enabled — changes reflect instantly.

## Authentication

Login uses **Replit OAuth**. Tap "Log In" and you'll be taken to Replit's sign-in page. After authorizing, you're redirected back to the app automatically.

**Admin users** are required to complete 2FA (TOTP authenticator app or email code) before accessing anything. You can always log out from the 2FA screen if needed.

## Setting up integrations

### Gmail
Required for sending emails and drip sequences.
1. In the Replit workspace, open **Integrations** → connect **Google Mail**
2. Authorize with your Google account
3. Gmail features are immediately available in the app

### Google Calendar
Required for syncing calendar events.
1. In Replit **Integrations** → connect **Google Calendar**
2. Authorize with your Google account

### Notion
One-way sync of leads, contacts, and activities into Notion databases.
1. In Replit **Integrations** → connect **Notion**
2. Create three Notion databases (Leads, Contacts, Activities) with the matching property names
3. In the Fiesta app → **Settings** → **Notion Sync** → paste each database ID

Notion database IDs are the long alphanumeric strings in Notion page URLs.

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

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (set automatically by Replit) |
| `CRM_API_KEY` | API key for Horizon CRM sync |
| `HORIZON_BASE_URL` | Base URL for Horizon (e.g. `https://horizon.startupanthology.com`) |
| `EXPO_PUBLIC_DOMAIN` | Replit dev domain — set automatically in dev script |
| `EXPO_PUBLIC_REPL_ID` | Replit ID used as OIDC client ID — set automatically |

## Tech stack

- **Mobile**: Expo SDK 54, React Native, Expo Router, TanStack React Query
- **API**: Express 5, TypeScript, Drizzle ORM
- **Database**: PostgreSQL
- **Auth**: Replit OAuth (OIDC/PKCE), expo-auth-session, expo-secure-store
- **AI**: OpenAI via Replit AI proxy (gpt-5.2 / gpt-5-mini / gpt-5-nano)
- **Monorepo**: pnpm workspaces
