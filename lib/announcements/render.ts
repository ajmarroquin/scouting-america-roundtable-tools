// Turns an announcement written as plain text into email HTML and text. Kept
// simple on purpose: paragraphs, "- " lists, links, **bold**, and {first name}.
// Everything typed is escaped, so nothing a sender writes becomes markup.

/** Resend swaps these for each recipient when the broadcast goes out. */
export const UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}";
export const FIRST_NAME = "{{{contact.first_name|there}}}";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g;
const NAME_TOKEN = /\{\s*first\s*name\s*\}/gi;

/** One line of text as HTML: escaped, then links, bold, and the first-name token. */
function inline(line: string, firstName: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const m of line.matchAll(URL_PATTERN)) {
    parts.push(escapeHtml(line.slice(last, m.index)));
    const url = escapeHtml(m[0]);
    parts.push(`<a href="${url}" style="color:#1d4ed8">${url}</a>`);
    last = m.index! + m[0].length;
  }
  parts.push(escapeHtml(line.slice(last)));
  return parts
    .join("")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(NAME_TOKEN, firstName);
}

export type Rendered = { html: string; text: string };

export function renderAnnouncement(opts: {
  body: string;
  /** Who it's from, for the footer ("Sent by Sam Rivera for the BIG APPLE roundtable"). */
  footerFrom: string;
  /** The greeting value: Resend's per-contact token, or a real name for a test. */
  firstName?: string;
  /** The unsubscribe link: Resend's token, or a placeholder for a test. */
  unsubscribeUrl?: string;
}): Rendered {
  const firstName = opts.firstName ?? FIRST_NAME;
  const unsubscribe = opts.unsubscribeUrl ?? UNSUBSCRIBE_URL;
  const blocks = opts.body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trimEnd()));

  const html = blocks
    .map((lines) => {
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li style="margin:0 0 4px">${inline(l.replace(/^\s*[-*]\s+/, ""), firstName)}</li>`);
        return `<ul style="margin:0 0 16px;padding-left:20px">${items.join("")}</ul>`;
      }
      return `<p style="margin:0 0 16px">${lines.map((l) => inline(l, firstName)).join("<br>")}</p>`;
    })
    .join("\n");

  const footer = `${escapeHtml(opts.footerFrom)}. Don't want these emails? <a href="${unsubscribe}" style="color:#6b7280">Unsubscribe</a>.`;
  const page = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#ffffff">
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1f2937">
${html}
      <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">${footer}</p>
    </div>
  </body>
</html>`;

  const text = [
    opts.body.replace(/\r\n/g, "\n").trim().replace(/\*\*([^*]+)\*\*/g, "$1").replace(NAME_TOKEN, firstName),
    "",
    "--",
    `${opts.footerFrom}. Don't want these emails? Unsubscribe: ${unsubscribe}`,
  ].join("\n");

  return { html: page, text };
}
