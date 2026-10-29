import type { CsvRow } from "./csv";
import { clean, cleanEmail, formatPhone, nameCase, parseExportDate, unitType } from "./normalize";
import type { ImportAffiliation, ImportPerson, ImportUnit } from "./payload";

// Reads Scouting America's "all registered people" roster export. Pure
// functions: this runs in the browser so the raw file never leaves it.

/** Columns that must be present to treat a file as the roster export. */
export const REQUIRED_COLUMNS = [
  "MemberID",
  "FirstName",
  "LastName",
  "IsYouth",
  "unitPosition",
  "UnitID",
  "UnitType",
  "UnitNo",
  "DistrictLong",
  "aboveUnitPosition",
  "aboveUnitDistrictLong",
] as const;

/** Placeholder position for a registered adult with no position in the export. */
export const ADULT_MEMBER = "Adult member";

export type RosterSummary = {
  rowsRead: number;
  youthRows: number;
  otherDistrictRows: number;
  noMemberIdRows: number;
  noNameRows: number;
  truncatedRows: number;
  adultRows: number;
  people: number;
  units: number;
  sharedEmails: { email: string; people: number }[];
  noEmail: number;
};

export type RosterResult = {
  people: ImportPerson[];
  units: ImportUnit[];
  summary: RosterSummary;
};

export function missingColumns(fields: string[]): string[] {
  const present = new Set(fields);
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}

function flag(value: string | undefined): boolean | null {
  const v = clean(value)?.toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "y") return true;
  if (v === "0" || v === "false" || v === "no" || v === "n") return false;
  return null;
}

/**
 * Youth if IsYouth says so. When IsYouth is blank, a row with no unit or district
 * position is youth. Age alone is never used: Venturers and Sea Scouts can be
 * 18 to 20 and still be youth members.
 */
export function isYouthRow(row: CsvRow): boolean {
  const f = flag(row.IsYouth);
  if (f !== null) return f;
  return !clean(row.unitPosition) && !clean(row.aboveUnitPosition);
}

function rowDistrict(row: CsvRow): string | null {
  return clean(row.DistrictLong) ?? clean(row.aboveUnitDistrictLong);
}

function rowUnit(row: CsvRow): ImportUnit | null {
  const bsaUnitId = clean(row.UnitID);
  const type = unitType(row.UnitType);
  const number = Number.parseInt(clean(row.UnitNo) ?? "", 10);
  const district = clean(row.DistrictLong);
  if (!bsaUnitId || !type || !Number.isFinite(number) || !district) return null;
  const gender = clean(row.GenderAccepted)?.toUpperCase();
  return {
    bsaUnitId,
    type: type as ImportUnit["type"],
    number,
    genderAccepted: gender === "B" || gender === "G" || gender === "F" ? gender : null,
    charteredOrg: clean(row.SponsoringOrg),
    district,
  };
}

/** Districts present in the file, with adult row counts, for the district picker. */
export function districtsInFile(rows: CsvRow[]): { district: string; adultRows: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const d = rowDistrict(row);
    if (!d) continue;
    counts.set(d, (counts.get(d) ?? 0) + (isYouthRow(row) ? 0 : 1));
  }
  return [...counts]
    .map(([district, adultRows]) => ({ district, adultRows }))
    .sort((a, b) => b.adultRows - a.adultRows);
}

function affiliationKey(a: ImportAffiliation): string {
  return `${a.bsaUnitId ?? `district:${a.district}`}|${a.position.toLowerCase()}`;
}

function rowAffiliations(row: CsvRow, district: string): ImportAffiliation[] {
  const out: ImportAffiliation[] = [];
  const unitId = clean(row.UnitID);
  if (unitId && clean(row.DistrictLong) === district) {
    out.push({
      bsaUnitId: unitId,
      district,
      position: clean(row.unitPosition) ?? ADULT_MEMBER,
      registrationStatus: clean(row.RegistrationStatusLong),
      expiresOn: parseExportDate(row.ExpiryDT),
    });
  }
  const above = clean(row.aboveUnitPosition);
  if (above && clean(row.aboveUnitDistrictLong) === district) {
    out.push({
      bsaUnitId: null,
      district,
      position: above,
      registrationStatus: clean(row.RegistrationStatusLong),
      expiresOn: parseExportDate(row.aboveUnitExpiryDt),
    });
  }
  return out;
}

export function parseRoster(rows: CsvRow[], fields: string[], district: string): RosterResult {
  const lastField = fields[fields.length - 1];
  const summary: RosterSummary = {
    rowsRead: rows.length,
    youthRows: 0,
    otherDistrictRows: 0,
    noMemberIdRows: 0,
    noNameRows: 0,
    truncatedRows: 0,
    adultRows: 0,
    people: 0,
    units: 0,
    sharedEmails: [],
    noEmail: 0,
  };
  const units = new Map<string, ImportUnit>();
  const people = new Map<string, ImportPerson>();

  for (const row of rows) {
    if (lastField && row[lastField] === undefined) summary.truncatedRows++;

    // Units first, from every row in the district, youth included: unit details
    // aren't personal data, and a unit with only youth members still counts.
    const unit = rowUnit(row);
    if (unit && unit.district === district && !units.has(unit.bsaUnitId)) units.set(unit.bsaUnitId, unit);

    if (isYouthRow(row)) {
      summary.youthRows++;
      continue;
    }
    if (rowDistrict(row) !== district) {
      summary.otherDistrictRows++;
      continue;
    }
    const memberId = clean(row.MemberID);
    if (!memberId) {
      summary.noMemberIdRows++;
      continue;
    }
    const firstName = nameCase(row.FirstName);
    if (!firstName) {
      summary.noNameRows++;
      continue;
    }
    summary.adultRows++;

    const emails = [row.Email, row.EmailHome, row.EmailBus].map(cleanEmail).filter((e): e is string => !!e);
    const distinct = [...new Set(emails)];
    const incoming: ImportPerson = {
      memberId,
      firstName,
      middleName: nameCase(row.MiddleName),
      lastName: nameCase(row.LastName) ?? "",
      suffix: clean(row.Suffix),
      preferredName: nameCase(row.CommonName),
      email: distinct[0] ?? null,
      altEmail: distinct[1] ?? null,
      phone: formatPhone(row.PhoneNo),
      phoneType: clean(row.PhoneType),
      multipleRegistrations: clean(row.RegistrationStatusLong)?.toLowerCase() === "multiple",
      affiliations: rowAffiliations(row, district),
    };

    const existing = people.get(memberId);
    if (!existing) {
      people.set(memberId, incoming);
      continue;
    }
    // Same member on another row: fill gaps and add the extra position.
    for (const key of ["middleName", "suffix", "preferredName", "email", "altEmail", "phone", "phoneType"] as const) {
      existing[key] ??= incoming[key];
    }
    existing.multipleRegistrations ||= incoming.multipleRegistrations;
    const seen = new Set(existing.affiliations.map(affiliationKey));
    for (const a of incoming.affiliations) {
      if (!seen.has(affiliationKey(a))) existing.affiliations.push(a);
    }
  }

  const byEmail = new Map<string, number>();
  for (const p of people.values()) {
    if (!p.email) summary.noEmail++;
    else byEmail.set(p.email, (byEmail.get(p.email) ?? 0) + 1);
  }
  summary.sharedEmails = [...byEmail]
    .filter(([, n]) => n > 1)
    .map(([email, n]) => ({ email, people: n }));
  summary.people = people.size;
  summary.units = units.size;

  return { people: [...people.values()], units: [...units.values()], summary };
}
