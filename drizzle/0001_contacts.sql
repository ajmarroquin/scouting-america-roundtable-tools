CREATE TABLE "affiliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"unit_id" uuid,
	"district" text,
	"position" text NOT NULL,
	"registration_status" text,
	"expires_on" date,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliation_contact_unit_position_key" UNIQUE NULLS NOT DISTINCT("contact_id","unit_id","position"),
	CONSTRAINT "affiliation_source_check" CHECK ("affiliation"."source" in ('import', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" text,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text DEFAULT '' NOT NULL,
	"suffix" text,
	"preferred_name" text,
	"email" text,
	"alt_email" text,
	"phone" text,
	"phone_type" text,
	"is_youth" boolean DEFAULT false NOT NULL,
	"guardian_email" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"multiple_registrations" boolean DEFAULT false NOT NULL,
	"last_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "contact_status_check" CHECK ("contact"."status" in ('active', 'not_in_roster', 'archived')),
	CONSTRAINT "contact_source_check" CHECK ("contact"."source" in ('import', 'manual', 'walk_in')),
	CONSTRAINT "contact_youth_guardian_check" CHECK (not "contact"."is_youth" or "contact"."guardian_email" is not null)
);
--> statement-breakpoint
CREATE TABLE "import_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_email" text,
	"file_name" text,
	"district" text NOT NULL,
	"counts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bsa_unit_id" text,
	"type" text NOT NULL,
	"number" integer NOT NULL,
	"gender_accepted" text,
	"chartered_org" text,
	"district" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_bsa_unit_id_unique" UNIQUE("bsa_unit_id")
);
--> statement-breakpoint
ALTER TABLE "affiliation" ADD CONSTRAINT "affiliation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliation" ADD CONSTRAINT "affiliation_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_last_import_id_import_run_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."import_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_run" ADD CONSTRAINT "import_run_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_last_import_id_import_run_id_fk" FOREIGN KEY ("last_import_id") REFERENCES "public"."import_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliation_contact_idx" ON "affiliation" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "affiliation_unit_idx" ON "affiliation" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "contact_email_idx" ON "contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_name_idx" ON "contact" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "unit_type_number_idx" ON "unit" USING btree ("type","number");