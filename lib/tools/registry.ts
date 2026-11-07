import { hasRole, type Role } from "@/lib/auth/roles";

export type Tool = {
  slug: string;
  name: string;
  description: string;
  href: string;
  minRole: Role;
  status: "live" | "soon";
};

// Adding a tool: a folder under app/(hub)/ and one entry here. The home page shows them in this order.
export const TOOLS: Tool[] = [
  {
    slug: "roundtables",
    name: "Roundtables",
    description: "The calendar of roundtables: schedule them, take RSVPs, check people in, and track unit coverage toward 100%.",
    href: "/roundtables",
    minRole: "viewer",
    status: "live",
  },
  {
    slug: "announcements",
    name: "Announcements",
    description: "Email unit leaders, units you haven't reached, or everyone, with an unsubscribe link built in.",
    href: "/announcements",
    minRole: "admin",
    status: "live",
  },
  {
    slug: "contacts",
    name: "Contacts",
    description: "Adult leaders and the units they serve. Import, search, copy emails, export.",
    href: "/contacts",
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
