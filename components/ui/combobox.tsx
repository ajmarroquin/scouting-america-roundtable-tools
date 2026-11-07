"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";

export type ComboOption = {
  value: string;
  label: string;
  /** A heading the option sits under. */
  group?: string;
  /** Shown under the label, and searched too: a definition, a count. */
  hint?: string;
};

type Common = {
  options: ComboOption[];
  /** Read by screen readers, and the trigger's id target for a <Label>. */
  label: string;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

type Props =
  | (Common & { multiple: true; value: string[]; onChange: (value: string[]) => void; /** Shown when nothing is picked. */ allLabel: string })
  | (Common & { multiple?: false; value: string; onChange: (value: string) => void });

/**
 * A dropdown you can type into to search, picking one value or several.
 * For long lists (units, positions, audiences) where scrolling is a chore.
 */
export function Combobox(props: Props) {
  const { options, label, id, placeholder = "Pick one", className, disabled } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const picked = props.multiple ? props.value : props.value ? [props.value] : [];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.group ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const summary = props.multiple
    ? picked.length === 0
      ? props.allLabel
      : picked.length === 1
        ? labelOf(picked[0])
        : `${labelOf(picked[0])} +${picked.length - 1}`
    : picked.length
      ? labelOf(picked[0])
      : placeholder;

  function choose(value: string) {
    if (props.multiple) {
      props.onChange(picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]);
    } else {
      props.onChange(value);
      setOpen(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(shown.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active].value);
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-label={id ? undefined : label}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
            !picked.length && !props.multiple && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[max(var(--radix-popover-trigger-width),16rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector("input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b px-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Type to search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
            {props.multiple && picked.length > 0 && (
              <button type="button" className="shrink-0 text-xs text-muted-foreground underline underline-offset-2" onClick={() => props.onChange([])}>
                Clear
              </button>
            )}
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label={label} aria-multiselectable={props.multiple || undefined} className="max-h-72 overflow-y-auto p-1">
            {shown.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Nothing matches.</p>}
            {shown.map((o, i) => {
              const heading = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
              const selected = picked.includes(o.value);
              return (
                <div key={o.value}>
                  {heading && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{heading}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    className={cn("flex cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-sm", i === active && "bg-accent text-accent-foreground")}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o.value)}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center",
                        props.multiple && "rounded-[4px] border border-input",
                        props.multiple && selected && "border-primary bg-primary text-primary-foreground",
                      )}
                    >
                      {selected && <CheckIcon className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block">{o.label}</span>
                      {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
