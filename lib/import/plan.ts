import type { ImportAffiliation, ImportPayload, ImportPerson, ImportUnit } from "./payload";

// Works out what an import will change, without touching the database.
// lib/import/apply.ts loads the current state, calls planImport, shows the
// result as the preview, and applies the same plan on confirm.

export type ExistingContact = {
  id: string;
  memberId: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  phoneType: string | null;
  multipleRegistrations: boolean;
  status: string;
  source: string;
  /** Only this contact's import-sourced affiliations. */
  affiliations: ImportAffiliation[];
};

export type ExistingUnit = Omit<ImportUnit, "district" | "bsaUnitId"> & {
  id: string;
  /** Null for units added by hand. */
  bsaUnitId: string | null;
  district: string | null;
  active: boolean;
};

export type PersonChange = { memberId: string; name: string; fields: string[] };

export type ImportPlan = {
  district: string;
  /** Payload people that match no existing contact. */
  newPeople: ImportPerson[];
  /** memberId → existing contact id, for people already in the database. */
  matched: Map<string, string>;
  /** Manual contacts with no member ID that matched on email and first name. */
  linkedByEmail: { memberId: string; contactId: string }[];
  updated: PersonChange[];
  unchanged: number;
  reactivated: number;
  /** Import contacts that were active and are no longer in the roster. */
  missing: { id: string; name: string; email: string | null }[];
  units: {
    new: number;
    updated: number;
    deactivated: string[];
    reactivated: number;
    /** Hand-added units the roster now identifies: they get its unit ID instead of a duplicate. */
    linked: { unitId: string; bsaUnitId: string }[];
  };
};

const PERSON_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "email",
  "altEmail",
  "phone",
  "phoneType",
  "multipleRegistrations",
] as const;

const FIELD_LABELS: Record<string, string> = {
  firstName: "first name",
  middleName: "middle name",
  lastName: "last name",
  suffix: "suffix",
  email: "email",
  altEmail: "second email",
  phone: "phone",
  phoneType: "phone type",
  multipleRegistrations: "multiple registrations",
  preferredName: "preferred name",
  affiliations: "units or positions",
};

export function displayName(p: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${p.preferredName || p.firstName} ${p.lastName}`.trim();
}

function affiliationSignature(list: ImportAffiliation[]): string {
  return list
    .map((a) => [a.bsaUnitId ?? `district:${a.district}`, a.position.toLowerCase(), a.registrationStatus ?? "", a.expiresOn ?? ""].join("|"))
    .sort()
    .join("\n");
}

export function changedFields(existing: ExistingContact, incoming: ImportPerson): string[] {
  const changes: string[] = PERSON_FIELDS.filter((f) => (existing[f] ?? null) !== (incoming[f] ?? null));
  // A preferred name is only filled in, never overwritten: it may have been set by hand.
  if (!existing.preferredName && incoming.preferredName) changes.push("preferredName");
  if (affiliationSignature(existing.affiliations) !== affiliationSignature(incoming.affiliations)) {
    changes.push("affiliations");
  }
  return changes.map((f) => FIELD_LABELS[f] ?? f);
}

export function planImport(
  payload: Pick<ImportPayload, "district" | "people" | "units">,
  contacts: ExistingContact[],
  units: ExistingUnit[],
): ImportPlan {
  const byMemberId = new Map(contacts.filter((c) => c.memberId).map((c) => [c.memberId!, c]));
  const unlinked = contacts.filter((c) => !c.memberId);
  const usedUnlinked = new Set<string>();

  const plan: ImportPlan = {
    district: payload.district,
    newPeople: [],
    matched: new Map(),
    linkedByEmail: [],
    updated: [],
    unchanged: 0,
    reactivated: 0,
    missing: [],
    units: { new: 0, updated: 0, deactivated: [], reactivated: 0, linked: [] },
  };

  for (const person of payload.people) {
    let existing = byMemberId.get(person.memberId);
    if (!existing && person.email) {
      // Someone added by hand (a walk-in, say) before they showed up in the roster.
      existing = unlinked.find(
        (c) =>
          !usedUnlinked.has(c.id) &&
          c.email === person.email &&
          c.firstName.toLowerCase() === person.firstName.toLowerCase(),
      );
      if (existing) {
        usedUnlinked.add(existing.id);
        plan.linkedByEmail.push({ memberId: person.memberId, contactId: existing.id });
      }
    }
    if (!existing) {
      plan.newPeople.push(person);
      continue;
    }
    plan.matched.set(person.memberId, existing.id);
    if (existing.status === "not_in_roster") plan.reactivated++;
    const fields = changedFields(existing, person);
    if (fields.length) plan.updated.push({ memberId: person.memberId, name: displayName(person), fields });
    else plan.unchanged++;
  }

  const inFile = new Set(plan.matched.values());
  for (const c of contacts) {
    if (c.source === "import" && c.status === "active" && !inFile.has(c.id)) {
      plan.missing.push({ id: c.id, name: displayName(c), email: c.email });
    }
  }

  const existingUnits = new Map(units.filter((u) => u.bsaUnitId).map((u) => [u.bsaUnitId, u]));
  const unitKey = (u: { type: string; number: number; genderAccepted: string | null }) =>
    `${u.type}|${u.number}|${u.genderAccepted ?? ""}`;
  const manualUnits = new Map(units.filter((u) => !u.bsaUnitId).map((u) => [unitKey(u), u]));
  const fileUnits = new Set(payload.units.map((u) => u.bsaUnitId));
  for (const u of payload.units) {
    const e = existingUnits.get(u.bsaUnitId);
    const manual = e ? undefined : manualUnits.get(unitKey(u));
    if (manual) {
      plan.units.linked.push({ unitId: manual.id, bsaUnitId: u.bsaUnitId });
      manualUnits.delete(unitKey(u));
    } else if (!e) plan.units.new++;
    else {
      if (!e.active) plan.units.reactivated++;
      if (
        e.type !== u.type ||
        e.number !== u.number ||
        e.genderAccepted !== u.genderAccepted ||
        e.charteredOrg !== u.charteredOrg ||
        e.district !== u.district
      ) {
        plan.units.updated++;
      }
    }
  }
  for (const u of units) {
    if (u.active && u.district === payload.district && u.bsaUnitId && !fileUnits.has(u.bsaUnitId)) {
      plan.units.deactivated.push(u.bsaUnitId);
    }
  }

  return plan;
}

/** The counts shown in the preview and stored on the import record. */
export function planCounts(plan: ImportPlan, payloadPeople: number): Record<string, number> {
  return {
    people: payloadPeople,
    new: plan.newPeople.length,
    updated: plan.updated.length,
    unchanged: plan.unchanged,
    reactivated: plan.reactivated,
    linkedByEmail: plan.linkedByEmail.length,
    notInRoster: plan.missing.length,
    unitsNew: plan.units.new,
    unitsUpdated: plan.units.updated,
    unitsDeactivated: plan.units.deactivated.length,
    unitsLinked: plan.units.linked.length,
  };
}
