/** On Vercel without CRON_SECRET, the daily job refuses to run, so approved reminders would sit unsent. */
export function CronWarning() {
  if (!process.env.VERCEL || process.env.CRON_SECRET) return null;
  return (
    <p className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm" role="alert">
      Reminders won&apos;t send yet: add a <code>CRON_SECRET</code> environment variable in Vercel and redeploy. See docs/SETUP.md.
    </p>
  );
}
