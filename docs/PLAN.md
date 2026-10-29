# Roundtable Tools: Build Plan

Status: draft for review, October 2026

## What this is

A small web hub for a district roundtable team. Signed-in volunteers get a set of tools that share one contact layer. The first two tools are **Contacts** and **Attendance + Metrics**. Every tool exports to CSV and Excel so data can move into the systems we already use.

The code is public. The data is not. Most of the design below follows from that split.

## Goals

- One source of truth for roundtable contacts (300 to 500 people) and the units they serve.
- Fast attendance capture at the meeting, with history that rolls up into useful metrics.
- Import the Scouting America contact export, clean it, and merge it without creating duplicates.
- One-click "copy emails" for any filtered list.
- CSV and XLSX export everywhere.
- Runs on free tiers: Vercel Hobby + Supabase Free.

## Non-goals for now

- Sending email from the app. We copy addresses into the mail client we already use.
- Two-way sync with my.scouting.org or Scoutbook. Import is one-way and on demand.
- Youth member records. Adults only (see Security and data handling).
- Public self check-in (possible later, see Later ideas).

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Web app | Next.js (App Router) + TypeScript on Vercel Hobby | Native to Vercel; server components and server actions keep DB access off the client |
| UI | Tailwind, shadcn/ui, TanStack Table | Accessible components; 500 rows sort and filter fine in the browser |
| Database | Supabase Postgres (Free), installed through the Vercel Marketplace | Env vars wired up automatically; row level security |
| Auth | Supabase Auth, email OTP (6-digit code) | No passwords; a code works when the email is read on a phone and the app is open on a laptop |
| OTP email delivery | Custom SMTP (see Open questions) | Supabase's built-in mailer only sends to the project's own team members, 2 per hour |
| CSV parsing | Papa Parse, in the browser | Raw files never leave the user's machine; only cleaned records are saved |
| XLSX export | ExcelJS, loaded only when someone exports | Formatted workbooks; avoids the unmaintained `xlsx` npm package, which has unpatched CVEs |
| Charts | Recharts | Simple, enough for a metrics page |
| Tests and CI | Vitest + GitHub Actions (lint, typecheck, test on every PR) | Free for public repos |
| Migrations | Supabase CLI, SQL in `supabase/migrations` | Schema changes are reviewable in the open |

Trade-off: Next.js is heavier than a plain single-page app. A hub with several tools, server-side auth checks, and a transactional import step benefits from it, and it is the best-supported path on Vercel and Supabase.

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
  tools/registry.ts       one entry per tool: slug, name, icon, minimum role
  supabase/               server and browser clients
  import/                 parse, normalize, dedupe (pure functions, unit tested)
  export/                 CSV and XLSX writers shared by all tools
