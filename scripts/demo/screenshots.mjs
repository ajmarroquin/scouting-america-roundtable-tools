// Builds the README screenshots from made-up data, by using the app the way a
// person would: import a roster, load the unit list and last year's sheet,
// paste a Zoom report, check people in on a phone, then capture each tool.
//
//   DEMO_DATABASE_URL=postgres://postgres@localhost:5432/roundtable_demo npm run demo:screenshots
//
// DEMO_DATABASE_URL must be a throwaway local database: this wipes it. Needs
// Playwright with Chromium (npx playwright install chromium). Pass --skip-build
// to reuse the last `next build`.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as demo from "./data.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(root, "docs/screenshots");
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "admin@example.org";
const EDITOR = "editor@example.org";

function fail(message) {
  console.error(`demo: ${message}`);
  process.exit(1);
}

const url = process.env.DEMO_DATABASE_URL;
if (!url) fail("set DEMO_DATABASE_URL to a throwaway local Postgres database. It gets wiped.");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) fail("DEMO_DATABASE_URL must point at localhost.");

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  fail("Playwright isn't installed. Run: npm i -D playwright && npx playwright install chromium");
}

// 1. The made-up district, as the files a commissioner would have.
const world = demo.demoWorld();
const files = mkdtempSync(path.join(os.tmpdir(), "roundtable-demo-"));
const file = (name, text) => {
  const p = path.join(files, name);
  writeFileSync(p, text);
  return p;
};
const roster = file("roster-export.csv", demo.rosterCsv(world, root));
const unitList = file("unit-membership-totals.csv", demo.unitListCsv(world));
const sheet = file("Roundtable Attendance 2025-26.csv", demo.attendanceSheetCsv(world));
const zoom = demo.zoomReportCsv(world);

// 2. A clean database with three users.
const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await migrate(drizzle(client), { migrationsFolder: path.join(root, "drizzle") });
await client.query(
  `insert into "user" (id, name, email, role) values
   ('demo-admin', 'Sam Rivera', $1, 'admin'),
   ('demo-editor', 'Jordan Lee', $2, 'editor'),
   ('demo-viewer', 'Casey Kim', 'viewer@example.org', 'viewer')`,
  [ADMIN, EDITOR],
);
await client.end();

// 3. The app, built and started against the demo database. No email goes out:
// without a Resend key, sign-in codes are printed to the server log.
const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  BETTER_AUTH_SECRET: "demo-only-secret-not-for-production-0123456789",
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_TRUSTED_ORIGINS: BASE,
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  BOOTSTRAP_ADMIN_EMAILS: "",
  RUN_MIGRATIONS: "",
  VERCEL: "",
  VERCEL_ENV: "",
  APP_TIME_ZONE: "America/New_York",
};
if (!process.argv.includes("--skip-build")) execFileSync("npx", ["next", "build"], { cwd: root, env, stdio: "inherit" });
let log = "";
const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: root, env, detached: true });
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
const stop = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on("exit", stop);
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${BASE}/login`)).ok) break;
  } catch {}
  if (i > 60) fail(`the app didn't start:\n${log}`);
  await new Promise((r) => setTimeout(r, 500));
}

// 4. Use it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Escape every regex character in the address, not just dots.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const codes = (email) =>
  [...log.matchAll(new RegExp(`to=${escapeRegExp(email)} subject="Your sign-in code: (\\d{6})"`, "g"))].map((m) => m[1]);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

async function session(email, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: "light" });
  // Toasts are confirmation only; keep them out of the pictures.
  await context.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "[data-sonner-toaster]{display:none!important}";
      document.head.appendChild(style);
    });
  });
  const page = await context.newPage();
  const before = codes(email).length;
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("a 6-digit code is on its way").waitFor();
  for (let i = 0; i < 40 && codes(email).length <= before; i++) await sleep(250);
  await page.locator("input[data-input-otp]").fill(codes(email).at(-1));
  await page.waitForURL(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  return page;
}

async function shot(page, name, full = false) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  console.log(`demo: ${name}.png`);
}

async function open(page, href) {
  await page.goto(`${BASE}${href}`);
  await page.waitForLoadState("networkidle");
}

const desktop = { width: 1280, height: 860 };
const login = await (await browser.newContext({ viewport: desktop, colorScheme: "light" })).newPage();
await open(login, "/login");
await shot(login, "sign-in");

const admin = await session(ADMIN, desktop);

// Roster import.
await open(admin, "/contacts/import");
await admin.getByLabel("Roster export CSV").setInputFiles(roster);
await admin.getByRole("button", { name: "Compare with current contacts" }).click();
await admin.getByText("3. Review and confirm").waitFor();
await shot(admin, "roster-import", true);
await admin.getByRole("button", { name: /^Import \d+ people/ }).click();
await admin.getByText("Done", { exact: true }).waitFor();

// Unit list.
await open(admin, "/units/load");
await admin.getByLabel("CSV file").setInputFiles(unitList);
await admin.getByText("What this changes").waitFor();
await admin.getByRole("button", { name: "Load the unit list" }).click();
await admin.getByText("Loaded", { exact: true }).waitFor();

