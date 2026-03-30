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
