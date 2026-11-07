CREATE TABLE "rsvp" (
	"meeting_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"response" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvp_meeting_id_contact_id_pk" PRIMARY KEY("meeting_id","contact_id"),
	CONSTRAINT "rsvp_response_check" CHECK ("rsvp"."response" in ('yes', 'no'))
);
--> statement-breakpoint
ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rsvp_contact_idx" ON "rsvp" USING btree ("contact_id");