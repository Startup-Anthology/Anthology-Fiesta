# Fiesta CRM

Mobile-first CRM for solo founders. Full-stack monorepo on Replit.

## Tech Stack

- **Backend**: Express 5, TypeScript 5.9, Drizzle ORM 0.45, PostgreSQL 16
- **Frontend**: Expo SDK 54 (React Native), React 19, React Query v5, Tailwind CSS v4
- **AI**: OpenAI via Replit proxy (gpt-5.2, gpt-5-mini, gpt-5-nano), 3-agent architecture (Coach/Cleo/Miles)
- **Auth**: Replit OIDC/PKCE OAuth, session-based with 2FA (TOTP + email) for admin
- **Integrations**: Gmail, Google Calendar, Notion (via Replit connectors), Horizon CRM (API key)
- **Package Manager**: pnpm with workspaces

## Project Structure

```
artifacts/
  api-server/       # Express API (port 8080)
  mobile/           # Expo mobile app
  mockup-sandbox/   # Component preview server
lib/
  db/               # Drizzle ORM schema + config
  api-spec/         # API specification (Orval)
  api-zod/          # Zod validation schemas
  api-client-react/ # React Query client hooks
  integrations-openai-ai-server/  # OpenAI server integration
  integrations-openai-ai-react/   # OpenAI client integration
scripts/            # Build and utility scripts
```

## Key Commands

```bash
pnpm install                    # Install dependencies
pnpm --filter api-server dev    # Run API server in dev mode
pnpm --filter mobile dev        # Run Expo dev server
pnpm run build                  # Build all packages
pnpm --filter db push           # Push DB schema changes (drizzle-kit push)
pnpm --filter api-server lint   # Lint API server
```

## Environment Variables

Required (provided by Replit): `DATABASE_URL`, `PORT`, `REPL_ID`, `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`
Optional: `CRM_API_KEY`, `HORIZON_BASE_URL`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`

## Architecture Notes

- All DB queries are scoped by `userId` — never query without user filtering
- Audit trail on all CRUD operations via `logAudit()` with before/after JSONB snapshots
- Auth middleware: `requireAuth` for authenticated routes, `requireAdmin` + 2FA for admin routes
- Object ownership enforced via `findOwned()` helper in `lib/objectAcl.ts`
- AI uses a master-agent (Coach) that delegates to Cleo (relationships) and Miles (strategy) via keyword routing
- Drip campaign worker runs on node-cron (every 5 minutes)
- No test suite exists — only linting and type-checking in CI

## Known Issues (from March 2026 audit)

### Critical
- CORS is `origin: true` with credentials — must restrict to production domains
- Gmail webhook endpoints are unauthenticated — need signature verification
- AI orchestrator persists duplicate assistant messages (2x single-agent, 3x dual-agent)

### High
- Delete operations missing `userId` in WHERE clause (relies on pre-check only)
- Drip enrollment has no duplicate check — status toggling re-enrolls
- Admin 2FA can be bypassed via Bearer token auth path
- Storage download has no file ownership check
- `userId` columns are nullable in schema but app assumes non-null

### UI/UX
- No error states on any screen — silent empty data on API failures
- No offline detection or indicators
- Destructive actions (file remove, broadcast send) lack confirmation dialogs
- Missing accessibility labels on many interactive elements
