# HTML Email Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make URLs in email templates clickable and support `[text](url)` markdown link syntax, by rendering template bodies as HTML before sending via Gmail/Outlook.

**Architecture:** A new `renderTemplateBody(text)` utility converts a plain-text email body (after merge tag substitution) into `{ html, text }`. The HTML version is passed as an optional extra argument through `sendGmailEmail` → `GmailProvider.sendEmail` / `OutlookEmailProvider.sendEmail`, both of which are updated to send `multipart/alternative` (Gmail) or HTML body (Outlook) when the HTML variant is present.

**Tech Stack:** TypeScript, Node.js. No test framework exists in this project — verification steps use `pnpm run typecheck` instead of a test runner.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `artifacts/api-server/src/lib/emailRenderer.ts` | Create | `renderTemplateBody()` — HTML escape, markdown links, auto-link URLs, newline → `<br>` |
| `artifacts/api-server/src/lib/integrations/types.ts` | Modify | Add optional `htmlBody?: string` to `EmailProvider.sendEmail` interface |
| `artifacts/api-server/src/lib/integrations/email/gmail.ts` | Modify | `GmailProvider.sendEmail` — send `multipart/alternative` when `htmlBody` provided |
| `artifacts/api-server/src/lib/integrations/email/outlook.ts` | Modify | `OutlookEmailProvider.sendEmail` — send HTML body when `htmlBody` provided |
| `artifacts/api-server/src/lib/gmail.ts` | Modify | `sendGmailEmail` wrapper — accept and pass through `htmlBody?` |
| `artifacts/api-server/src/lib/dripWorker.ts` | Modify | Call `renderTemplateBody` after `replaceMergeTags`, pass `html` to `sendGmailEmail` |
| `artifacts/api-server/src/routes/broadcasts.ts` | Modify | Call `renderTemplateBody` after inline merge tag substitution, pass `html` to `sendGmailEmail` |
| `artifacts/mobile/app/template/[id].tsx` | Modify | Add `[text](url)` example line to the merge tag hint box |

---

### Task 1: Create `emailRenderer.ts`

**Files:**
- Create: `artifacts/api-server/src/lib/emailRenderer.ts`

- [ ] **Step 1: Create the file**

```typescript
// artifacts/api-server/src/lib/emailRenderer.ts

/**
 * Converts a plain-text email body (after merge tag substitution) into HTML.
 * Returns both html and text — callers pass both to the email provider.
 *
 * Processing order:
 *  1. HTML-escape text content (&, <, >)
 *  2. Parse [text](url) markdown links → <a href>
 *  3. Auto-link remaining bare https?:// URLs
 *  4. Convert \n → <br>
 *  5. Wrap in minimal HTML boilerplate
 */
export function renderTemplateBody(text: string): { html: string; text: string } {
  // Step 1: HTML-escape — prevents contact field values from injecting HTML
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Step 2: Markdown-style links [link text](url) → <a href="url">link text</a>
  // Brackets/parens are not HTML special chars so they survive step 1 unchanged.
  // URL is used as-is in the href (& was already escaped to &amp; in step 1,
  // which is the correct encoding for & inside HTML attributes).
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2">$1</a>',
  );

  // Step 3: Auto-link remaining bare URLs.
  // Negative lookbehind on [="'>] skips:
  //   - URLs already in href="..." attributes (preceded by ")
  //   - URLs that are the visible text of a processed <a> tag (preceded by >)
  //   - URLs in src='...' style attributes (preceded by ')
  html = html.replace(
    /(?<![="'>])https?:\/\/[^\s<"']+/g,
    (url) => `<a href="${url}">${url}</a>`,
  );

  // Step 4: Newlines → <br>
  html = html.replace(/\n/g, "<br>");

  // Step 5: Minimal boilerplate
  html = `<html><body style="font-family:sans-serif;">${html}</body></html>`;

  return { html, text };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/gentlecoma/Documents/Anthology-Fiesta
pnpm run typecheck:libs
```

