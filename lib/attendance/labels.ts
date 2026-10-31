// Shared by server and client components. Constants exported from a "use client"
// file arrive in server components as references, not values, so they live here.

export const FORMAT_LABELS: Record<string, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};
