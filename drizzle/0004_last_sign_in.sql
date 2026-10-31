ALTER TABLE "user" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
-- Best guess for people who signed in before this column existed: their newest session that's still around.
UPDATE "user" SET "last_sign_in_at" = s."latest" FROM (SELECT "user_id", max("created_at") AS "latest" FROM "session" GROUP BY "user_id") s WHERE s."user_id" = "user"."id";
