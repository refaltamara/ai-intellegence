"use client";
/**
 * The agency dashboard's select (new-agency-dashboard/src/components/inputs/select-input.tsx, DESIGN.md 6.4):
 * a button that looks like the text input, its list in a portal on document.body so no overflow clips it,
 * flipped above the button when there is no room below, with an optional search. Unlike the original it
 * also works from the keyboard: arrows move, Enter picks, Escape closes and gives focus back.
 */
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { IconCheck, IconChevronDown, IconSearch } from "./icons";

/**
 * disabled: shown but not choosable (a level the person may not give), skipped by the arrows.
 * group: a heading over a run of options with the same group, as an <optgroup> had ("Months", "Weeks").
 */
export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };
type Size = "sm" | "md";

const TRIGGER: Record<Size, string> = {
  sm: "h-10 max-md:h-11 rounded-xl px-3 text-sm",
  md: "h-[52px] rounded-2xl px-4 text-sm",
};

/** "Indonesian beauty" → "IB": what the badge trigger shows of the chosen option */
function initials(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : s.slice(0, 2)
  ).toUpperCase();
}

/**
 * variant "badge": a square with the chosen option's initials, for a rail too narrow for the field
 * (the collapsed sidebar); its list opens beside it instead of below.
 */
export function SelectInput({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  withSearch,
  searchPlaceholder = "Search",
  placeholder = "Choose",
  size = "md",
  variant = "field",
  disabled,
  className,
}: {
  label?: string;
  /** the name when no label shows (a filter row, a table cell, inside a Field that names it already) */
  ariaLabel?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  withSearch?: boolean;
  searchPlaceholder?: string;
  placeholder?: string;
  size?: Size;
  variant?: "field" | "badge";
  disabled?: boolean;
  className?: string;
}) {
  const badge = variant === "badge";
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const shown =
    withSearch && query
      ? options.filter((o) =>
          o.label.toLowerCase().includes(query.toLowerCase()),
        )
      : options;

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const room = 300;
    if (badge) {
      // beside the badge, its top level with the badge's, or its bottom when the window is short below
      const up = window.innerHeight - r.top < room && r.bottom > room;
      setPos({
        top: up ? undefined : r.top,
        bottom: up ? window.innerHeight - r.bottom : undefined,
        left: r.right + 12,
        width: 260,
      });
      return;
    }
    const flip = window.innerHeight - r.bottom < room && r.top > room;
    setPos({
      top: flip ? undefined : r.bottom + 8,
      bottom: flip ? window.innerHeight - r.top + 8 : undefined,
      left: r.left,
      width: Math.max(r.width, 200),
    });
  }
  function close(refocus = true) {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }
  function pick(v: string) {
    if (options.find((o) => o.value === v)?.disabled) return;
    close();
    if (v !== value) onChange(v);
  }
  /** the next choosable row from i in direction d, or i itself when there is none */
  function step(i: number, d: 1 | -1) {
    for (let j = i + d; j >= 0 && j < shown.length; j += d) if (!shown[j].disabled) return j;
    return i;
  }
  const firstOn = () => Math.max(0, shown.findIndex((o) => !o.disabled));
  const lastOn = () => { for (let j = shown.length - 1; j >= 0; j--) if (!shown[j].disabled) return j; return 0; };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const at = shown.findIndex((o) => o.value === value);
    setCursor(at >= 0 ? at : firstOn());
    (withSearch ? searchRef.current : listRef.current)?.focus();
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t))
        close(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
    // shown and value are read once, when the list opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, withSearch]);

  // keep the highlighted row in view while the arrows move it
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-opt-${cursor}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [cursor, open, id]);

  function keys(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => step(c, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => step(c, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(firstOn());
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(lastOn());
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[cursor]) pick(shown[cursor].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") close(false);
  }

  const active = shown[cursor] ? `${id}-opt-${cursor}` : undefined;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        badge ? "w-fit" : "w-full",
        className,
      )}
    >
      {label && !badge && (
        <label htmlFor={id} className="text-xs text-gray-500">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={
          badge
            ? `${label ?? ariaLabel ?? "Choose"}: ${selected?.label ?? placeholder}`
            : !label && ariaLabel
              ? `${ariaLabel}: ${selected?.label ?? placeholder}`
              : undefined
        }
        title={badge ? undefined : selected?.label}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (
            !open &&
            (e.key === "ArrowDown" ||
              e.key === "ArrowUp" ||
              (badge && e.key === "ArrowRight"))
          ) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex cursor-pointer items-center border bg-white font-sans text-gray-900 outline-none transition-all duration-200 ease-in-out",
          "focus-visible:border-brand-palette-600 focus-visible:ring-2 focus-visible:ring-brand-palette-500/15",
          open
            ? "border-brand-palette-600 ring-2 ring-brand-palette-500/15"
            : "border-slate-200 hover:border-gray-300",
          "disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
          badge
            ? "h-10 w-10 justify-center rounded-xl text-xs font-bold tracking-wide text-gray-800"
            : cn("w-full justify-between gap-2 text-left", TRIGGER[size]),
        )}
      >
        {badge ? (
          <span aria-hidden="true">
            {selected ? initials(selected.label) : "?"}
          </span>
        ) : (
          <>
            <span
              className={cn("min-w-0 truncate", !selected && "text-gray-500")}
            >
              {selected?.label ?? placeholder}
            </span>
            <IconChevronDown
              size={16}
              className={cn(
                "text-gray-500 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            data-dropdown-portal
            style={{
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
            }}
            className={cn(
              "fixed z-60 overflow-hidden rounded-xl border border-gray-100 bg-white font-sans shadow-xl",
              pos.bottom !== undefined ? "origin-bottom" : "origin-top",
            )}
          >
            {/* the badge shows no label of its own, so the list says what it is choosing */}
            {badge && label && (
              <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
                {label}
              </p>
            )}
            {withSearch && (
              <div className="border-b border-gray-100 bg-gray-50/60 p-2">
                <div className="relative">
                  <IconSearch
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    ref={searchRef}
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={active}
                    aria-label={searchPlaceholder}
                    placeholder={searchPlaceholder}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setCursor(0);
                    }}
                    onKeyDown={keys}
                    className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 font-sans text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15"
                  />
                </div>
              </div>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={withSearch ? undefined : -1}
              aria-label={label ?? ariaLabel}
              aria-activedescendant={withSearch ? undefined : active}
              onKeyDown={withSearch ? undefined : keys}
              className="flex max-h-60 flex-col gap-0.5 overflow-y-auto p-1 outline-none"
            >
              {shown.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-500">
                  Nothing matches &ldquo;{query}&rdquo;
                </p>
              ) : (
                shown.map((o, i) => {
                  const on = o.value === value;
                  const heading = o.group && (i === 0 || shown[i - 1].group !== o.group);
                  return (
                    <Fragment key={`${o.group ?? ""}:${o.value}`}>
                      {heading && (
                        <div role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold text-gray-500">{o.group}</div>
                      )}
                      <div
                        id={`${id}-opt-${i}`}
                        role="option"
                        aria-selected={on}
                        aria-disabled={o.disabled || undefined}
                        aria-label={o.group ? `${o.label}, ${o.group}` : undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(o.value)}
                        onMouseMove={() => { if (!o.disabled) setCursor(i); }}
                        className={cn(
                          "flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                          o.disabled
                            ? "cursor-not-allowed text-gray-500"
                            : on
                              ? "cursor-pointer bg-brand-palette-50 font-semibold text-brand-palette-700"
                              : "cursor-pointer text-gray-700",
                          i === cursor && !on && !o.disabled && "bg-gray-100",
                          i === cursor && on && "ring-1 ring-brand-palette-300",
                        )}
                      >
                        <span className="min-w-0 truncate">{o.label}</span>
                        {on && <IconCheck size={14} />}
                      </div>
                    </Fragment>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
