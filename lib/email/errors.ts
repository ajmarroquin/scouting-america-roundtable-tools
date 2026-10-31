/**
 * Why an email didn't send, in words an admin can act on. Resend's messages
 * never include the email's content, so this is safe to show and to log.
 */
export function emailFailureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/testing emails|verify a domain|domain is not verified/i.test(raw)) {
    return "Resend has no verified sending domain yet, so it only delivers to the Resend account's own address";
  }
  if (/RESEND_API_KEY/.test(raw)) return "the Resend API key isn't set on this deployment";
  if (/EMAIL_FROM|RESEND_EMAIL_DOMAIN/.test(raw)) return "no sender address is set (EMAIL_FROM)";
  if (/rate.?limit|too many requests|daily.*quota|quota/i.test(raw)) {
    return "Resend's sending limit was hit, so try again later";
  }
  const detail = raw.replace(/^Resend:\s*/, "").trim();
  return `Resend said "${detail.length > 200 ? `${detail.slice(0, 199)}…` : detail}"`;
}
