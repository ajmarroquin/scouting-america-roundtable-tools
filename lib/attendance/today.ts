import { todayIn } from "./year";

export function appTimeZone(): string {
  return process.env.APP_TIME_ZONE || "America/New_York";
}

/** Today in the district's time zone. Meetings after it haven't happened yet. */
export function appToday(): string {
  return todayIn(appTimeZone());
}
