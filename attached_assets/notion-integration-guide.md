# Notion Integration Guide

## How to Connect Notion

### Step 1: Create a Notion Integration (OAuth App)

1. Go to [notion.com/my-integrations](https://notion.com/my-integrations) → **New integration**
2. Type: **Public** (required for OAuth — "Internal" integrations use a static token, not OAuth)
3. Under **OAuth Domain & URIs**, set the redirect URI to:
   - Local dev: `http://localhost:8080/api/integrations/notion/callback`
   - Production: `https://anthology-fiesta.onrender.com/api/integrations/notion/callback`
4. Copy the **OAuth client ID** and **OAuth client secret**

### Step 2: Set Environment Variables

Add to your `.env`:

```
NOTION_CLIENT_ID=your_client_id
NOTION_CLIENT_SECRET=your_client_secret
```

Without these, the OAuth config returns `null` and the connect button will not work.

### Step 3: Connect via the App

From Settings → Integrations, connect Notion. This triggers the standard OAuth flow:

```
POST /api/integrations/notion/connect
  → redirect to Notion authorization page
  → GET /api/integrations/notion/callback
```

The access token is encrypted at rest via AES-256-GCM.

---

## Creating the Notion Databases

The app does **not** auto-create Notion databases. You create them manually in Notion, then paste their IDs into Fiesta settings.

You need up to 3 databases — only create the ones you want to sync.

### Leads Database

| Property | Type |
|----------|------|
| `Name` | Title |
| `Email` | Email |
| `Status` | Select |
| `Source` | Select |
| `Is Beta` | Checkbox |

### Contacts Database

| Property | Type |
|----------|------|
| `Name` | Title |
| `Email` | Email |
| `Company` | Text (rich_text) |
| `Type` | Select |
| `Priority` | Select |

### Activities Database

| Property | Type |
|----------|------|
| `Type` | Title |
| `Direction` | Select |
| `Subject` | Text (rich_text) |
| `Note` | Text (rich_text) |

> **Property names are case-sensitive.** The pull worker reads them by exact name — a mismatch silently skips the field.

---

## Getting the Database ID

Open the database in Notion and copy the URL. The database ID is the UUID segment:

```
https://notion.so/My-Leads-abc123def456...
                   ^^^^^^^^^^^^^^^^^^^^^^^^  ← this is the ID
```

---

## Step 4: Save the Database IDs in Settings

Set these keys via the app Settings screen or the settings API:

| Setting key | Value |
|-------------|-------|
| `notion_leads_db` | Your leads database ID |
| `notion_contacts_db` | Your contacts database ID |
| `notion_activities_db` | Your activities database ID |

These are stored in the `app_settings` table and read by both the export endpoint and the pull worker.

---

## How Sync Works After Setup

### CRM → Notion (push)
- Happens automatically on lead/contact/activity saves (fire-and-forget)
- Full export available via `POST /api/integrations/notion/export`
- Rate-limited to ~3 requests/second to stay within Notion API limits

### Notion → CRM (pull)
- The `notionPullWorker` runs every **5 minutes** (first run 3 minutes after server startup)
- Queries each database for pages edited since `last_notion_pull_at`
- Upserts into the CRM using **last-write-wins** conflict resolution

### Deduplication Logic
1. Match by `notionPageId` first
2. Fall back to match by `email` if no page ID match exists
3. If neither matches, insert as a new record (requires email to be present)

Activities are insert-only from Notion — existing activity records are never overwritten by the pull worker.
