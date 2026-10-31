import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { affiliation, contact, unit } from "@/lib/db/schema";
import { compareUnits, contactName, unitLabel } from "./format";

export type AffiliationView = {
  id: string;
  unitId: string | null;
  unitLabel: string | null;
  unitType: string | null;
  position: string;
  district: string | null;
  registrationStatus: string | null;
  expiresOn: string | null;
  source: string;
};

export type ContactListItem = {
  id: string;
  memberId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  isYouth: boolean;
  guardianEmail: string | null;
  status: string;
  source: string;
  multipleRegistrations: boolean;
  affiliations: AffiliationView[];
};

export type ContactDetail = ContactListItem & {
  middleName: string | null;
  suffix: string | null;
  phoneType: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UnitOption = { id: string; label: string; type: string; active: boolean };

async function affiliationsFor(contactId?: string): Promise<Map<string, AffiliationView[]>> {
  const rows = await db
    .select({
      id: affiliation.id,
      contactId: affiliation.contactId,
      unitId: affiliation.unitId,
      type: unit.type,
      number: unit.number,
      genderAccepted: unit.genderAccepted,
      position: affiliation.position,
      district: affiliation.district,
      registrationStatus: affiliation.registrationStatus,
      expiresOn: affiliation.expiresOn,
      source: affiliation.source,
    })
    .from(affiliation)
    .leftJoin(unit, eq(affiliation.unitId, unit.id))
    .where(contactId ? eq(affiliation.contactId, contactId) : undefined);

  rows.sort((a, b) => {
    if (!a.type || !b.type) return a.type ? -1 : b.type ? 1 : a.position.localeCompare(b.position);
    return compareUnits(a as Parameters<typeof compareUnits>[0], b as Parameters<typeof compareUnits>[0]);
  });

  const map = new Map<string, AffiliationView[]>();
  for (const r of rows) {
    const list = map.get(r.contactId) ?? [];
    list.push({
      id: r.id,
      unitId: r.unitId,
      unitLabel: r.type && r.number !== null ? unitLabel({ type: r.type, number: r.number, genderAccepted: r.genderAccepted }) : null,
      unitType: r.type,
      position: r.position,
      district: r.district,
      registrationStatus: r.registrationStatus,
      expiresOn: r.expiresOn,
      source: r.source,
    });
    map.set(r.contactId, list);
  }
  return map;
}

function toListItem(c: typeof contact.$inferSelect, affs: AffiliationView[]): ContactListItem {
  return {
    id: c.id,
    memberId: c.memberId,
    name: contactName(c),
    firstName: c.firstName,
    lastName: c.lastName,
    preferredName: c.preferredName,
    email: c.email,
    altEmail: c.altEmail,
    phone: c.phone,
    isYouth: c.isYouth,
    guardianEmail: c.guardianEmail,
    status: c.status,
    source: c.source,
    multipleRegistrations: c.multipleRegistrations,
    affiliations: affs,
  };
}

/** Everyone, for the contacts table. A few hundred rows: filtering happens in the browser. */
export async function listContacts(): Promise<ContactListItem[]> {
  const [rows, affs] = await Promise.all([
    db.select().from(contact).orderBy(asc(contact.lastName), asc(contact.firstName)),
    affiliationsFor(),
  ]);
  return rows.map((c) => toListItem(c, affs.get(c.id) ?? []));
}

export async function getContact(id: string): Promise<ContactDetail | null> {
  const [c] = await db.select().from(contact).where(eq(contact.id, id));
  if (!c) return null;
  const affs = await affiliationsFor(id);
  return {
    ...toListItem(c, affs.get(id) ?? []),
    middleName: c.middleName,
    suffix: c.suffix,
    phoneType: c.phoneType,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function listUnits(): Promise<UnitOption[]> {
  const rows = await db.select().from(unit);
  return rows.sort(compareUnits).map((u) => ({ id: u.id, label: unitLabel(u), type: u.type, active: u.active }));
}

/** Every position title in use, for the picker's "From the roster" group. */
export async function positionsInUse(): Promise<string[]> {
  const rows = await db.selectDistinct({ position: affiliation.position }).from(affiliation);
  return rows.map((r) => r.position).sort();
}
