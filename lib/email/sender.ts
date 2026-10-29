type Env = Record<string, string | undefined>;

/**
 * The From address for outgoing email. EMAIL_FROM wins when set. Otherwise,
 * when Resend was added through the Vercel Marketplace, it provides
 * RESEND_EMAIL_DOMAIN and we send from no-reply@ that domain.
 */
export function senderAddress(env: Env): string | null {
  const explicit = env.EMAIL_FROM?.trim();
  if (explicit) return explicit;

  const domain = env.RESEND_EMAIL_DOMAIN?.trim().toLowerCase();
  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return `Roundtable Tools <no-reply@${domain}>`;
  }
  return null;
}
