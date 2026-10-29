# Roundtable Tools: Build Plan

Status: draft v2, October 2026

## What this is

A small web hub for a district roundtable team. Signed-in volunteers get a set of tools that share one contact layer. The first two tools are **Contacts** and **Attendance + Metrics**. Every tool exports to CSV and Excel so data can move into the systems we already use.

The code is public. The data is not. Most of the design below follows from that split.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Hosting accounts | The maintainer's personal accounts, not an employer's. Vercel Hobby. |
| Users | 2 to 10 people sign in. |
| Youth | Import adults only. Youth rows are dropped in the browser before anything is saved. Youth can be added by hand when needed. |
| Contact source | Scouting America's "all registered people" roster export (CSV). There is no import into Scouting America's tools; data only flows out. |
| Domain | A subdomain of a domain the maintainer already owns, for both the app and the sending address. No purchase needed. |
| Email provider | Resend: transactional email for sign-in codes, Broadcasts for roundtable announcements. |

## Goals

- One source of truth for roundtable contacts (300 to 500 adults) and the units they serve.
- Fast attendance capture at the meeting, with history that rolls up into useful metrics.
- Import the roster export, keep adults only, and merge it without creating duplicates.
- One-click "copy emails" for any filtered list, and a path to send announcements without using a personal mailbox.
- CSV and XLSX export everywhere.
- Runs on free tiers.

## Non-goals for now

- Two-way sync with my.scouting.org or Scoutbook.
- Importing youth records.
- Public self check-in (see Later ideas).

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js (App Router) + TypeScript on Vercel Hobby | Native to Vercel; all database access stays on the server |
| UI | Tailwind, shadcn/ui, TanStack Table | Accessible components; 500 rows sort and filter fine in the browser |
| Database | Neon Postgres (Free), added through the Vercel Marketplace | Scales to zero after 5 idle minutes and wakes on the next query in well under a second. No manual restore after quiet weeks. |
| ORM and migrations | Drizzle, migrations in `drizzle/` | Typed queries; schema changes are reviewable in the open |
| Auth | Better Auth with the email OTP plugin, sign-up disabled | 6-digit code by email, no passwords; auth tables live in our own database |
| Email | Resend, sending from a verified subdomain | Free tier: 3,000 transactional emails a month (100 a day), plus 1,000 marketing contacts for Broadcasts |
| CSV parsing | Papa Parse, in the browser | The raw export never leaves the user's machine; only allowed columns from adult rows are sent to the server |
| XLSX export | ExcelJS, loaded only when someone exports | Formatted workbooks; avoids the unmaintained `xlsx` npm package, which has unpatched CVEs |
| Charts | Recharts | Enough for a metrics page |
| Tests and CI | Vitest + GitHub Actions (lint, typecheck, test on every PR) | Free for public repos |

### Why Neon and not Supabase

Supabase was the first idea. Its free tier pauses a project after 7 days without activity, and a paused project stays down until someone restores it from the Supabase dashboard. Roundtable meets monthly, so without a keep-alive job the database would be paused at most meetings. Neon's free tier instead suspends compute after 5 idle minutes and resumes on its own on the next connection.

What we give up: Supabase Auth and row level security. Better Auth covers sign-in. Authorization moves into application code, which is acceptable here because the database has no public API. It is reachable only from our server with a secret connection string. Every server action goes through one `requireRole()` guard in `lib/auth`.

### Hub structure

```
app/
  login/                  email, then code
  (hub)/layout.tsx        auth gate + nav built from the tool registry
  (hub)/page.tsx          hub home: tool cards and quick stats
  (hub)/contacts/
  (hub)/attendance/
  (hub)/admin/            users, import log, settings, full backup
lib/
  auth/                   Better Auth config, requireRole()
  db/                     Drizzle schema and the only code that queries the database
  tools/registry.ts       one entry per tool: slug, name, icon, minimum role
  import/                 parse, normalize, filter, dedupe (pure functions, unit tested)
  export/                 CSV and XLSX writers shared by all tools
drizzle/                  migrations
tests/fixtures/           synthetic data only, never real exports
```

