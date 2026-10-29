type Env = Record<string, string | undefined>;

/**
 * Which database this deployment may use.
 *
 * The Neon integration attaches the production database to Preview as well.
 * Preview builds run unreviewed branch code, so they never get DATABASE_URL;
 * they use PREVIEW_DATABASE_URL (a Neon branch with fake data) or nothing.
 */
export function databaseUrl(env: Env, kind: "pooled" | "direct" = "pooled"): string | undefined {
  if (env.VERCEL_ENV === "preview") return env.PREVIEW_DATABASE_URL || undefined;
  if (kind === "direct") return env.DATABASE_URL_UNPOOLED || env.DATABASE_URL || undefined;
  return env.DATABASE_URL || undefined;
}
