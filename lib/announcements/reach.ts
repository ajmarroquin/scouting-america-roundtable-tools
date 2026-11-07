// Who in a group an announcement actually reaches, and why anyone else is left
// out. One rule, used for the counts, the "who's in it" list, and the send, so
// they always agree. Pure, so the browser can label the reasons too.

export type ReachCandidate = {
  contactId: string;
  name: string;
  email: string | null;
  isYouth: boolean;
  status: string;
  unsubscribed: boolean;
  /** Added themselves at self check-in and not yet approved by an editor. */
  pendingReview?: boolean;
};

export const LEFT_OUT = {
  youth: "Youth never get announcements",
  archived: "Archived",
  not_in_roster: "Not in the latest roster",
  no_email: "No email address",
  unsubscribed: "Unsubscribed",
  pending_review: "Added themselves at check-in; waiting for an editor to approve",
  shared_email: "Shares an email address with someone who gets it",
} as const;

export type LeftOutReason = keyof typeof LEFT_OUT;

export type Reach<T extends ReachCandidate = ReachCandidate> = {
  members: T[];
  leftOut: (T & { reason: LeftOutReason; sharedWith?: string })[];
};

/** Why this person wouldn't get an announcement on their own, before shared emails. */
export function leftOutReason(
  c: Pick<ReachCandidate, "email" | "isYouth" | "status" | "unsubscribed" | "pendingReview">,
): Exclude<LeftOutReason, "shared_email"> | null {
  if (c.isYouth) return "youth";
  if (c.pendingReview) return "pending_review";
  if (c.status === "archived") return "archived";
  if (c.status === "not_in_roster") return "not_in_roster";
  if (!c.email?.trim()) return "no_email";
  if (c.unsubscribed) return "unsubscribed";
  return null;
}

/**
 * Splits a group into who gets the email and who doesn't. One email per
 * address: when people share one, the first by name gets it.
 */
export function reach<T extends ReachCandidate>(candidates: T[]): Reach<T> {
  const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name) || a.contactId.localeCompare(b.contactId));
  const byEmail = new Map<string, T>();
  const out: Reach<T> = { members: [], leftOut: [] };
  for (const c of sorted) {
    const reason = leftOutReason(c);
    if (reason) {
      out.leftOut.push({ ...c, reason });
      continue;
    }
    const key = c.email!.trim().toLowerCase();
    const first = byEmail.get(key);
    if (first) {
      out.leftOut.push({ ...c, reason: "shared_email", sharedWith: first.name });
      continue;
    }
    byEmail.set(key, c);
    out.members.push(c);
  }
  return out;
}
