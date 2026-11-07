// Generates a made-up district for demos and screenshots: a roster export in
// Scouting America's 90-column shape, a unit membership report, last year's
// attendance sheet, and a Zoom participant report. Everything is invented and
// deterministic (same output every run). Emails use example.org; phones use
// the reserved 555-01xx range. Never mix real data into this.

import { readFileSync } from "node:fs";
import path from "node:path";

export const DISTRICT = "RIVERBEND 12";
const COUNCIL = "Sample Council 999";

// A small seeded random generator, so the demo looks the same every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Robert", "Elizabeth", "James", "Maria", "David", "Jennifer", "Michael", "Patricia", "William", "Linda",
  "Daniel", "Grace", "Thomas", "Aisha", "Joseph", "Mei", "Christopher", "Sofia", "Anthony", "Priya",
  "Matthew", "Nadia", "Andrew", "Keiko", "Kenneth", "Fatima", "Steven", "Olga", "Edward", "Lucia",
  "Brian", "Tanya", "Kevin", "Rosa", "Jason", "Amara", "Gregory", "Ines", "Raymond", "Hana",
  "Samuel", "Leah", "Victor", "Carmen", "Omar", "Beatriz", "Marcus", "Yuki", "Felix", "Dana",
];
const LAST = [
  "Ashford", "Birchwood", "Calloway", "Delacroix", "Ellington", "Fairbanks", "Greenleaf", "Hollister",
  "Ivers", "Jessup", "Kingsley", "Larkspur", "Merriweather", "Northcott", "Oakhurst", "Pemberton",
  "Quimby", "Rutherford", "Stanhope", "Thornbury", "Underhill", "Vandermeer", "Whitlock", "Yarborough",
  "Ainsley", "Brightwater", "Coldwell", "Dunmore", "Everly", "Fenwick", "Galloway", "Hargrove",
  "Kettering", "Lockwood", "Marchetti", "Nakamura-Hale", "Okafor-Reed", "Prescott", "Ravensworth", "Sutcliffe",
  "Abernathy", "Blackwood", "Cresswell", "Dorsey", "Eastman", "Fairweather-Lin", "Goldberg", "Hawthorne",
  "Ibarra", "Jansen", "Kowalczyk", "Lindqvist", "Montoya", "Nygaard", "Osei", "Petrakis", "Quintero",
  "Rasmussen", "Silva-Grant", "Takahashi", "Umarov", "Valdez", "Wexler", "Xiong", "Zielinski", "Achebe",
  "Bergstrom", "Castellano", "Dvorak", "Esposito",
];
const NICKNAMES = { Robert: "Bob", Elizabeth: "Liz", James: "Jim", Jennifer: "Jen", William: "Bill", Michael: "Mike", Thomas: "Tom" };

const ORGS = [
  "Riverbend Community Center", "St. Brigid's Parish", "Lincoln School PTA", "Elm Street Church",
  "Harbor Lions Club", "Maple Avenue Association", "Riverside Rotary", "Northside Fire Company",
];

// Units: [type, number, designation, sub-district, youth, adults on the unit list].
const UNITS = [
  ["Pack", 12, "F", 1, 34, 14], ["Troop", 12, "B", 1, 28, 12], ["Troop", 12, "G", 1, 15, 9],
  ["Pack", 17, "F", 1, 22, 10], ["Pack", 23, "F", 2, 41, 16], ["Troop", 23, "B", 2, 19, 11],
  ["Pack", 31, "F", 2, 18, 8], ["Troop", 31, "F", 2, 12, 7], ["Pack", 45, "F", 1, 26, 12],
  ["Troop", 45, "B", 1, 21, 10], ["Troop", 45, "G", 1, 9, 6], ["Pack", 58, "F", 2, 30, 13],
  ["Troop", 58, "B", 2, 16, 9], ["Troop", 77, "F", 1, 11, 8], ["Crew", 101, null, 2, 8, 5],
  ["Crew", 212, null, 1, 6, 4], ["Ship", 7, null, 2, 7, 5], ["Pack", 39, "F", 1, 14, 7],
];
// On the unit list but not in the roster yet (a new unit), and listed with no members.
const NEW_UNIT = ["Pack", 64, "F", 2, 12, 6];
const EMPTY_UNIT = ["Pack", 23, "B", 2, 0, 0];

const LEADER = { Pack: "Cubmaster", Troop: "Scoutmaster", Crew: "Venturing Crew Advisor", Ship: "Skipper" };
const HELPERS = {
  Pack: ["Den Leader", "Den Leader", "Asst. Den Leader", "Committee Member", "Unit Treasurer"],
  Troop: ["Assistant Scoutmaster", "Assistant Scoutmaster", "Committee Member", "Unit Advancement Chair"],
  Crew: ["Venturing Crew Assoc. Advisor", "Committee Member"],
  Ship: ["Mate", "Committee Member"],
};
const DISTRICT_ROLES = [
  "Roundtable Commissioner", "Assistant Roundtable Commissioner", "District Commissioner",
  "Unit Commissioner", "Unit Commissioner", "District Executive", "Merit Badge Counselor",
];

