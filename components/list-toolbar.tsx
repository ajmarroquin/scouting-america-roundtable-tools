"use client";

import { cn } from "cn";
import { EllipsisVerticalIcon, PlusIcon, SearchIcon } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

// Every list page has the same row above its table, so things are where you expect
// them: search (or the year) first, then a short summary, then Add and a ⋮ menu on
// the right. More filters go on a second row, and the add form opens under the first.

export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...props} />;
}

export function ToolbarSearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-8" type="search" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A count or two, in the muted text that sits after the search. */
export function ToolbarSummary({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {children}
    </p>
  );
}

/** Add and the other buttons, kept together on the right. */
export function ToolbarActions({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>;
}

/** The main button on every list page; it opens the add form under the toolbar. */
export function AddButton({ open, onOpenChange, controls, children }: { open: boolean; onOpenChange: (open: boolean) => void; controls: string; children: ReactNode }) {
  return (
    <Button size="sm" aria-expanded={open} aria-controls={controls} onClick={() => onOpenChange(!open)}>
      <PlusIcon /> {children}
    </Button>
  );
}

/** The add form, under the toolbar. Its first field gets the cursor when it opens. */
export function AddPanel({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([type=checkbox]), textarea")?.focus();
  }, []);
  return (
    <Card id={id} ref={ref}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The ⋮ menu for everything that isn't the main action: import, export, options. */
export function MoreMenu({ label, children, ...content }: { label: string; children: ReactNode } & ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={label}>
          <EllipsisVerticalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" {...content}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
