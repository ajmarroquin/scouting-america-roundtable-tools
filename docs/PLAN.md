# Roundtable Tools: Build Plan

Status: v4, October 2026. Phases 0 to 2 are built: sign-in, users, contacts, and roster import. Live at `rpc.pack662nyc.com`.

## What this is

A small web hub for a district roundtable team. Signed-in volunteers get a set of tools that share one contact layer. The first two tools are **Contacts** and **Attendance + Metrics**. Every tool exports to CSV and Excel so data can move into the systems we already use.

The code is public. The data is not. Most of the design below follows from that split.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Hosting accounts | The maintainer's personal accounts, not an employer's. Vercel Hobby. |
| Stack | Neon Postgres and Better Auth (email codes), not Supabase. See "Why Neon". |
| Users | 2 to 10 people sign in. |
| District | The roundtable serves one district. Import keeps that district's rows and drops the rest. |
| Youth | Import adults only. Youth rows are dropped in the browser before anything is saved. Youth can be added by hand when needed. |
| Positions | Import every adult position. Filter later; some announcements go out broadly. |
| Contact source | Scouting America's "all registered people" roster export (CSV). There is no import into Scouting America's tools; data only flows out. |
| Domain | `rpc.pack662nyc.com` for the app. `mail.pack662nyc.com` verified in Resend for sending, so a future pack app can share it. Move to a dedicated domain if the tools outgrow this. |
| Email provider | Resend: transactional email for sign-in codes, Broadcasts for roundtable announcements. |
| Meetings | One session a month. Breakouts are coming but not tracked separately: what matters is whether someone attended the meeting. |
| Attendance capture | A volunteer checks people in by hand. QR self check-in later. |
| Data storage | Approved by the district. |
| Headline metric | What council asks for: the percent of units with at least one representative at a roundtable this scouting year. Goal: 100%. |

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
- **meetings**: date, scouting year, title or topic, format (in person, virtual, hybrid), status (held, cancelled), notes. Breakouts are not modeled; attendance is per meeting.
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
2. **Harvest units, then drop youth.** Unit records (ID, type, number, designation, chartered org, district) are read from every row first, youth rows included. Unit details are not personal data, and a unit whose only registered members are youth or "Multiple" adults listed elsewhere must still count toward coverage. Then personal data is dropped for youth rows. A row is youth if `IsYouth` is 1. If `IsYouth` is blank, a row with no unit position and no district position is treated as youth. Age alone is not used: Venturers and Sea Scouts can be 18 to 20 and are still youth members.
3. **Filter by district.** Keep rows whose `DistrictLong` or `aboveUnitDistrictLong` matches the district set in Settings. The export covers more than one district, and district names are not formatted consistently ("SAMPLE DISTRICT 30" vs. "Other River District 15"), so matching is on the exact configured string.
4. **Normalize.** Trim and fix capitalization. Lowercase emails. Standardize phone numbers. Parse dates in either `MM-DD-YY` or `M/D/YYYY` form (both appear in the same column). Read unit numbers as integers (`UnitName` zero-pads to four digits, `UnitNo` does not).
5. **Dedupe.**
   - Inside the file: rows sharing a `MemberID` collapse into one contact with several affiliations, as a safeguard.
   - `RegistrationStatusLong = Multiple`: the export lists these people once, with one unit, and only flags that they hold other registrations. Their other units are added by hand on the contact and are never removed by a later import. The contact shows a "registered in more than one place" hint so it's clear the list may be incomplete.
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

One-time import of the existing Google Sheets (Name, Unit, a notes column, one column per month marked "Attended"). It creates meetings from the month columns, matches names to contacts with a review step, and parses the notes column into extra units and roles. A month column with no attendance is created as a cancelled meeting (those months had other events), and the importer asks before assuming that. Run it after the first roster import so names match against real records.

### Metrics, first set

**Headline: unit coverage, the number council asks for.**

