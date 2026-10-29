const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/** Parses a comma- or space-separated list, as stored in an env var. */
export function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter(isValidEmail),
    ),
  ];
}
