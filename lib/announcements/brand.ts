import { z } from "zod";

// How announcements look and who they're from. Admins set these once on the
// Announcements page; they're stored as a setting. Shared by the server and the
// preview in the browser.

export const ACCENTS = [
  { value: "#1f3a68", label: "Navy" },
  { value: "#b91c1c", label: "Red" },
  { value: "#2f6b3a", label: "Forest green" },
  { value: "#7c5a2a", label: "Khaki brown" },
  { value: "#374151", label: "Charcoal" },
] as const;

export const brandSchema = z.object({
  fromName: z
    .string()
    .trim()
    .min(1, "Enter a From name.")
    .max(80, "Keep the From name under 80 characters.")
    .refine((v) => !/[<>"\\\r\n]/.test(v), "The From name can't have < > \" or \\ in it."),
  headerTitle: z.string().trim().max(80, "Keep the header under 80 characters."),
  accent: z.enum(ACCENTS.map((a) => a.value) as [string, ...string[]]),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "The logo needs an https:// link to an image."),
  footerLine: z.string().trim().max(200, "Keep the footer line under 200 characters."),
});

export type Brand = z.output<typeof brandSchema>;

export const DEFAULT_BRAND: Brand = {
  fromName: "Roundtable Team",
  headerTitle: "",
  accent: ACCENTS[0].value,
  logoUrl: "",
  footerLine: "",
};

/** A stored brand, filled in with defaults for anything missing or invalid. */
export function readBrand(value: unknown): Brand {
  const parsed = brandSchema.safeParse({ ...DEFAULT_BRAND, ...(typeof value === "object" && value ? value : {}) });
  return parsed.success ? parsed.data : DEFAULT_BRAND;
}

/**
 * The From header: the brand's name with the address from EMAIL_FROM or the
 * Resend domain. Quoted, so commas and periods in the name are safe.
 */
export function brandFrom(brand: Brand, sender: string | null): string | null {
  const address = senderEmail(sender);
  return address ? `"${brand.fromName}" <${address}>` : null;
}

/** Just the address from "Name <address>" or a bare address. */
export function senderEmail(sender: string | null): string | null {
  if (!sender) return null;
  const address = /<([^>]+)>/.exec(sender)?.[1] ?? sender.trim();
  return /^[^\s@<>]+@[^\s@<>]+$/.test(address) ? address : null;
}
