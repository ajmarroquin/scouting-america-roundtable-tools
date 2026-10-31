import { z } from "zod";

// What the position picker sends: a unit (existing, new, or none for district
// positions) and a position title. Shared by the forms and the server.

export const NEW_UNIT_TYPES = ["Pack", "Troop", "Crew", "Ship", "Post", "Club"] as const;

/** Troops are boys, girls, or family; packs are family or boys. Other units have no designation. */
export const DESIGNATIONS: Record<string, { value: "B" | "G" | "F"; label: string }[]> = {
  Troop: [
    { value: "B", label: "Boys (B)" },
    { value: "G", label: "Girls (G)" },
    { value: "F", label: "Family (F)" },
  ],
  Pack: [
    { value: "F", label: "Family" },
    { value: "B", label: "Boys" },
  ],
};

export const unitRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("district") }),
  z.object({ kind: z.literal("existing"), id: z.uuid() }),
  z
    .object({
      kind: z.literal("new"),
      type: z.enum(NEW_UNIT_TYPES),
      number: z.coerce.number().int("Unit number must be a whole number").min(1, "Enter the unit number").max(99999),
      genderAccepted: z.enum(["B", "G", "F"]).nullable(),
    })
    .refine((u) => !DESIGNATIONS[u.type] || u.genderAccepted, {
      message: "Pick a designation: boys, girls, or family for a troop; family or boys for a pack",
    })
    .refine((u) => DESIGNATIONS[u.type] || !u.genderAccepted, { message: "Only troops and packs take a designation" }),
]);

export const affiliationInputSchema = z.object({
  unit: unitRefSchema,
  position: z.string().trim().min(1, "Pick a position").max(120),
});

export type UnitRef = z.input<typeof unitRefSchema>;
export type AffiliationInput = z.input<typeof affiliationInputSchema>;