Adding a tool means a folder under `app/(hub)/` and one registry entry. Contacts and units are shared services every tool can read.

## Data model (first pass)

- **units**: Scouting America unit ID (unique when present), type (Pack, Troop, Crew, Ship, Post, Club), number, designation, chartered organization, district, active flag. Troops carry B or G for linked boys' and girls' troops ("Troop 101 B"). Packs are F (family) or B. Crews and Ships have none.
- **contacts**: first, last, and preferred name; primary and alternate email; phone; member ID (unique when present); youth flag; parent or guardian email (youth only); notes; status (active, not in latest roster, archived); source (import, manual, walk-in); timestamps.
- **affiliations**: links contacts to units with a position (Cubmaster, Committee Chair, and so on). Unit is optional so district positions like Unit Commissioner or Merit Badge Counselor fit the same table. Each carries its registration status and expiry date from the export.
- **meetings**: date, scouting year, title or topic, format (in person, virtual, hybrid), status (held, cancelled), notes.
- **attendance**: meeting, contact, unit represented that night (optional), method (manual, legacy import, pasted list), check-in time. Unique on meeting + contact.
- **imports**: who ran it, when, file name, counts (rows read, youth dropped, other districts dropped, new, updated, unchanged, needs review).
- **users, sessions, verifications**: Better Auth tables, plus a role (admin, editor, viewer).
- **audit_log**: imports, merges, deletes, role changes.
- **settings**: districts served, scouting year start month, email separator default.

Meetings are their own records because the current sheets have months with no attendance marked and months with no column at all. A meeting record says whether it happened, which keeps "percent of meetings attended" honest.

## Tool 1: Contacts

- Searchable, sortable table. Filters for unit type, unit, position, district position, registration status, has email, attended in the last N meetings, never attended.
- Contact detail page: units and positions, attendance history, notes.
- Add, edit, and archive by hand. Merge two contacts, keeping attendance from both.
- **Youth, by hand only.** Adding a youth contact requires a parent or guardian email. Whenever a youth is in a copied or exported email list, their parent's address is included automatically, so no message to a youth goes out one-on-one.
- **Copy emails** copies the deduped addresses of whatever is filtered right now, then confirms: "Copied 312 emails. 14 contacts in this list have no email." Separator toggle (comma, or semicolon for Outlook). Option to copy in batches, for example 50 at a time, for sending from a normal mailbox. A short reminder to paste into BCC.
- Export the current view to CSV or XLSX, including a preset shaped for Resend's contact import.

### Import from the roster export

The export has 90 columns, one row per registration. `tests/fixtures/roster-export-sample.csv` reproduces the exact header with synthetic rows covering each case below.

**Columns we read.** Everything else is ignored in the browser and never sent to the server.

| Purpose | Export columns |
| --- | --- |
| Identity | `MemberID`, `FirstName`, `MiddleName`, `LastName`, `Suffix`, `CommonName` (preferred name) |
| Contact | `Email`, then `EmailHome`, then `EmailBus`; `PhoneNo`, `PhoneType`, `PhoneExtension` |
| Youth test | `IsYouth`, `unitPosition`, `aboveUnitPosition` |
| Unit | `UnitID`, `UnitType`, `UnitNo`, `GenderAccepted`, `SponsoringOrg`, `DistrictLong` |
| Unit position | `unitPosition`, `EffectiveDT`, `ExpiryDT`, `RegistrationStatusLong`, `IsPaidRegistration` |
| District position | `aboveUnitPosition`, `aboveUnitDistrictLong`, `aboveUnitEffectiveDt`, `aboveUnitExpiryDt` |

**Never read:** street address, ZIP, county, birthdate, age, gender, ethnicity, citizenship, school, rank, Eagle data, special needs, parent and guardian fields, and the rest of the demographic columns.

**Steps.**

