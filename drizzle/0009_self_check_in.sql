CREATE TABLE "attendance_unit" (
	"attendance_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	CONSTRAINT "attendance_unit_attendance_id_unit_id_pk" PRIMARY KEY("attendance_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "checkin_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"unit_id" uuid,
	"role" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "checkin_review_kind_check" CHECK ("checkin_review"."kind" in ('new_person', 'add_unit', 'remove_unit')),
	CONSTRAINT "checkin_review_status_check" CHECK ("checkin_review"."status" in ('open', 'approved', 'rejected', 'merged'))
);
--> statement-breakpoint
CREATE TABLE "public_rate_limit" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" DROP CONSTRAINT "attendance_method_check";--> statement-breakpoint
ALTER TABLE "contact" DROP CONSTRAINT "contact_source_check";--> statement-breakpoint
ALTER TABLE "attendance" ADD COLUMN "units_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "pending_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "attendance_unit" ADD CONSTRAINT "attendance_unit_attendance_id_attendance_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_unit" ADD CONSTRAINT "attendance_unit_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_review" ADD CONSTRAINT "checkin_review_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_review" ADD CONSTRAINT "checkin_review_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_review" ADD CONSTRAINT "checkin_review_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_review" ADD CONSTRAINT "checkin_review_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_review_meeting_idx" ON "checkin_review" USING btree ("meeting_id","status");--> statement-breakpoint
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_public_token_unique" UNIQUE("public_token");--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_method_check" CHECK ("attendance"."method" in ('check_in', 'walk_in', 'pasted_list', 'legacy_import', 'manual', 'self_check_in'));--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_source_check" CHECK ("contact"."source" in ('import', 'manual', 'walk_in', 'self_check_in'));