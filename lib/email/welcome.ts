import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/auth/roles";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Sent when an admin adds someone, so they know the app exists and how to get in. */
export function welcomeEmail(opts: { inviterName: string; role: Role; appUrl: string; email: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const { inviterName, role, appUrl, email } = opts;
  const label = ROLE_LABELS[role];
  const roleLine = `You're ${/^[AEIOU]/.test(label) ? "an" : "a"} ${label}: ${ROLE_DESCRIPTIONS[role]}`;

  const text = [
    `${inviterName} added you to Roundtable Tools, the roundtable team's contacts and attendance app.`,
    "",
    roleLine,
    "",
    `To sign in, go to ${appUrl} and enter ${email}. We'll email you a 6-digit code. There's no password.`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <p>${escapeHtml(inviterName)} added you to Roundtable Tools, the roundtable team's contacts and attendance app.</p>
    <p>${escapeHtml(roleLine)}</p>
    <p>To sign in, go to <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> and enter ${escapeHtml(email)}. We'll email you a 6-digit code. There's no password.</p>
  </body>
</html>`;

  return { subject: "You've been added to Roundtable Tools", text, html };
}

/** The address people should sign in at. */
export function appUrl(env: Record<string, string | undefined>): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
