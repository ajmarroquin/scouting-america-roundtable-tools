import "server-only";
import { Resend } from "resend";
import { senderAddress } from "./sender";

type Message = { to: string; subject: string; text: string; html: string };

export async function sendEmail(message: Message): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Local development only. On Vercel a missing key is a configuration error,
    // and we never want sign-in codes written to deployment logs.
    if (process.env.VERCEL) throw new Error("RESEND_API_KEY is not set");
    console.info(`[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }

  const from = senderAddress(process.env);
  if (!from) throw new Error("Set EMAIL_FROM, or connect Resend so RESEND_EMAIL_DOMAIN is set");

  const { error } = await new Resend(apiKey).emails.send({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
}