> Units with at least one representative at a held roundtable this scouting year ÷ active units in the district. Goal: 100%.

- *Active units* come from the latest roster import, read from every row, so units with only youth members still count. Linked troops (B and G) are separate units with separate unit IDs, so each counts on its own.
- *Represented*: if the check-in names the unit the person came for, that unit counts. Otherwise every unit the attendee is affiliated with counts, including units added by hand for "Multiple" registrations.
- Shown as a progress bar toward 100%, with the number of units still to reach.

Supporting metrics:

- **Units not represented** this year, with one-click copy of their leaders' emails. This is the outreach list that moves the headline number.
- Coverage per meeting, and cumulative coverage across the year.
- Headcount per meeting, next to the same month last year.
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
- **Environments**: Neon's `main` branch is production. Preview deployments never get `DATABASE_URL`, even though the Neon integration attaches it to Preview: `lib/db/url.ts` gives previews only `PREVIEW_DATABASE_URL`, meant for a Neon branch with fake data. Until that's set, previews have no database.
- **Backups**: the free tier's restore window is short. The admin page gets a full backup export (every table, XLSX and JSON).

## Domain and DNS

DNS is at Namecheap. Step-by-step records are in `docs/SETUP.md`.

- App: `rpc.pack662nyc.com`, a CNAME to Vercel.
- Email: `mail.pack662nyc.com` is verified in Resend. Its records sit on sub-names of `mail.`, so the pack site and the pack's existing email are unaffected.
- Sender: "Roundtable Tools" display name, `no-reply@mail.pack662nyc.com` for sign-in codes, and a monitored reply-to for announcements.
- If the tools move to a dedicated domain later, it is a DNS change and a Resend re-verify, about an hour.

## Delivery phases

| Phase | Scope | Size | Main risk |
| --- | --- | --- | --- |
| 0. Foundation (built) | Vercel project, Neon, custom subdomain, Resend domain, Better Auth OTP, users and roles, hub shell, CI | M | DNS and email deliverability |
| 1. Contacts (built) | Units, contacts, affiliations; filters; copy emails; manual youth with parent email; CSV and XLSX export | M | Low |
| 2. Import (built) | Roster parser, youth and district filters, dedupe, preview, save, log. Fuzzy review queue moves to Phase 3, where walk-ins and the legacy sheets need it. | L | Fuzzy match quality |
| 3. Attendance (built) | Meetings, check-in screen, walk-ins, pasted lists, legacy import, exports | M | Name matching on legacy data with no emails or IDs |
| 4. Metrics | Dashboard, outreach list, metrics export | S to M | Low once units are imported |
| 5. Announcements | Resend audience sync, segments, unsubscribe sync | S to M | Sending domain reputation |

Each phase ships to the production URL behind login and gets used at the next roundtable before the next phase starts.

## Phase 0: what was built

- Next.js 16 app with Cache Components; session reads stream inside `<Suspense>`.
- Sign-in by 6-digit email code (Better Auth email OTP). Sign-up disabled; unknown emails get the same response and no email. Codes stored hashed, 10-minute expiry, 3 tries per code, rate-limited sends.
- First admin claimed through `BOOTSTRAP_ADMIN_EMAILS`, only while no admin exists.
- Users page for admins: add, change role, remove. The last admin can't be demoted or removed. Every change is written to `audit_log`.
- Hub home built from the tool registry, filtered by role.
- `proxy.ts` sends visitors without a session cookie to `/login`; every page and action re-checks the session on the server.
- Drizzle schema and migrations; production applies them during the build.
- CI on every PR: lint, typecheck, unit tests, build.

Verified locally against Postgres 16 with a browser test: unknown email gets no code; bootstrap admin signs in; add, duplicate, role change, and last-admin guard; sign-out; viewer can't see or open admin pages; the auth API refuses a self-assigned role; wrong codes lock out; code requests are rate-limited.

## Phases 1 and 2: what was built