supabase/migrations/
tests/fixtures/           synthetic CSVs only, never real data
```

Adding a tool means a folder under `app/(hub)/` and one registry entry. Contacts and units are shared services every tool can read.

## Data model (first pass)

- **units**: type (Pack, Troop, Crew, Ship, Post, Club), number, designation (B, G, or none for linked troops), chartered organization, active flag. Unique on type + number + designation. Displays as "Troop 1 B".
- **contacts**: first, last, and preferred name; email (not unique, see dedupe); phone; BSA member ID (unique when present); notes; status (active, not in latest roster, archived); source; timestamps.
- **affiliations**: links contacts to units with a position (Cubmaster, Committee Chair, and so on). Unit is optional so district roles like unit commissioner or membership committee fit the same table. Many people hold several.
- **meetings**: date, scouting year, title or topic, format (in person, virtual, hybrid), status (held, cancelled), notes. Breakout sessions (Cub Scout, Scouts BSA) pending an answer below.
- **attendance**: meeting, contact, unit represented that night (optional), method (manual, legacy import, pasted list), check-in time. Unique on meeting + contact.
- **imports**: who ran it, when, file name, counts (new, updated, unchanged, skipped, needs review), column mapping used.
- **app_users**: auth user, role (admin, editor, viewer), invited by.
- **audit_log**: imports, merges, deletes.

Meetings are their own records because the current sheets have months with no attendance marked and months with no column at all. A meeting record says whether it happened, which keeps "percent of meetings attended" honest.

The scouting year start month is a setting, not hard-coded.

## Tool 1: Contacts

- Searchable, sortable table. Filters for unit type, unit, position, status, has email, attended in the last N meetings, never attended.
- Contact detail page: units and positions, attendance history, notes.
- Add, edit, and archive by hand. Merge two contacts, keeping attendance from both.
- **Copy emails** copies the deduped addresses of whatever is filtered right now, then confirms: "Copied 312 emails. 14 contacts in this list have no email." Separator toggle (comma, or semicolon for Outlook). Option to copy in batches, for example 100 at a time, to stay under mail provider recipient caps. A short reminder to paste into BCC.
- Export the current view to CSV or XLSX.

### Import from the Scouting America contact export

1. Upload the CSV. It is parsed in the browser.
2. Columns are auto-mapped from known header names. The user confirms once and the mapping is saved for next time.
3. Normalize: trim, fix capitalization, lowercase emails, standardize phone numbers, and parse unit text ("troop 662B", "Pack 3001, troop 1", "troop 1 b, g") into unit records.
4. Filter, with editable defaults: drop youth records, drop rows outside our district, optionally keep only chosen positions, drop rows with no name.
5. Dedupe.
   - Inside the file: collapse one-row-per-position into one contact with several affiliations.
   - Against the database, in order of confidence: member ID match, then email plus first name, then a fuzzy name match (Jim and James, Bill and William, typos) with a shared unit. Only the first two merge automatically. Fuzzy matches go to a review queue.
   - Families often share one email. Same email with a different first name means two people. These are flagged, not merged.
6. Preview the result before saving: new, updated (with the changed fields shown), unchanged, needs review, skipped.
7. Save in one database transaction and record it in the import log.
8. People already in the database but missing from this import are marked "not in latest roster". They are never deleted, so recharter churn does not erase attendance history.

Import never overwrites hand-entered notes.

## Tool 2: Attendance + Metrics

### Capture

- Check-in screen built for a phone or tablet at the door: today's meeting preselected, type-ahead name search, tap to mark present, undo.
- Walk-in quick add (name, email, unit). Walk-ins are flagged so the next import can match them to official records.
- Bulk mark from a pasted list, such as a Zoom attendance report, using the same matching and review flow as import.

### Legacy import

One-time import of the existing Google Sheet (Name, Unit, a notes column, one column per month marked "Attended"). It creates meetings from the month columns, matches names to contacts with a review step, and parses the notes column into extra units and roles. Run it after the first contact import so names match against real records.

### Metrics, first set

- Headcount per meeting, next to the same month last year.
- Units represented per meeting, and unit coverage: percent of active district units with at least one attendee this year.
- **Units not represented** this year, with one-click copy of their leaders' emails. This is the outreach list.
- New vs. returning attendees, and year-over-year retention.
- Mix by program: Packs, Troops, Crews, Ships.
- Per person: meetings attended this year, last attended, current streak.

Unit coverage needs a complete list of the district's units. If the contact export does not provide that, we need a unit list from another source.

### Exports

- Attendance matrix: people by meetings, marked "Attended". Same shape as today's sheet so it drops into existing tools.
- Long format: one row per attendance (date, name, email, unit) for pivot tables.
- Metrics summary.
- The XLSX export puts these on separate sheets in one workbook.

## Security and data handling

The repo is public, so the code assumes anyone can read it.

- **Secrets** live only in Vercel environment variables. `.env*` files are ignored by git. GitHub secret scanning and push protection are on.
- **No real data in git.** `*.csv` and `*.xlsx` are ignored everywhere except `tests/fixtures/`, which holds synthetic data only.
- **Sign-in** is email OTP. Public sign-up is turned off at the Supabase project level. Hiding a sign-up button is not enough because the auth API is public. Admins invite users by email.
- **Authorization** is row level security on every table, deny by default. Tables are granted to the `authenticated` role only, never `anon`. New Supabase projects already require explicit grants, which suits this. Policies check the caller's row and role in `app_users`.
- **Roles**: admin (users, imports, deletes, merges), editor (contacts, attendance), viewer (read, export, copy emails).
- **Service key** is used only on the server, only to invite users. It never reaches the browser.
- **Data minimization**: store name, email, phone, member ID, units, and positions. No birthdates, home addresses, or youth records.
- **Free-tier pause**: Supabase Free pauses a project after 7 days with no database activity. Roundtable is monthly, so a daily Vercel cron calls a small health endpoint that queries the database.
- **Backups**: do not rely on the free tier. The admin page gets a full backup export (every table, XLSX and JSON). Revisit an encrypted scheduled dump if the data grows in value.
- **Environments**: two Supabase projects (the free limit), one for production and one for development and previews. Preview deployments never touch production data.

## Delivery phases

| Phase | Scope | Size | Main risk |
| --- | --- | --- | --- |
| 0. Foundation | Accounts, scaffold, Supabase and migrations, OTP login, invites, roles, RLS, hub shell, CI, keep-alive cron | M | OTP email deliverability |
| 1. Contacts | Units, contacts, affiliations; filters; copy emails; CSV and XLSX export | M | Low |
| 2. Import | Column mapping, normalize, filter, dedupe, review queue, preview, save, log | L | Messy source data; fuzzy match quality |
| 3. Attendance | Meetings, check-in screen, walk-ins, pasted lists, legacy import, exports | M | Name matching on legacy data with no emails |
| 4. Metrics | Dashboard, outreach list, metrics export | S to M | Needs a complete unit list |

Each phase ships to the production URL behind login and gets used at the next roundtable before the next phase starts.

## Open questions

1. Who owns the hosting accounts (Vercel, Supabase, the OTP sender), so the tool survives a change in roundtable staff?
2. Which Scouting America report is the contact export, and what are its exact column headers? A header row plus two or three rows of made-up values is enough. Real exports never go in this repo.
3. OTP email sender: a dedicated Gmail account with an app password (free, no domain needed), or a domain with a transactional provider such as Resend?
4. How many people sign in, and who should be admin, editor, or viewer?
5. Is roundtable one session per month, or are Cub Scout and Scouts BSA breakouts tracked separately?
6. Who records attendance at the door, and on what device?
7. Does the contact export list every unit in the district, or do we need a separate unit list for coverage metrics?
8. Which positions count as a roundtable contact for import filtering?
9. Has the district or council signed off on storing member contact data in a tool outside Scouting America's systems?
10. What attendance numbers get reported up to the district or council, so the metrics match?

## Later ideas

- QR self check-in at the door. Needs a public form that never reveals the roster.
- Roundtable planning: topics, speakers, agenda archive.
- Commissioner follow-up notes per unit.
- Short feedback survey after each roundtable.
