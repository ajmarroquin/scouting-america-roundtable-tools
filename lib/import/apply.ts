import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { db, type Tx } from "@/lib/db";
import { affiliation, contact, importRun, setting, unit } from "@/lib/db/schema";
import { importPayloadSchema, type ImportPayload } from "./payload";
import { type ExistingContact, type ExistingUnit, type PersonChange, planCounts, planImport } from "./plan";

const DISTRICT_SETTING = "import.district";
const CHUNK = 500;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Executor = typeof db | Tx;

async function loadState(q: Executor, payload: ImportPayload) {
  const memberIds = payload.people.map((p) => p.memberId);
  // Everyone the plan needs: matches by member ID, every import contact (to
  // spot who left the roster), and hand-added contacts (to link by email).
  const rows = await q
    .select()
    .from(contact)
    .where(or(inArray(contact.memberId, memberIds), eq(contact.source, "import"), isNull(contact.memberId)));

  const ids = rows.map((r) => r.id);
  const affs = ids.length
    ? await q
        .select({
          contactId: affiliation.contactId,
          bsaUnitId: unit.bsaUnitId,
          district: affiliation.district,
          position: affiliation.position,
          registrationStatus: affiliation.registrationStatus,
          expiresOn: affiliation.expiresOn,
        })
        .from(affiliation)
        .leftJoin(unit, eq(affiliation.unitId, unit.id))
        .where(and(inArray(affiliation.contactId, ids), eq(affiliation.source, "import")))
    : [];

  const affsByContact = new Map<string, ExistingContact["affiliations"]>();
  for (const a of affs) {
    const list = affsByContact.get(a.contactId) ?? [];
    list.push({
      bsaUnitId: a.bsaUnitId,
      district: a.district ?? payload.district,
      position: a.position,
      registrationStatus: a.registrationStatus,
      expiresOn: a.expiresOn,
    });
    affsByContact.set(a.contactId, list);
  }

  const contacts: ExistingContact[] = rows.map((r) => ({ ...r, affiliations: affsByContact.get(r.id) ?? [] }));
  const unitRows = await q.select().from(unit);
  const units: ExistingUnit[] = unitRows
    .filter((u) => u.bsaUnitId)
    .map((u) => ({
      id: u.id,
      bsaUnitId: u.bsaUnitId!,
      type: u.type as ExistingUnit["type"],
      number: u.number,
      genderAccepted: u.genderAccepted as ExistingUnit["genderAccepted"],
      charteredOrg: u.charteredOrg,
      district: u.district,
      active: u.active,
    }));
  return { contacts, units };
}

export type ImportPreview = {
  counts: Record<string, number>;
  updated: PersonChange[];
  missing: { name: string; email: string | null }[];
};

export async function previewImport(raw: unknown): Promise<ImportPreview> {
  const payload = importPayloadSchema.parse(raw);
  const state = await loadState(db, payload);
  const plan = planImport(payload, state.contacts, state.units);
  return {
    counts: planCounts(plan, payload.people.length),
    updated: plan.updated.slice(0, 200),
    missing: plan.missing.slice(0, 200).map(({ name, email }) => ({ name, email })),
  };
}