- **Contacts** (`/contacts`): search; filters for program, unit, position, email, and status; copy emails with comma or semicolon separators and optional batches of 50 or 100, guardian emails included for youth; export to CSV, Excel, or a Resend contact list. Exports neutralize spreadsheet formulas.
- **Contact page**: roster details, preferred name and notes, positions added by hand (for "Multiple" registrations), archive and restore. Roster fields are read-only there; imports own them.
- **Add contact** (editors): walk-ins and youth. Youth require a parent or guardian email, enforced by a database constraint.
- **Import** (admins): parse in the browser, pick the district, see what's in the file, compare with current contacts, confirm. One transaction per import, serialized with an advisory lock. Logged in `import_run` and `audit_log` with counts only.
- **Tests**: the parser and import plan are covered against the synthetic fixture; the database write runs against a real Postgres in CI.

## Phase 3, part 1: what was built

- **Meetings** (`/attendance`): one per date, held or cancelled, in person, virtual, or hybrid, with an optional topic. Listed by scouting year (September to August) with people and units counted per meeting. Editors add and edit; deleting a meeting, which takes its check-ins, is admin-only.
- **Check-in** (`/attendance/[id]/check-in`, editors): built for a phone at the door. Search by name, preferred name, or unit; tap to check in, tap again to undo; the search clears after each check-in. "Add a walk-in" prefills the name from the search and checks them in. A walk-in who's already a contact (same email and first name) is just checked in.
- **Meeting page**: who came, what unit each represented, and how they were checked in. A person in several units counts for all of them unless an editor picks the one they came for.
- **Exports**: per scouting year, the old sheet's shape (people by meetings, "Attended", headcount row) and one row per check-in, as CSV or one Excel workbook; per meeting, a CSV.

## Phase 3, part 2: what was built

- **Name matching** (`lib/attendance/match.ts`): matches a typed name to a contact by first and preferred name, nicknames (Jim and James), accents, compound last names (Del Rosario), small typos, and email. A unit named on the sheet breaks ties. Only a confident, unambiguous match is taken on its own; a first name alone, a last initial, or a close spelling goes to review.
- **Review step** (shared): confident matches are picked; guesses wait until someone picks or takes the best guesses; "Someone else…" searches all contacts; unknown names are added as new contacts or skipped.
- **Load an old sheet** (`/attendance/import`, admins): a CSV download or cells pasted from Google Sheets. Reads the Name column (or first and last), the Unit column, and one column per meeting headed by a month ("Nov 25") or a date; other columns become notes on new contacts.
  - A month heading becomes the 1st of the month unless a meeting that month is already in the app; dates are editable.
  - Empty past months default to cancelled, empty future months to "don't load", and a meeting already in the app keeps its status.
  - New people are walk-ins. They get the units the sheet names as "Adult member", but only units already in the app that the text picks out without doubt ("troop 1 b, g" is Troop 1 B and Troop 1 G; "Troop 1" with both is left alone and noted).
  - When the sheet names exactly one of a person's units, the check-in records it as the unit represented.
  - Loading the same sheet twice adds nothing: meetings are found by date, and check-ins are one per person per meeting.
- **Paste a list** (meeting page, editors): one name per line, a Zoom participant report (using the original name when someone renamed themselves), or cells from a sign-in sheet. After review, everyone is checked in with method "pasted list". A full name that matches nobody defaults to a new contact; a single word, like a device name, defaults to skip.
- **Fixed**: the format badge on the meeting page was blank, because the page read the labels from a client-only file.

## Open questions

1. Reply-to address for announcements (Phase 5).
2. Scouting year start month (a setting; defaults to September).

## Later ideas

- Contact change history: who changed what, with old and new values, shown on the contact page. Today `audit_log` records who, when, and which fields, but not the values.

- QR self check-in at the door. Needs a public form that never reveals the roster.
- Roundtable planning: topics, speakers, agenda archive.
- Commissioner follow-up notes per unit.
- Short feedback survey after each roundtable.
