# Horizon CRM Integration Plan

## Overview
Horizon exposes secure, read-only API endpoints that your CRM can call to fetch user data and contact form submissions. No database sharing required — just simple HTTP requests.

## Authentication
All CRM endpoints require an API key in the request header:
```
X-CRM-API-KEY: <your-api-key>
```
The key is stored as `CRM_API_KEY` on the Horizon app. You'll use the same key value in your CRM app.

---

## Endpoint 1: Users

**`GET /api/crm/users`**

### Response Format
```json
[
  {
    "id": "abc-123",
    "fullName": "Jane Smith",
    "email": "jane@example.com",
    "isBetaUser": true,
    "effectivePlanTier": "premium",
    "hasForecasterPro": true,
    "status": "active",
    "createdAt": "2025-09-15T12:00:00.000Z"
  }
]
```

### Field Descriptions
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique user ID |
| `fullName` | string | First + last name (null if not set) |
| `email` | string | User email address |
| `isBetaUser` | boolean | Whether the user has an active beta invite |
| `effectivePlanTier` | string | `"free"`, `"pro"`, or `"premium"` (accounts for beta and admin overrides) |
| `hasForecasterPro` | boolean | Whether the user has an active Forecaster Pro subscription |
| `status` | string | `"active"`, `"blocked"`, or `"suspended"` |
| `createdAt` | string | ISO 8601 timestamp of when the user was created |

---

## Endpoint 2: Contact Form Submissions

**`GET /api/crm/contacts`**

Returns all submissions from the public Contact Us form, sorted newest first.

### Response Format
```json
[
  {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "subject": "Demo Request",
    "message": "I'd like to schedule a demo for my team.",
    "createdAt": "2026-03-15T10:30:00.000Z"
  }
]
```

### Field Descriptions
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Submission ID |
| `name` | string | Contact's name |
| `email` | string | Contact's email |
| `subject` | string | One of: General Inquiry, Partnership, Demo Request, Feedback, Other |
| `message` | string | Full message text |
| `createdAt` | string | ISO 8601 timestamp of when the form was submitted |

---

## Error Responses (both endpoints)
| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 429 | Rate limited (max 30 requests per 15 minutes) |
| 500 | Server error |

## CRM-Side Setup

### 1. Store the API Key
Add the Horizon API key as a secret in your CRM app:
- Secret name: `HORIZON_API_KEY`
- Value: *(same value as `CRM_API_KEY` in Horizon)*

### 2. Fetch Data
```javascript
const headers = { "X-CRM-API-KEY": process.env.HORIZON_API_KEY };
const baseUrl = "https://<horizon-deployed-url>";

// Fetch users
const usersResponse = await fetch(`${baseUrl}/api/crm/users`, { headers });
const users = await usersResponse.json();

// Fetch contact form submissions
const contactsResponse = await fetch(`${baseUrl}/api/crm/contacts`, { headers });
const contacts = await contactsResponse.json();
```

### 3. Use the Data
Examples of what you can do:
- Display Horizon users in a CRM contact list
- Segment users by plan tier (free vs pro vs premium)
- Filter beta testers for outreach
- Identify Forecaster Pro subscribers
- Track user status (active/blocked/suspended)
- Process incoming contact form leads
- Route demo requests to your sales pipeline
- Track partnership inquiries

## Notes
- Both endpoints are **read-only** — the CRM cannot modify Horizon data
- All records are returned in a single response (no pagination needed at current scale)
- Endpoints are rate limited to 30 requests per 15 minutes (shared limit)
- The endpoints are available on Horizon's deployed/published URL
