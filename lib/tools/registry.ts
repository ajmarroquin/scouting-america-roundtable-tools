import { hasRole, type Role } from "@/lib/auth/roles";

export type Tool = {
  slug: string;
  name: string;
  description: string;
  href: string;
  minRole: Role;
  status: "live" | "soon";
};

// Adding a tool: a folder under app/(hub)/ and one entry here.
export const TOOLS: Tool[] = [
  {
    slug: "contacts",
    name: "Contacts",
    description: "Adult leaders and the units they serve. Import, search, copy emails, export.",
    href: "/contacts",
    minRole: "viewer",
    status: "live",
  },
  {
    slug: "attendance",
    name: "Attendance",
    description: "Check people in at roundtable and track unit coverage toward 100%.",
    href: "/attendance",
    minRole: "viewer",
    status: "live",
  },
  {
    slug: "units",
    name: "Units",
    description: "Every unit in the district, who's connected to it, and how often it shows up at roundtable.",
    href: "/units",
    minRole: "viewer",
    status: "live",
  },
  {
    slug: "council-report",
    name: "Council report",
    description: "Unit coverage for the scouting year, the units still to reach, and an export for council.",
    href: "/report",
    minRole: "viewer",
    status: "live",
  },
  {
    slug: "users",
    name: "Users",
    description: "Who can sign in and what they can do.",
    href: "/admin/users",
    minRole: "admin",
    status: "live",
  },
];

export function visibleTools(role: Role): Tool[] {
  return TOOLS.filter((tool) => hasRole(role, tool.minRole));
}