const pad = (n, w) => String(n).padStart(w, "0");
const label = ([type, number, g]) => `${type} ${number}${type === "Troop" && (g === "B" || g === "G") ? ` ${g}` : ""}`;

function csvLine(cells) {
  return cells.map((c) => (/[",\n]/.test(String(c ?? "")) ? `"${String(c).replace(/"/g, '""')}"` : (c ?? ""))).join(",");
}

/** The made-up people, units, and positions every file below is built from. */
export function demoWorld() {
  const random = rng(662);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const used = new Set();
  const surnames = [...LAST].sort(() => random() - 0.5);
  let next = 0;
  const person = () => {
    for (;;) {
      const first = pick(FIRST);
      const last = surnames[next++ % surnames.length];
      if (used.has(`${first} ${last}`)) continue;
      used.add(`${first} ${last}`);
      return { first, last };
    }
  };
  let memberId = 910000100;
  const adults = [];
  const units = UNITS.map((u, i) => ({ type: u[0], number: u[1], g: u[2], sub: u[3], youth: u[4], adults: u[5], unitId: String(70000 + i), org: ORGS[i % ORGS.length] }));
  for (const u of units) {
    const roles = [LEADER[u.type], "Committee Chair", "Chartered Organization Rep.", ...HELPERS[u.type].slice(0, 1 + Math.floor(random() * HELPERS[u.type].length))];
    for (const position of roles) {
      // Linked troops share a chartered org rep; some packs share one with their troop.
      const shared = position === "Chartered Organization Rep." && adults.find((a) => a.position === position && a.units[0].number === u.number);
      if (shared) {
        shared.units.push(u);
        shared.positions.push(position);
        continue;
      }
      adults.push({ ...person(), memberId: String(memberId++), units: [u], positions: [position], position });
    }
  }
  const district = DISTRICT_ROLES.map((role) => ({ ...person(), memberId: String(memberId++), units: [], positions: [], district: role }));
  for (const [i, a] of [...adults, ...district].entries()) {
    a.email = i % 17 === 5 ? null : `${a.first}.${a.last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.org";
    a.phone = `(212) 555-01${pad(i % 100, 2)}`;
  }
  return { units, adults, district };
}

/** A roster export with the real 90-column header, adults and youth rows, one district. */
export function rosterCsv(world, repoRoot) {
  const header = readFileSync(path.join(repoRoot, "tests/fixtures/roster-export-sample.csv"), "utf8").split(/\r?\n/)[0].replace(/^﻿/, "").split(",");
  const random = rng(31);
  const rows = [];
  const row = (fields) => header.map((h) => fields[h] ?? "");
  for (const a of world.adults) {
    a.units.forEach((u, i) => {
      rows.push(
        row({
          MemberID: a.memberId, FirstName: a.first.toUpperCase(), LastName: a.last.toUpperCase(), IsYouth: "0",
          unitPosition: a.positions[i], ExpiryDT: "12-31-26", UnitID: u.unitId, UnitName: `${u.type} ${pad(u.number, 4)}`,
          UnitType: u.type, UnitNo: pad(u.number, 4), GenderAccepted: u.g ?? "", SponsoringOrg: u.org, DistrictLong: DISTRICT,
          RegistrationStatusLong: a.units.length > 1 ? "Multiple" : "Current", PhoneType: "Mobile", PhoneNo: a.phone, Email: a.email ?? "",
          CommonName: NICKNAMES[a.first] && random() < 0.3 ? NICKNAMES[a.first] : "",
        }),
      );
    });
  }
  for (const d of world.district) {
    rows.push(
      row({
        MemberID: d.memberId, FirstName: d.first, LastName: d.last, IsYouth: "0", aboveUnitPosition: d.district,
        aboveUnitExpiryDt: "12/31/2026", aboveUnitDistrictLong: DISTRICT, RegistrationStatusLong: "Current",
        PhoneType: "Mobile", PhoneNo: d.phone, Email: d.email ?? "",
      }),
    );
  }
  // Youth rows: the import skips them. Names are placeholders and never shown.
  for (const [i, u] of world.units.entries()) {
    rows.push(row({ MemberID: String(920000000 + i), FirstName: "Youth", LastName: `Member ${i + 1}`, IsYouth: "1", UnitID: u.unitId, UnitType: u.type, UnitNo: pad(u.number, 4), GenderAccepted: u.g ?? "", DistrictLong: DISTRICT }));
  }
  return [csvLine(header), ...rows.map(csvLine)].join("\n") + "\n";
}

/** The Unit Membership Totals report: the roster's units, one new unit, and one with no members. */
export function unitListCsv(world) {
  const header = ["councilname", "subcouncilname", "districtname", "subdistrictname", "unitname", "youth_expired", "youth_expires_01", "youth_expires_15", "youth_expires_30", "youth_expires_60", "youth_expires_61_plus", "youth_current", "adult_expired", "adult_expires_01", "adult_expires_15", "adult_expires_30", "adult_expires_60", "adult_expires_61_plus", "adult_current"];
  const all = [...world.units.map((u) => [u.type, u.number, u.g, u.sub, u.youth, u.adults]), NEW_UNIT, EMPTY_UNIT];
  const rows = all.map(([type, number, g, sub, youth, adults]) => [
    COUNCIL, "Sample Borough 001", DISTRICT, `Riverbend - Sub Dist. #${sub} 12`, `${type} ${pad(number, 4)}${g ? ` (${g})` : ""}`,
    0, 0, 0, 0, 0, youth, youth, 0, 0, 0, 0, 0, adults, adults,
  ]);
  return [
    "Report: Unit Membership Totals Report",
    `Council: ${COUNCIL}`,
    `Organization Name: ${DISTRICT}`,
    "Report Generated By: Demo Data",
    "Date Report Generated: 10/31/2026",
    "..",
    '"Made-up data for demos."',
    ".." + csvLine(header),
    ...rows.map(csvLine),
  ].join("\n") + "\n";
}

const MONTHS = ["Sep 25", "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26"];
const CANCELLED = new Set(["Dec 25", "Mar 26"]);

/** Last year's sign-in sheet, in the old Google Sheet's shape, with the quirks real sheets have. */
export function attendanceSheetCsv(world) {
  const random = rng(2025);
  const quiet = new Set(world.units.filter((_, i) => i % 4 === 3).map((u) => u.unitId));
  const regulars = world.adults.filter((a, i) => i % 3 === 0 && !a.units.some((u) => quiet.has(u.unitId))).slice(0, 24);
  const lines = [csvLine(["Name", "Unit", "Column 11", "Position", ...MONTHS])];
  const sheetName = (a, i) => {
    if (i === 2 && NICKNAMES[a.first]) return `${NICKNAMES[a.first]} ${a.last}`; // nickname
    if (i === 5) return a.first; // first name only
    if (i === 8) return `${a.first} ${a.last.slice(0, 1)}`; // last initial
    if (i === 11) return `${a.first} ${a.last.slice(0, -2)}${a.last.slice(-1)}`; // a typo
    return `${a.first} ${a.last}`;
  };
  regulars.forEach((a, i) => {
    const u = a.units[0];
    const unitText = i % 7 === 3 ? label([u.type, u.number, u.g]).toLowerCase() : label([u.type, u.number, u.g]);
    const marks = MONTHS.map((m) => (CANCELLED.has(m) ? "" : random() < 0.55 ? "Attended" : ""));
    lines.push(csvLine([sheetName(a, i), unitText, "", "", ...marks]));
  });
  // Someone from the new unit who isn't in the roster yet, and a district volunteer.
  lines.push(csvLine(["Morgan Fairweather", "Pack 64", "", "Committee Chair", "", "Attended", "", "", "Attended", "", "", "Attended", ""]));
  const rt = world.district[0];
  lines.push(csvLine([`${rt.first} ${rt.last}`, "", "roundtable commissioner", "", ...MONTHS.map((m) => (CANCELLED.has(m) ? "" : "Attended"))]));
  return lines.join("\n") + "\n";
}

/** A Zoom participant report for a virtual roundtable, with a renamed attendee and a device. */
export function zoomReportCsv(world) {
  // Mostly last year's regulars, plus a few new faces.
  const people = [...world.adults.filter((_, i) => i % 6 === 0).slice(0, 7), ...world.adults.filter((_, i) => i % 4 === 1).slice(0, 4)];
  const lines = ["Name (original name),User email,Join time,Leave time,Duration (minutes),Guest"];
  people.forEach((a, i) => {
    const name = i === 3 ? `${a.first} ${a.last.slice(0, 1)} (${a.first} ${a.last})` : `${a.first} ${a.last}`;
    lines.push(csvLine([name, i % 2 ? (a.email ?? "") : "", "09/17/2026 07:02:00 PM", "09/17/2026 08:31:00 PM", 89, i % 3 ? "No" : "Yes"]));
  });
  lines.push(csvLine(["iPad", "", "09/17/2026 07:10:00 PM", "09/17/2026 07:40:00 PM", 30, "Yes"]));
  return lines.join("\n") + "\n";
}
