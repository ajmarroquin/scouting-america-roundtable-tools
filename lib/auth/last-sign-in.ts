import { todayIn } from "@/lib/attendance/year";

/** "Today, 9:41 AM", "Yesterday, 7:02 PM", "3 days ago", "Oct 12, 2026", or "Never". */
export function lastSignInLabel(at: Date | null, timeZone: string, now = new Date()): string {
  if (!at) return "Never";
  if (now.getTime() - at.getTime() < 2 * 60_000) return "Just now";
  const time = at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const days = Math.round((Date.parse(todayIn(timeZone, now)) - Date.parse(todayIn(timeZone, at))) / 86_400_000);
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days < 7) return `${days} days ago`;
  return at.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
}

/** The full date and time, for a tooltip. */
export function signInTimestamp(at: Date, timeZone: string): string {
  return at.toLocaleString("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" });
}
