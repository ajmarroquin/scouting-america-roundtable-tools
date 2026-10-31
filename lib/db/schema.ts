import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Better Auth tables. Property names must match Better Auth's field names.

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("viewer"),
    /** Set by the app (not Better Auth) each time this person signs in. */
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("user_role_check", sql`${t.role} in ('viewer', 'editor', 'admin')`)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// App tables.

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    // Kept as text so the trail survives when the actor is removed.
    actorEmail: text("actor_email"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_log_at_idx").on(t.at)],
);

// Contacts. Shapes follow docs/PLAN.md. Units and affiliations come from the
// roster import; people can also be added by hand.

export const importRun = pgTable("import_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  actorEmail: text("actor_email"),
  fileName: text("file_name"),
  district: text("district").notNull(),
  counts: jsonb("counts").$type<Record<string, number>>().notNull(),
});

export const unit = pgTable(
  "unit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Scouting America's unit ID. Present for every unit that came from an import.
    bsaUnitId: text("bsa_unit_id").unique(),
    type: text("type").notNull(),
    number: integer("number").notNull(),
    // B, G, or F from the export's GenderAccepted. Linked troops differ only here.
    genderAccepted: text("gender_accepted"),
    charteredOrg: text("chartered_org"),
    district: text("district"),
    // False once a later import no longer lists the unit.
    active: boolean("active").notNull().default(true),
    lastImportId: uuid("last_import_id").references(() => importRun.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("unit_type_number_idx").on(t.type, t.number),
    // Units added by hand have no Scouting America ID; keep them unique by name.
    uniqueIndex("unit_manual_key")
      .on(t.type, t.number, sql`coalesce(${t.genderAccepted}, '')`)
      .where(sql`${t.bsaUnitId} is null`),
  ],
);

export const CONTACT_STATUSES = ["active", "not_in_roster", "archived"] as const;
export const CONTACT_SOURCES = ["import", "manual", "walk_in"] as const;

export const contact = pgTable(
  "contact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: text("member_id").unique(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull().default(""),
    suffix: text("suffix"),
    preferredName: text("preferred_name"),
    email: text("email"),
    altEmail: text("alt_email"),
    phone: text("phone"),
    phoneType: text("phone_type"),
    isYouth: boolean("is_youth").notNull().default(false),
    guardianEmail: text("guardian_email"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("manual"),
    // The export flags people registered in more than one place but lists them once.
    multipleRegistrations: boolean("multiple_registrations").notNull().default(false),
    lastImportId: uuid("last_import_id").references(() => importRun.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contact_email_idx").on(t.email),
    index("contact_name_idx").on(t.lastName, t.firstName),
    check("contact_status_check", sql`${t.status} in ('active', 'not_in_roster', 'archived')`),
    check("contact_source_check", sql`${t.source} in ('import', 'manual', 'walk_in')`),
    // Youth Protection: no youth contact without a parent or guardian to copy.
    check("contact_youth_guardian_check", sql`not ${t.isYouth} or ${t.guardianEmail} is not null`),
  ],
);

export const affiliation = pgTable(
  "affiliation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // Null for district positions such as Unit Commissioner.
    unitId: uuid("unit_id").references(() => unit.id, { onDelete: "cascade" }),
    district: text("district"),
    position: text("position").notNull(),
    registrationStatus: text("registration_status"),
    expiresOn: date("expires_on", { mode: "string" }),
    // Imports replace their own rows; hand-added rows are never touched by an import.
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("affiliation_contact_unit_position_key").on(t.contactId, t.unitId, t.position).nullsNotDistinct(),
    index("affiliation_contact_idx").on(t.contactId),
    index("affiliation_unit_idx").on(t.unitId),
    check("affiliation_source_check", sql`${t.source} in ('import', 'manual')`),
  ],
);

export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

// Attendance. One meeting per date; breakouts aren't tracked separately.

export const MEETING_FORMATS = ["in_person", "virtual", "hybrid"] as const;
export const MEETING_STATUSES = ["held", "cancelled"] as const;
export const ATTENDANCE_METHODS = ["check_in", "walk_in", "pasted_list", "legacy_import", "manual"] as const;

export const meeting = pgTable(
  "meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date", { mode: "string" }).notNull().unique(),
    title: text("title"),
    format: text("format").notNull().default("in_person"),
    status: text("status").notNull().default("held"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("meeting_format_check", sql`${t.format} in ('in_person', 'virtual', 'hybrid')`),
    check("meeting_status_check", sql`${t.status} in ('held', 'cancelled')`),
  ],
);

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    // The unit they came for, when it matters. Null means all of their units count.
    unitId: uuid("unit_id").references(() => unit.id, { onDelete: "set null" }),
    method: text("method").notNull().default("check_in"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    checkedInBy: text("checked_in_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("attendance_meeting_contact_key").on(t.meetingId, t.contactId),
    index("attendance_contact_idx").on(t.contactId),
    check(
      "attendance_method_check",
      sql`${t.method} in ('check_in', 'walk_in', 'pasted_list', 'legacy_import', 'manual')`,
    ),
  ],
);
