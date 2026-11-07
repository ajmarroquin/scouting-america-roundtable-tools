CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"audience" text NOT NULL,
	"audience_label" text NOT NULL,
	"recipients" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"resend_broadcast_id" text,
	"sent_by" text,
	"sent_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_status_check" CHECK ("announcement"."status" in ('sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "unsubscribed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_sent_by_user_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_created_idx" ON "announcement" USING btree ("created_at");