1. Upload the CSV. It is parsed in the browser. The byte-order mark is stripped, and short (truncated) rows are flagged, not guessed at.
2. **Drop youth.** A row is youth if `IsYouth` is 1. If `IsYouth` is blank, a row with no unit position and no district position is treated as youth. Age alone is not used: Venturers and Sea Scouts can be 18 to 20 and are still youth members.
3. **Filter by district.** Keep rows whose `DistrictLong` or `aboveUnitDistrictLong` matches the districts set in Settings. The export can cover more than one district, and district names are not formatted consistently ("SAMPLE DISTRICT 30" vs. "Other River District 15"), so matching is on the exact configured strings.
4. **Normalize.** Trim and fix capitalization. Lowercase emails. Standardize phone numbers. Parse dates in either `MM-DD-YY` or `M/D/YYYY` form (both appear in the same column). Read unit numbers as integers (`UnitName` zero-pads to four digits, `UnitNo` does not).
5. **Dedupe.**
   - Inside the file: rows sharing a `MemberID` collapse into one contact with several affiliations. `RegistrationStatusLong = Multiple` marks people registered in more than one place. Their other registrations may be outside this export, so affiliations from earlier imports are kept, not dropped.
   - Against the database, in order of confidence: member ID; then email plus first name; then a fuzzy name match (legal "James" vs. preferred "Jim", typos) with a shared unit. Only the first two merge automatically. Fuzzy matches go to a review queue. This matters most for walk-ins and the legacy attendance sheets, which have no member IDs.
   - Families often share one email. Same email with a different first name means two people. These are flagged, not merged.
6. **Preview** before saving: rows read, youth dropped, other districts dropped, new, updated (changed fields shown), unchanged, needs review.
7. **Save** in one database transaction and record it in the import log.
8. People already in the database but missing from this import are marked "not in latest roster". They are never deleted, so recharter churn does not erase attendance history.

Import never overwrites hand-entered notes, preferred names set by hand, or hand-added youth.

## Tool 2: Attendance + Metrics

### Capture

- Check-in screen built for a phone or tablet at the door: today's meeting preselected, type-ahead name search, tap to mark present, undo.
- Walk-in quick add (name, email, unit). Walk-ins are flagged so the next import can match them to official records.
- Bulk mark from a pasted list, such as a Zoom attendance report, using the same matching and review flow as import.

### Legacy import

One-time import of the existing Google Sheets (Name, Unit, a notes column, one column per month marked "Attended"). It creates meetings from the month columns, matches names to contacts with a review step, and parses the notes column into extra units and roles. Run it after the first roster import so names match against real records.

### Metrics, first set

- Headcount per meeting, next to the same month last year.
- Units represented per meeting, and unit coverage: percent of the district's active units with at least one attendee this year. The roster export lists every unit with registered members, so we have the full set.
- **Units not represented** this year, with one-click copy of their leaders' emails. This is the outreach list.
- New vs. returning attendees, and year-over-year retention.
- Mix by program: Packs, Troops, Crews, Ships.
- Per person: meetings attended this year, last attended, current streak.

### Exports

- Attendance matrix: people by meetings, marked "Attended". Same shape as today's sheet so it drops into existing tools.
- Long format: one row per attendance (date, name, email, unit) for pivot tables.
- Metrics summary.
- The XLSX export puts these on separate sheets in one workbook.

## Announcements (Resend Broadcasts)

Pasting 300+ addresses into a personal mailbox risks recipient caps and spam flags. Resend's free tier includes Broadcasts for up to 1,000 contacts, separate from the sign-in email quota, with unsubscribe links handled for us.

- **Available from Phase 1, no code:** export the filtered list in the Resend preset, import it to a Resend audience, send from the Resend dashboard.
- **Phase 5:** a "Sync to Resend" button pushes the current list (or a saved segment, like "all unit leaders" or "units not represented") to a Resend audience. Unsubscribes come back and are shown on the contact.
- New sending domains need warming up. Send a small test first, and let the first full send go to a list that expects it.

