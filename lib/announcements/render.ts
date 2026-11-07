// Turns an announcement written as plain text into a branded email (HTML and
// text). The syntax is small on purpose, and everything typed is escaped, so
// nothing a sender writes becomes markup or script.
//
//   # Heading            ## Smaller heading
//   - bullet             1. numbered
//   **bold**  _italic_   [link text](https://...)   bare links work too
//   [button: RSVP](https://...)   on its own line
//   ---                  a divider
//   {first name}         the reader's first name

import { type Brand, DEFAULT_BRAND } from "./brand";

/** Resend swaps these for each recipient when the broadcast goes out. */
export const UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}";
export const FIRST_NAME = "{{{contact.first_name|there}}}";

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const NAME_TOKEN = /\{\s*first\s*name\s*\}/gi;
// A markdown link, or a bare http(s) link without trailing punctuation.
const LINKS = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

function emphasis(escaped: string): string {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,;:!?])/g, "$1<em>$2</em>");
}

/** One line as HTML: escaped, then links, bold, italics, and the first-name token. */
function inline(line: string, firstName: string, accent: string): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(LINKS)) {
    out += emphasis(escapeHtml(line.slice(last, m.index)));
    const url = escapeHtml(m[2] ?? m[3]);
    const text = m[1] !== undefined ? emphasis(escapeHtml(m[1])) : url;
    out += `<a href="${url}" style="color:${accent};text-decoration:underline">${text}</a>`;
    last = m.index! + m[0].length;
  }
  out += emphasis(escapeHtml(line.slice(last)));
  return out.replace(NAME_TOKEN, () => firstName);
}

type Block =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "para"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "button"; label: string; url: string }
  | { kind: "divider" };

const BUTTON = /^\[button:\s*([^\]]+?)\s*\]\((https?:\/\/[^\s)]+)\)\s*$/i;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,2})\s+(.*)$/;

export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const push = (b: Block) => blocks.push(b);
  let para: string[] | null = null;
  let list: Extract<Block, { kind: "list" }> | null = null;
  const flush = () => {
    if (para?.length) push({ kind: "para", lines: para });
    if (list?.items.length) push(list);
    para = null;
    list = null;
  };
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    const button = BUTTON.exec(line.trim());
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    if (/^\s*-{3,}\s*$/.test(line)) {
      flush();
      push({ kind: "divider" });
    } else if (heading) {
      flush();
      push({ kind: "heading", level: heading[1].length as 1 | 2, text: heading[2] });
    } else if (button) {
      flush();
      push({ kind: "button", label: button[1], url: button[2] });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      if (para) {
        push({ kind: "para", lines: para });
        para = null;
      }
      if (list && list.ordered !== ordered) {
        push(list);
        list = null;
      }
      list ??= { kind: "list", ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      if (list) {
        push(list);
        list = null;
      }
      para ??= [];
      para.push(line);
    }
  }
  flush();
  return blocks;
}

function blockHtml(b: Block, firstName: string, accent: string): string {
  const text = (s: string) => inline(s, firstName, accent);
  switch (b.kind) {
    case "heading":
      return b.level === 1
        ? `<h1 style="margin:8px 0 12px;font-size:24px;line-height:1.3;color:#111827">${text(b.text)}</h1>`
        : `<h2 style="margin:8px 0 10px;font-size:19px;line-height:1.35;color:#111827">${text(b.text)}</h2>`;
    case "para":
      return `<p style="margin:0 0 16px">${b.lines.map(text).join("<br>")}</p>`;
    case "list": {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag} style="margin:0 0 16px;padding-left:24px">${b.items.map((i) => `<li style="margin:0 0 6px">${text(i)}</li>`).join("")}</${tag}>`;
    }
    case "button":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr><td style="background:${accent};border-radius:8px"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(b.label)}</a></td></tr></table>`;
    case "divider":
      return `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">`;
  }
}

function blockText(b: Block, firstName: string): string {
  const plain = (s: string) =>
    s
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2")
      .replace(NAME_TOKEN, () => firstName);
  switch (b.kind) {
    case "heading":
      return plain(b.text).toUpperCase();
    case "para":
      return b.lines.map(plain).join("\n");
    case "list":
      return b.items.map((i, n) => `${b.ordered ? `${n + 1}.` : "-"} ${plain(i)}`).join("\n");
    case "button":
      return `${b.label}: ${b.url}`;
    case "divider":
      return "----";
  }
}

export type Rendered = { html: string; text: string };

export function renderAnnouncement(opts: {
  body: string;
  brand?: Brand;
  /** Shown next to the subject in the inbox. */
  previewText?: string;
  /** Who sent it, for the footer ("Sent by Sam Rivera for the roundtable team"). */
  footerFrom: string;
  /** The greeting value: Resend's per-contact token, or a real name for a test. */
  firstName?: string;
  /** The unsubscribe link: Resend's token, or a placeholder for a test. */
  unsubscribeUrl?: string;
}): Rendered {
  const brand = opts.brand ?? DEFAULT_BRAND;
  // A real name (a test send) is escaped like anything typed; Resend's token is left for Resend.
  const firstName = opts.firstName ?? FIRST_NAME;
  const htmlFirstName = opts.firstName === undefined ? FIRST_NAME : escapeHtml(opts.firstName);
  const unsubscribe = opts.unsubscribeUrl ?? UNSUBSCRIBE_URL;
  const blocks = parseBlocks(opts.body.trim());
  const title = escapeHtml(brand.headerTitle || brand.fromName);
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="" height="40" style="height:40px;width:auto;vertical-align:middle;margin-right:12px;border:0">`
    : "";
  const preheader = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#ffffff">${escapeHtml(opts.previewText)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    : "";
  const footerLine = brand.footerLine ? `${escapeHtml(brand.footerLine)}<br>` : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6">
    ${preheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
            <tr>
              <td style="background:${brand.accent};padding:20px 32px;font-family:${FONT};font-size:20px;font-weight:700;line-height:1.3;color:#ffffff">${logo}${title}</td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:${FONT};font-size:16px;line-height:1.6;color:#1f2937">
${blocks.map((b) => blockHtml(b, htmlFirstName, brand.accent)).join("\n")}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-family:${FONT};font-size:13px;line-height:1.5;color:#6b7280">${footerLine}${escapeHtml(opts.footerFrom)}. Reply to this email with any questions.<br>Don't want these emails? <a href="${unsubscribe}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a>.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    brand.headerTitle || brand.fromName,
    "",
    blocks.map((b) => blockText(b, firstName)).join("\n\n"),
    "",
    "--",
    ...(brand.footerLine ? [brand.footerLine] : []),
    `${opts.footerFrom}. Reply to this email with any questions.`,
    `Don't want these emails? Unsubscribe: ${unsubscribe}`,
  ].join("\n");

  return { html, text };
}
