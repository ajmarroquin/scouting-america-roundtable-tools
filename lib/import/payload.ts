import { z } from "zod";

// The only data that leaves the browser during an import. Anything not listed
// here (addresses, birthdates, demographics, youth rows) never reaches the server.

const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => text(max).nullable();

export const importUnitSchema = z.object({
  bsaUnitId: text(40),
  type: z.enum(["Pack", "Troop", "Crew", "Ship", "Post", "Club"]),
  number: z.number().int().min(0).max(99999),
  genderAccepted: z.enum(["B", "G", "F"]).nullable(),
  charteredOrg: optional(200),
  district: text(120),
});

export const importAffiliationSchema = z.object({
  // Null for district positions.
  bsaUnitId: optional(40),
  district: text(120),
  position: text(120),
  registrationStatus: optional(60),
  expiresOn: z.iso.date().nullable(),
});

export const importPersonSchema = z.object({
  memberId: text(40),
  firstName: text(80),
  middleName: optional(80),
  lastName: z.string().trim().max(80),
  suffix: optional(20),
  preferredName: optional(80),
  email: z.email().max(254).nullable(),
  altEmail: z.email().max(254).nullable(),
  phone: optional(40),
  phoneType: optional(40),
  multipleRegistrations: z.boolean(),
  affiliations: z.array(importAffiliationSchema).max(50),
});

export const importPayloadSchema = z.object({
  fileName: z.string().trim().max(200).nullable(),
  district: text(120),
  people: z.array(importPersonSchema).max(5000),
  units: z.array(importUnitSchema).max(1000),
});

export type ImportUnit = z.infer<typeof importUnitSchema>;
export type ImportAffiliation = z.infer<typeof importAffiliationSchema>;
export type ImportPerson = z.infer<typeof importPersonSchema>;
export type ImportPayload = z.infer<typeof importPayloadSchema>;
