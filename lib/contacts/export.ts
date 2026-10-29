import type { Cell } from "@/lib/export/csv";
import { STATUS_LABELS } from "./format";

type ExportAffiliation = { unitLabel: string | null; position: string; district: string | null };

export type ExportContact = {
  memberId: string | null;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  isYouth: boolean;
  guardianEmail: string | null;
  status: string;
  affiliations: ExportAffiliation[];
};

export const CONTACT_EXPORT_HEADERS = [
  "First name",
  "Last name",
  "Preferred name",
  "Email",
  "Second email",
  "Phone",
  "Units",
  "Unit positions",
  "District positions",
  "Youth",
  "Guardian email",
  "Status",
  "Member ID",
];

export function contactExportRows(contacts: ExportContact[]): Cell[][] {
  return contacts.map((c) => {
    const unitAffs = c.affiliations.filter((a) => a.unitLabel);
    const districtAffs = c.affiliations.filter((a) => !a.unitLabel);
    return [
      c.firstName,
      c.lastName,
      c.preferredName,
      c.email,
      c.altEmail,
      c.phone,
      [...new Set(unitAffs.map((a) => a.unitLabel))].join("; "),
      unitAffs.map((a) => `${a.unitLabel}: ${a.position}`).join("; "),
      districtAffs.map((a) => a.position).join("; "),
      c.isYouth ? "Yes" : "",
      c.guardianEmail,
      STATUS_LABELS[c.status] ?? c.status,
      c.memberId,
    ];
  });
}

/** Resend's contact import wants email plus optional first and last name. */
export const RESEND_EXPORT_HEADERS = ["email", "first_name", "last_name"];

export function resendExportRows(contacts: ExportContact[]): Cell[][] {
  const seen = new Set<string>();
  const rows: Cell[][] = [];
  for (const c of contacts) {
    for (const email of [c.email, c.isYouth ? c.guardianEmail : null]) {
      if (!email || seen.has(email)) continue;
      seen.add(email);
      rows.push(email === c.email ? [email, c.preferredName || c.firstName, c.lastName] : [email, "", ""]);
    }
  }
  return rows;
}