Expected: passes (new file has no deps on unresolved types yet).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/emailRenderer.ts
git commit -m "feat: add renderTemplateBody utility for HTML email rendering"
```

---

### Task 2: Update `EmailProvider` interface

**Files:**
- Modify: `artifacts/api-server/src/lib/integrations/types.ts:22-27`

- [ ] **Step 1: Add `htmlBody?` to the interface**

Replace the `sendEmail` signature in `types.ts`:

```typescript
export interface EmailProvider {
  sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
    htmlBody?: string,
  ): Promise<SendEmailResult>;
  getHistory(startHistoryId: string): Promise<any>;
  getMessage(messageId: string): Promise<any>;
  getProfile(): Promise<{ email: string }>;
}
```

- [ ] **Step 2: Run typecheck (expect errors)**

```bash
pnpm run typecheck:libs
```

Expected: TypeScript will now complain that `GmailProvider` and `OutlookEmailProvider` don't satisfy the updated interface. That's correct — Tasks 3 and 4 fix this.

---

### Task 3: Update `GmailProvider.sendEmail`

**Files:**
- Modify: `artifacts/api-server/src/lib/integrations/email/gmail.ts:33-76`

- [ ] **Step 1: Replace `sendEmail` with the HTML-aware version**

Replace the entire `sendEmail` method (lines 33–76):

```typescript
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
    htmlBody?: string,
  ): Promise<SendEmailResult> {
    const gmail = this.getClient();
    const safeTo = sanitizeHeader(to);
    const safeSubject = sanitizeHeader(subject);

    let raw: string;
    const hasAttachments = attachments && attachments.length > 0;

    if (hasAttachments) {
      const mixedBoundary = generateBoundary();
      let mime = `To: ${safeTo}\r\nSubject: ${safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${mixedBoundary}"\r\n\r\n`;

      if (htmlBody) {
        const altBoundary = generateBoundary();
        mime += `--${mixedBoundary}\r\nContent-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
        mime += `--${altBoundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
        mime += `--${altBoundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${htmlBody}\r\n`;
        mime += `--${altBoundary}--\r\n`;
      } else {
        mime += `--${mixedBoundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
      }

      for (const att of attachments!) {
        const b64 = att.content.toString("base64");
        const safeName = sanitizeFilename(att.filename);
        const safeType = sanitizeMimeType(att.mimeType);
        mime += `--${mixedBoundary}\r\nContent-Type: ${safeType}; name="${safeName}"\r\nContent-Disposition: attachment; filename="${safeName}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`;
      }
      mime += `--${mixedBoundary}--`;
      raw = Buffer.from(mime).toString("base64url");
    } else if (htmlBody) {
      const altBoundary = generateBoundary();
      let mime = `To: ${safeTo}\r\nSubject: ${safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${altBoundary}"\r\n\r\n`;
      mime += `--${altBoundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n`;
      mime += `--${altBoundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${htmlBody}\r\n`;
      mime += `--${altBoundary}--`;
      raw = Buffer.from(mime).toString("base64url");
    } else {
      raw = Buffer.from(
        `To: ${safeTo}\r\nSubject: ${safeSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
      ).toString("base64url");
    }

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const messageId = response.data.id || "";
    const threadId = response.data.threadId || "";
    return {
      messageId,
      threadId,
      link: `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
    };
  }
```

---

### Task 4: Update `OutlookEmailProvider.sendEmail`

**Files:**
- Modify: `artifacts/api-server/src/lib/integrations/email/outlook.ts:31-56`

- [ ] **Step 1: Add `htmlBody?` and use HTML content type when provided**

Replace the `sendEmail` method (lines 31–56):

```typescript
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
    htmlBody?: string,
  ): Promise<SendEmailResult> {
    const message: Record<string, unknown> = {
      subject,
      body: htmlBody
        ? { contentType: "HTML", content: htmlBody }
        : { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    };

    if (attachments && attachments.length > 0) {
      message.attachments = attachments.map((att) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.filename,
        contentType: att.mimeType,
        contentBytes: att.content.toString("base64"),
      }));
    }

    await this.graphRequest("/me/sendMail", "POST", { message });
    const messageId = `outlook_${Date.now()}`;
    return { messageId, threadId: messageId, link: "https://outlook.live.com/mail" };
  }
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck:libs
```

Expected: passes — both providers now satisfy the updated `EmailProvider` interface.

- [ ] **Step 3: Commit tasks 2–4**

```bash
git add \
  artifacts/api-server/src/lib/integrations/types.ts \
  artifacts/api-server/src/lib/integrations/email/gmail.ts \
  artifacts/api-server/src/lib/integrations/email/outlook.ts
