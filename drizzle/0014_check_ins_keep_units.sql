-- Every check-in now keeps the units it counts, however it was made, so a past
-- year's numbers stay put when people move units. Check-ins made before by a
-- volunteer, a pasted list, or an old sheet worked theirs out from the record
-- each time; keep exactly what they count today: the unit named on the
-- check-in, or else every unit on the person's record.
INSERT INTO "attendance_unit" ("attendance_id", "unit_id", "approved")
SELECT a."id", a."unit_id", true
FROM "attendance" a
WHERE a."units_confirmed" = false AND a."unit_id" IS NOT NULL
ON CONFLICT ("attendance_id", "unit_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "attendance_unit" ("attendance_id", "unit_id", "approved")
SELECT DISTINCT a."id", af."unit_id", true
FROM "attendance" a
JOIN "affiliation" af ON af."contact_id" = a."contact_id" AND af."unit_id" IS NOT NULL
WHERE a."units_confirmed" = false AND a."unit_id" IS NULL
ON CONFLICT ("attendance_id", "unit_id") DO NOTHING;
--> statement-breakpoint
UPDATE "attendance" SET "units_confirmed" = true WHERE "units_confirmed" = false;
