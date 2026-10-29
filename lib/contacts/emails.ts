export type EmailSource = { email: string | null; isYouth: boolean; guardianEmail: string | null };

export type Separator = "comma" | "semicolon";

/**
 * The deduped addresses for a list of contacts. A youth contact always brings
 * their parent or guardian along, so no message to a youth goes out one-on-one.
 */
export function collectEmails(contacts: EmailSource[]): { emails: string[]; withoutEmail: number } {
  const seen = new Set<string>();
  const emails: string[] = [];
  let withoutEmail = 0;
  const add = (e: string | null) => {
    if (!e) return;
    const key = e.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      emails.push(e);
    }
  };
  for (const c of contacts) {
    if (!c.email && !(c.isYouth && c.guardianEmail)) withoutEmail++;
    add(c.email);
    if (c.isYouth) add(c.guardianEmail);
  }
  return { emails, withoutEmail };
}

export function joinEmails(emails: string[], separator: Separator): string {
  return emails.join(separator === "semicolon" ? "; " : ", ");
}

/** Splits into groups for mail providers that cap recipients per message. */
export function batchEmails(emails: string[], size: number | null): string[][] {
  if (!size || size <= 0 || emails.length <= size) return emails.length ? [emails] : [];
  const out: string[][] = [];
  for (let i = 0; i < emails.length; i += size) out.push(emails.slice(i, i + size));
  return out;
}
