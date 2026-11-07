import { cn } from "cn";
import Link from "next/link";

const TABS = [
  { key: "contacts", label: "Contacts", href: "/contacts" },
  { key: "groups", label: "Groups", href: "/contacts/groups" },
] as const;

/** The Contacts and Groups tabs at the top of both pages. */
export function ContactsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Contacts and groups" className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
            t.key === active && "bg-background text-foreground shadow-sm",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
