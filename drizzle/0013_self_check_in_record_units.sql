-- Self check-ins now count every unit on the person's record; the page is only
-- for corrections. Check-ins made before counted just the units left ticked, so
-- one tap could drop a person's unit. Give those check-ins their record units
-- back, except a unit the person said they'd left. Claims are left as they are.
INSERT INTO "attendance_unit" ("attendance_id", "unit_id", "approved")
SELECT DISTINCT a."id", af."unit_id", true
FROM "attendance" a
JOIN "contact" c ON c."id" = a."contact_id"
JOIN "affiliation" af ON af."contact_id" = a."contact_id" AND af."unit_id" IS NOT NULL
WHERE a."units_confirmed" = true
  AND c."pending_review" = false
  AND NOT EXISTS (
    SELECT 1 FROM "checkin_review" r
    WHERE r."contact_id" = a."contact_id"
      AND r."unit_id" = af."unit_id"
      AND r."kind" = 'remove_unit'
      AND r."status" IN ('open', 'approved')
  )
ON CONFLICT ("attendance_id", "unit_id") DO NOTHING;