git commit -m "feat: update email providers to support optional HTML body (multipart/alternative)"
```

---

### Task 5: Update `sendGmailEmail` wrapper

**Files:**
- Modify: `artifacts/api-server/src/lib/gmail.ts:8-19`

- [ ] **Step 1: Add `htmlBody?` to the wrapper and pass it through**

Replace `sendGmailEmail` (lines 8–19):

```typescript
export async function sendGmailEmail(
  to: string,
  subject: string,
  body: string,
  attachments?: import("./integrations/types").EmailAttachment[],
  userId?: string,
  htmlBody?: string,
): Promise<import("./integrations/types").SendEmailResult> {
  if (!userId) throw new Error("userId required for sendGmailEmail");
  const provider = await getEmailProvider(userId);
  if (!provider) throw new Error("No email provider connected");
  return provider.sendEmail(to, subject, body, attachments, htmlBody);
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck:libs
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/gmail.ts
git commit -m "feat: thread htmlBody through sendGmailEmail wrapper"
```

---

### Task 6: Update `dripWorker.ts` call site

**Files:**
- Modify: `artifacts/api-server/src/lib/dripWorker.ts`

- [ ] **Step 1: Import `renderTemplateBody`**

At the top of `dripWorker.ts`, add the import after the existing imports (after line 14):

```typescript
import { renderTemplateBody } from "./emailRenderer";
```

- [ ] **Step 2: Apply renderer after merge tag substitution and pass HTML to sender**

Find this block (around lines 166–170):

```typescript
        const subject = replaceMergeTags(
          template.subject,
          recipient,
          founderName,
          userSettings
        );
        const body = replaceMergeTags(template.body, recipient, founderName, userSettings);

        await sendGmailEmail(recipient.email, subject, body, undefined, ownerId);
```

Replace with:

```typescript
        const subject = replaceMergeTags(
          template.subject,
          recipient,
          founderName,
          userSettings
        );
        const rawBody = replaceMergeTags(template.body, recipient, founderName, userSettings);
        const { html: htmlBody, text: body } = renderTemplateBody(rawBody);

        await sendGmailEmail(recipient.email, subject, body, undefined, ownerId, htmlBody);
```

- [ ] **Step 3: Update the activity log to store plain text body**

Find the activity insert a few lines below (around line 180). The `body` field is now the plain text version (unchanged — `renderTemplateBody` returns the original string as `text`), so no change needed there. Verify the insert still uses `body`:

```typescript
          .values({
            leadId: enrollment.leadId || null,
            contactId: enrollment.contactId || null,
            type: "email",
            direction: "sent",
            subject,
            body,       // ← this is now the plain text version, which is correct
            userId: ownerId,
          })
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter api-server exec tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/dripWorker.ts
git commit -m "feat: render drip email bodies as HTML before sending"
```

---

### Task 7: Update `broadcasts.ts` call site

**Files:**
- Modify: `artifacts/api-server/src/routes/broadcasts.ts`

- [ ] **Step 1: Import `renderTemplateBody`**

Add import after the existing imports at the top of `broadcasts.ts` (after line 7):

```typescript
import { renderTemplateBody } from "../lib/emailRenderer";
```

- [ ] **Step 2: Apply renderer after inline merge tag substitution**

Find this block (around lines 59–71):

```typescript
        emailBody = emailBody
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{company_name\}\}/g, recipient.company || "")
          .replace(/\{\{founder_name\}\}/g, founderName)
          .replace(/\{\{my_linkedin\}\}/g, userSettings.quick_link_my_linkedin || "")
          .replace(/\{\{company_linkedin\}\}/g, userSettings.quick_link_company_linkedin || "")
          .replace(/\{\{calendar_link\}\}/g, userSettings.quick_link_calendar || "")
          .replace(/\{\{custom_link_1\}\}/g, userSettings.quick_link_custom1_url || "")
          .replace(/\{\{custom_link_2\}\}/g, userSettings.quick_link_custom2_url || "")
          .replace(/\{\{custom_link_3\}\}/g, userSettings.quick_link_custom3_url || "");

        await sendGmailEmail(recipient.email, emailSubject, emailBody, undefined, userId);
