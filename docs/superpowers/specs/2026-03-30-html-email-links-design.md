# HTML Email Links Design

**Date:** 2026-03-30
**Status:** Approved

## Problem

Email templates in Fiesta are stored and sent as `text/plain`. URLs in the template body do not auto-link in recipients' email clients. There is also no way to write anchor text (e.g. "Join the beta" pointing to a URL) — only raw URLs can be placed in the body.

## Solution

Add a server-side template body renderer that converts plain text to HTML, supporting:

1. **Auto-linking** — bare `https://...` URLs are wrapped in `<a>` tags automatically
2. **Markdown-style links** — `[link text](url)` syntax renders as `<a href="url">link text</a>`

Both Gmail and Outlook senders are updated to send `multipart/alternative` emails (HTML + plain text fallback), which is the standard approach for HTML-capable email.

## Architecture

### Renderer utility

New function `renderTemplateBody(text: string): { html: string; text: string }` in the API server (e.g. `artifacts/api-server/src/lib/emailRenderer.ts`).

**Called after merge tag substitution**, so `{{custom_link_1}}` is already a real URL before the renderer runs. This keeps concerns separate and means `[Join the beta]({{custom_link_1}})` works correctly.

**Processing order:**

1. HTML-escape the full text (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`) so contact field values can't inject HTML
2. Parse `[text](url)` markdown links → `<a href="url">text</a>` (URL is not escaped; text content is already escaped from step 1)
3. Auto-detect remaining bare `https?://[^\s]+` URLs → `<a href="url">url</a>` (skip URLs already inside an `<a>` tag)
4. Convert `\n` → `<br>`
5. Wrap in minimal HTML boilerplate: `<html><body style="font-family:sans-serif;">…</body></html>`

The `text` return value is the original substituted string (no modification), used for the plain text MIME part.

### Email senders

Both senders switch from single-part to `multipart/alternative`:

**`gmail.ts`** — currently builds a single `Content-Type: text/plain` MIME message. Updated to build a `multipart/alternative` message with:
- Part 1: `Content-Type: text/plain; charset=utf-8` — plain text body
- Part 2: `Content-Type: text/html; charset=utf-8` — HTML body

**`outlook.ts`** — currently sends `contentType: "Text"`. Updated to send `contentType: "HTML"` for the primary body. Outlook's Graph API does not support multipart/alternative directly; sending HTML is the standard approach and Outlook renders it correctly.

### Call sites

`renderTemplateBody()` is inserted after `replaceMergeTags()` in:

- `artifacts/api-server/src/lib/dripWorker.ts` — drip sequence email sends
- `artifacts/api-server/src/routes/broadcasts.ts` — broadcast email sends

These are the only two call sites where template bodies are rendered for outgoing email. Direct email compose (freeform, not template-based) is out of scope for this change.

### Template editor UI

`artifacts/mobile/app/template/[id].tsx` — the merge tag hint box at the bottom of the template editor gets one additional example line:

> `[Link text](url)` — renders as a clickable link

No other UI changes. The body field stays a plain text `TextInput`.

## Data flow

```
Template body (plain text, stored in DB)
  → replaceMergeTags()        [substitutes {{tags}} with real values]
  → renderTemplateBody()      [converts to { html, text }]
  → gmail.ts                  [sends multipart/alternative: text/plain + text/html]
  → outlook.ts               [sends HTML body via Graph API]
```

## Edge cases

- **Merge tags inside markdown links:** `[Join the beta]({{custom_link_1}})` — tag is substituted first, then the renderer sees a valid `[text](https://...)` and converts it correctly.
- **Empty link URL:** If a `{{custom_link_N}}` tag is empty (user hasn't set it in settings), the substituted result is `[text]()`. The renderer produces `<a href="">text</a>` — not broken, just an empty href. Acceptable for now.
- **HTML in contact field values:** Escaped in step 1, so `<script>` in a contact name does not inject HTML.
- **Existing plain text emails:** No schema change; the template body field stays `text`. The rendering is purely a send-time transformation.

## Files affected

| File | Change |
|------|--------|
| `artifacts/api-server/src/lib/emailRenderer.ts` | New file — `renderTemplateBody()` |
| `artifacts/api-server/src/lib/integrations/email/gmail.ts` | Switch to multipart/alternative |
| `artifacts/api-server/src/lib/integrations/email/outlook.ts` | Switch to HTML body |
| `artifacts/api-server/src/lib/dripWorker.ts` | Apply renderer after merge tag substitution |
| `artifacts/api-server/src/routes/broadcasts.ts` | Apply renderer after merge tag substitution |
| `artifacts/mobile/app/template/[id].tsx` | Add `[text](url)` hint to merge tag box |
