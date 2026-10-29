export const SIGN_IN_CODE_MINUTES = 10;

export function signInCodeEmail(code: string): {
  subject: string;
  text: string;
  html: string;
} {
  if (!/^\d{4,10}$/.test(code)) throw new Error("Sign-in code must be digits only");

  const text = [
    `Your Roundtable Tools sign-in code is ${code}.`,
    "",
    `It expires in ${SIGN_IN_CODE_MINUTES} minutes and works once.`,
    "If you didn't ask for it, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <p>Your Roundtable Tools sign-in code is:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${code}</p>
    <p>It expires in ${SIGN_IN_CODE_MINUTES} minutes and works once.</p>
    <p style="color: #6b7280;">If you didn't ask for it, you can ignore this email.</p>
  </body>
</html>`;

  return { subject: `Your sign-in code: ${code}`, text, html };
}
