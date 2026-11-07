CREATE TABLE "contact_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_group_member" (
	"group_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_group_member_group_id_contact_id_pk" PRIMARY KEY("group_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "contact_group" ADD CONSTRAINT "contact_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_group_id_contact_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_member" ADD CONSTRAINT "contact_group_member_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_group_name_key" ON "contact_group" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "contact_group_member_contact_idx" ON "contact_group_member" USING btree ("contact_id");