## Security and data handling

The repo is public, so the code assumes anyone can read it.

- **Secrets** live only in Vercel environment variables. `.env*` files are ignored by git. GitHub secret scanning and push protection are on.
- **No real data in git.** `*.csv` and `*.xlsx` are ignored everywhere except `tests/fixtures/`, which holds synthetic data only.
- **Sign-in** is a 6-digit email code, 10-minute expiry, limited attempts. Sign-up is disabled on the server, so unknown addresses get no code and no account. Admins add users. Rate limits are stored in the database, not memory, because serverless instances do not share memory.
- **Authorization**: all data access is server-side through `lib/db`, and every server action and route handler calls `requireRole()`. No database credentials or queries in the browser.
- **Roles**: admin (users, imports, deletes, merges, settings), editor (contacts, attendance), viewer (read, export, copy emails).
- **Data minimization**: only the columns listed above are stored. Youth are never imported.
- **Hosting protection**: Vercel Authentication stays on for preview deployments and the `*.vercel.app` URLs. The app is public only on its custom domain, where our own sign-in applies.
- **Environments**: Neon's `main` branch is production. A `dev` branch holds synthetic seed data. Preview deployments use `dev`, never a copy of production, because a Neon branch copies its parent's data.
- **Backups**: the free tier's restore window is short. The admin page gets a full backup export (every table, XLSX and JSON).

## Domain and DNS

- App: `roundtable.<maintainer domain>` (name to be confirmed), as a CNAME to Vercel.
- Email: the same subdomain is verified in Resend. Resend's records sit on sub-names (`send.` and `resend._domainkey.`), so they do not collide with the app's CNAME, and the parent domain's own mail is unaffected.
- Sender: "Roundtable" display name, a `no-reply` address for sign-in codes, and a monitored reply-to for announcements.
- If the tool moves to a district-owned domain later, it is a DNS change and a Resend re-verify, about an hour.

## Delivery phases

| Phase | Scope | Size | Main risk |
| --- | --- | --- | --- |
| 0. Foundation | Vercel project, Neon, custom subdomain, Resend domain, Better Auth OTP, users and roles, hub shell, CI | M | DNS and email deliverability |
| 1. Contacts | Units, contacts, affiliations; filters; copy emails; manual youth with parent email; CSV and XLSX export | M | Low |
| 2. Import | Roster parser, youth and district filters, dedupe, review queue, preview, save, log | L | Fuzzy match quality |
| 3. Attendance | Meetings, check-in screen, walk-ins, pasted lists, legacy import, exports | M | Name matching on legacy data with no emails or IDs |
| 4. Metrics | Dashboard, outreach list, metrics export | S to M | Low once units are imported |
| 5. Announcements | Resend audience sync, segments, unsubscribe sync | S to M | Sending domain reputation |

Each phase ships to the production URL behind login and gets used at the next roundtable before the next phase starts.

## Open questions

1. Confirm Neon + Better Auth in place of Supabase.
2. Which Vercel account hosts the project, and the exact subdomain name. Where is the parent domain's DNS hosted?
3. Which district or districts does this roundtable serve? The export can include more than one.
4. In a full export, does someone with "Multiple" registrations appear on several rows with the same Member ID, or on one row?
5. Should any adult positions be skipped at import (for example Merit Badge Counselor only, Unit Scouter Reserve, Registration Inquiry), or import every adult and filter later?
6. Is roundtable one session a month, or are Cub Scout and Scouts BSA breakouts tracked separately? Were the months with no attendance cancelled?
7. Who records attendance at the door, and on what device?
8. Has the district or council signed off on storing member contact data in a tool outside Scouting America's systems?
9. What attendance numbers get reported up to the district or council, so the metrics match?

## Later ideas

- QR self check-in at the door. Needs a public form that never reveals the roster.
- Roundtable planning: topics, speakers, agenda archive.
- Commissioner follow-up notes per unit.
- Short feedback survey after each roundtable.
