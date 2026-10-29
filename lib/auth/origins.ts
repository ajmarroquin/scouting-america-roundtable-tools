type Env = Record<string, string | undefined>;

/**
 * Origins allowed to call the auth API besides BETTER_AUTH_URL: anything listed
 * in BETTER_AUTH_TRUSTED_ORIGINS, plus this project's own Vercel URLs, so the
 * app works on its *.vercel.app address before (and alongside) the custom domain.
 */
export function trustedOriginsFromEnv(env: Env): string[] {
  const origins = new Set<string>();

  for (const value of (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(/[\s,]+/)) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed entries rather than failing every request.
    }
  }

  for (const host of [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_BRANCH_URL, env.VERCEL_URL]) {
    if (host) origins.add(`https://${host}`);
  }

  return [...origins];
}