```

Replace with:

```typescript
        emailBody = emailBody
          .replace(/\{\{first_name\}\}/g, firstName)
          .replace(/\{\{company_name\}\}/g, recipient.company || "")
          .replace(/\{\{founder_name\}\}/g, founderName)
          .replace(/\{\{my_linkedin\}\}/g, userSettings.quick_link_my_linkedin || "")
          .replace(/\{\{company_linkedin\}\}/g, userSettings.quick_link_company_linkedin || "")
          .replace(/\{\{calendar_link\}\}/g, userSettings.quick_link_calendar || "")
          .replace(/\{\{custom_link_1\}\}/g, userSettings.quick_link_custom1_url || "")
          .replace(/\{\{custom_link_2\}\}/g, userSettings.quick_link_custom2_url || "")
          .replace(/\{\{custom_link_3\}\}/g, userSettings.quick_link_custom3_url || "");

        const { html: htmlEmailBody, text: plainEmailBody } = renderTemplateBody(emailBody);

        await sendGmailEmail(recipient.email, emailSubject, plainEmailBody, undefined, userId, htmlEmailBody);
```

- [ ] **Step 3: Update the activity insert below to use `plainEmailBody`**

Find the activity insert a few lines below (around line 72):

```typescript
          type: "email",
          direction: "sent",
          subject: emailSubject,
          body: emailBody,
```

Replace `body: emailBody` with `body: plainEmailBody`:

```typescript
          type: "email",
          direction: "sent",
          subject: emailSubject,
          body: plainEmailBody,
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm --filter api-server exec tsc --noEmit
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/broadcasts.ts
git commit -m "feat: render broadcast email bodies as HTML before sending"
```

---

### Task 8: Update template editor UI hint

**Files:**
- Modify: `artifacts/mobile/app/template/[id].tsx:73-74`

- [ ] **Step 1: Add `[text](url)` example to the merge tag hint**

Find this block (around lines 73–74):

```tsx
      <View style={styles.mergeTagInfo}>
        <Feather name="info" size={14} color={colors.textTertiary} />
        <Text style={styles.mergeTagText}>Tags you can use: {"{{first_name}}"}, {"{{company_name}}"}, {"{{founder_name}}"}, {"{{my_linkedin}}"}, {"{{company_linkedin}}"}, {"{{calendar_link}}"}, {"{{custom_link_1}}"}, {"{{custom_link_2}}"}, {"{{custom_link_3}}"}</Text>
      </View>
```

Replace with:

```tsx
      <View style={styles.mergeTagInfo}>
        <Feather name="info" size={14} color={colors.textTertiary} />
        <Text style={styles.mergeTagText}>
          {"Tags you can use: {{first_name}}, {{company_name}}, {{founder_name}}, {{my_linkedin}}, {{company_linkedin}}, {{calendar_link}}, {{custom_link_1}}, {{custom_link_2}}, {{custom_link_3}}\n\nClickable links: [Link text](url) or paste a bare https:// URL"}
        </Text>
      </View>
```

- [ ] **Step 2: Run lint + typecheck**

```bash
pnpm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add artifacts/mobile/app/template/[id].tsx
git commit -m "feat: add link syntax hint to template editor merge tag info box"
```
