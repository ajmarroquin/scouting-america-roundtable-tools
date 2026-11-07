import { sendDueReminders } from "@/lib/reminders/service";

// Vercel calls this once a day (see vercel.json). It runs twice, at 13:00 and
// 14:00 UTC, so one run lands in the 9 o'clock hour in New York whether or not
// it's daylight time; the job only sends from 9 am on, and never twice.
// Nobody is signed in here: Vercel sends "Bearer <CRON_SECRET>" and nothing else gets through.

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not allowed", { status: 401 });
  }
  const result = await sendDueReminders();
  console.log(`[reminders] sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
  return Response.json(result);
}