export async function commitImport(actor: CurrentUser, raw: unknown) {
  const payload = importPayloadSchema.parse(raw);

  return db.transaction(async (tx) => {
    // One import at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(662030)`);
    const state = await loadState(tx, payload);
    const plan = planImport(payload, state.contacts, state.units);
    const counts = planCounts(plan, payload.people.length);

    const [run] = await tx
      .insert(importRun)
      .values({ actorId: actor.id, actorEmail: actor.email, fileName: payload.fileName, district: payload.district, counts })
      .returning({ id: importRun.id });

    for (const batch of chunks(payload.units)) {
      await tx
        .insert(unit)
        .values(batch.map((u) => ({ ...u, active: true, lastImportId: run.id })))
        .onConflictDoUpdate({
          target: unit.bsaUnitId,
          set: {
            type: sql`excluded.type`,
            number: sql`excluded.number`,
            genderAccepted: sql`excluded.gender_accepted`,
            charteredOrg: sql`excluded.chartered_org`,
            district: sql`excluded.district`,
            active: true,
            lastImportId: run.id,
            updatedAt: sql`now()`,
          },
        });
    }
    if (plan.units.deactivated.length) {
      await tx.update(unit).set({ active: false }).where(inArray(unit.bsaUnitId, plan.units.deactivated));
    }
    const unitIds = new Map(
      (await tx.select({ id: unit.id, bsaUnitId: unit.bsaUnitId }).from(unit)).map((u) => [u.bsaUnitId, u.id]),
    );

    for (const link of plan.linkedByEmail) {
      await tx.update(contact).set({ memberId: link.memberId }).where(eq(contact.id, link.contactId));
    }

    for (const batch of chunks(payload.people)) {
      await tx
        .insert(contact)
        .values(
          batch.map((p) => ({
            memberId: p.memberId,
            firstName: p.firstName,
            middleName: p.middleName,
            lastName: p.lastName,
            suffix: p.suffix,
            preferredName: p.preferredName,
            email: p.email,
            altEmail: p.altEmail,
            phone: p.phone,
            phoneType: p.phoneType,
            multipleRegistrations: p.multipleRegistrations,
            status: "active",
            source: "import",
            lastImportId: run.id,
          })),
        )
        .onConflictDoUpdate({
          target: contact.memberId,
          set: {
            firstName: sql`excluded.first_name`,
            middleName: sql`excluded.middle_name`,
            lastName: sql`excluded.last_name`,
            suffix: sql`excluded.suffix`,
            // Fill in, never overwrite: it may have been set by hand.
            preferredName: sql`coalesce(${contact.preferredName}, excluded.preferred_name)`,
            email: sql`excluded.email`,
            altEmail: sql`excluded.alt_email`,
            phone: sql`excluded.phone`,
            phoneType: sql`excluded.phone_type`,
            multipleRegistrations: sql`excluded.multiple_registrations`,
            // Back in the roster: active again. Archived stays archived.
            status: sql`case when ${contact.status} = 'not_in_roster' then 'active' else ${contact.status} end`,
            source: "import",
            lastImportId: run.id,
            updatedAt: sql`now()`,
          },
        });
    }

    const idRows = await tx
      .select({ id: contact.id, memberId: contact.memberId })
      .from(contact)
      .where(
        inArray(
          contact.memberId,
          payload.people.map((p) => p.memberId),
        ),
      );
    const contactIds = new Map(idRows.map((r) => [r.memberId, r.id]));

    // Imports own their affiliations: replace them. Hand-added ones stay.
    if (idRows.length) {
      await tx
        .delete(affiliation)
        .where(and(inArray(affiliation.contactId, idRows.map((r) => r.id)), eq(affiliation.source, "import")));
    }
    let skippedAffiliations = 0;
    const affRows = payload.people.flatMap((p) =>
      p.affiliations.flatMap((a) => {
        const unitId = a.bsaUnitId ? unitIds.get(a.bsaUnitId) : null;
        if (a.bsaUnitId && !unitId) {
          skippedAffiliations++;
          return [];
        }
        return [
          {
            contactId: contactIds.get(p.memberId)!,
            unitId: unitId ?? null,
            district: a.district,
            position: a.position,
            registrationStatus: a.registrationStatus,
            expiresOn: a.expiresOn,
            source: "import",
          },
        ];
      }),
    );
    for (const batch of chunks(affRows)) {
      await tx
        .insert(affiliation)
        .values(batch)
        .onConflictDoUpdate({
          target: [affiliation.contactId, affiliation.unitId, affiliation.position],
          set: {
            source: "import",
            district: sql`excluded.district`,
            registrationStatus: sql`excluded.registration_status`,
            expiresOn: sql`excluded.expires_on`,
            updatedAt: sql`now()`,
          },
        });
    }

    if (plan.missing.length) {
      await tx
        .update(contact)
        .set({ status: "not_in_roster" })
        .where(inArray(contact.id, plan.missing.map((m) => m.id)));
    }

    await tx
      .insert(setting)
      .values({ key: DISTRICT_SETTING, value: payload.district })
      .onConflictDoUpdate({ target: setting.key, set: { value: payload.district } });

    const finalCounts: Record<string, number> = { ...counts, affiliations: affRows.length, skippedAffiliations };
    await tx.update(importRun).set({ counts: finalCounts }).where(eq(importRun.id, run.id));
    await writeAudit(actor, "import.roster", { type: "import", id: run.id }, { district: payload.district, ...finalCounts }, tx);

    return { importId: run.id, counts: finalCounts };
  });
}

export async function importDefaults() {
  const [saved] = await db.select().from(setting).where(eq(setting.key, DISTRICT_SETTING));
  const recent = await db
    .select({ id: importRun.id, at: importRun.at, actorEmail: importRun.actorEmail, district: importRun.district, counts: importRun.counts, fileName: importRun.fileName })
    .from(importRun)
    .orderBy(desc(importRun.at))
    .limit(5);
  return { district: typeof saved?.value === "string" ? saved.value : null, recent };
}