// Last year's sheet, with the real dates (third Thursdays).
const dates = { "Sep 25": "2025-09-18", "Oct 25": "2025-10-16", "Nov 25": "2025-11-20", "Dec 25": "2025-12-18", "Jan 26": "2026-01-15", "Feb 26": "2026-02-19", "Mar 26": "2026-03-19", "Apr 26": "2026-04-16", "May 26": "2026-05-21" };
await open(admin, "/attendance/import");
await admin.getByLabel("CSV file").setInputFiles(sheet);
await admin.getByText(/^Found \d+ people/).waitFor();
for (const [header, date] of Object.entries(dates)) await admin.getByLabel(`Date for ${header}`).fill(date);
await admin.locator("body").click({ position: { x: 5, y: 5 } });
await admin.getByText("3. People", { exact: true }).evaluate((el) => el.scrollIntoView({ block: "start" }));
await admin.mouse.wheel(0, -24);
await shot(admin, "old-sheet-review");
await admin.getByRole("button", { name: "Take the best guess for the rest" }).click();
await admin.getByRole("button", { name: /^Load \d+ meetings/ }).click();
await admin.getByText("Loaded", { exact: true }).waitFor();

// This year: a virtual roundtable from a Zoom report, and one checked in at the door.
async function newMeeting(date, topic, format) {
  await open(admin, "/attendance");
  await admin.getByLabel("Date", { exact: true }).first().fill(date);
  await admin.getByLabel("Topic (optional)").first().fill(topic);
  if (format) {
    await admin.getByRole("combobox", { name: "Format" }).first().click();
    await admin.getByRole("option", { name: format }).click();
  }
  await admin.getByRole("button", { name: "Add meeting" }).click();
  await admin.waitForURL(/\/attendance\/[0-9a-f-]{36}$/);
  await admin.waitForLoadState("networkidle");
  return admin.url();
}
await newMeeting("2026-09-17", "Fall kickoff", "Virtual");
await admin.getByRole("button", { name: "Paste a list" }).click();
await admin.getByLabel("Names to check in").fill(zoom);
await admin.getByRole("button", { name: "Match names" }).click();
await admin.getByText(/matched, \d+ new, \d+ skipped/).waitFor();
await shot(admin, "paste-a-list");
await admin.getByRole("button", { name: /^Check in \d+ (people|person)/ }).click();
await admin.getByText(/^\d+ (people|person) from \d+ units?/).waitFor();
const october = await newMeeting("2026-10-15", "Popcorn and recharter", null);

// Door check-in on a phone, as an editor.
const phone = await session(EDITOR, { width: 390, height: 844 });
await phone.goto(`${october}/check-in`);
await phone.waitForLoadState("networkidle");
const arrivals = [...world.adults.filter((_, i) => i % 9 === 3).slice(0, 6), ...world.adults.filter((_, i) => i % 5 === 2).slice(0, 3)];
for (const a of arrivals) {
  await phone.getByLabel("Search people to check in").fill(a.last);
  await phone.getByRole("button", { name: new RegExp(`${escapeRegExp(a.last)}.*Check in`) }).first().click();
  await sleep(250);
}
await phone.getByLabel("Search people to check in").fill("ma");
await sleep(300);
await shot(phone, "check-in-phone");

// The tools, with data in them.
await open(admin, "/");
await shot(admin, "home");
await open(admin, "/contacts");
await shot(admin, "contacts");
await admin.goto(october);
await admin.waitForLoadState("networkidle");
await shot(admin, "meeting", true);
await open(admin, "/attendance");
await admin.getByRole("combobox", { name: "Scouting year" }).click();
await admin.getByRole("option", { name: "2025-26 scouting year" }).click();
await shot(admin, "attendance");
// A unit typed in by hand, as for a walk-in, shows up flagged.
await open(admin, "/units?year=2025-26");
await admin.getByLabel("Number").fill("99");
await admin.getByRole("combobox", { name: "Designation" }).click();
await admin.getByRole("option", { name: "Family" }).click();
await admin.getByRole("button", { name: "Add unit" }).click();
await admin.getByRole("row").filter({ hasText: "Pack 99" }).waitFor();
await admin.evaluate(() => window.scrollTo(0, 0));
await shot(admin, "units");
await admin.getByRole("link", { name: "Pack 12", exact: true }).click();
await admin.waitForURL(/\/units\/[0-9a-f-]{36}/);
await shot(admin, "unit", true);
await open(admin, "/report?year=2026-27");
await shot(admin, "council-report", true);

// An announcement to the units nobody has come for yet, ready to send.
await open(admin, "/announcements");
await admin.getByRole("combobox", { name: "To" }).click();
await admin.getByRole("option", { name: /^Units not at roundtable yet this year/ }).click();
await admin.getByLabel("Subject").fill("We'd love to see your unit at roundtable");
await admin
  .getByLabel("Message")
  .fill(
    "Hi {first name},\n\nOur next roundtable is **Thursday, Nov 19 at 7pm** at Riverbend Community Center. It's an hour of program ideas, recharter help, and the chance to meet other leaders.\n\n- Winter camping tips\n- Recharter questions answered\n- Pizza\n\nRSVP or ask anything: just reply to this email.",
  );
await shot(admin, "announcements");

await browser.close();
stop();
console.log(`demo: done. Screenshots in ${path.relative(root, OUT)}/`);
process.exit(0);
