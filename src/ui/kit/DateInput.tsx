"use client";
/**
 * The agency dashboard's date field (new-agency-dashboard/src/components/inputs/date-input.tsx, DESIGN.md 6.1):
 * type DD/MM/YYYY, or open a month calendar from the icon. The parent hears a value only once it is a real date
 * inside the bounds; leaving the field with half a date clears it. Unlike the original, the bounds are
 * YYYY-MM-DD strings (compared as text, nothing mutated) and the calendar works from the keyboard: arrows move a
 * day or a week, Enter picks, Escape closes and gives focus back to the field.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "./icons";

type Size = "sm" | "md";

const FIELD: Record<Size, string> = {
  sm: "h-10 max-md:h-11 rounded-xl pl-3 pr-10 text-sm",
  md: "h-13 rounded-2xl pl-4 pr-11 text-sm",
};
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];
const addDays = (s: string, n: number) => { const [y, m, d] = parts(s); return iso(y, m - 1, d + n); };
/** DDMMYYYY → YYYY-MM-DD */
const fromDigits = (n: string) => `${n.slice(4, 8)}-${n.slice(2, 4)}-${n.slice(0, 2)}`;
/** 31/02 rolls over to March in Date, so a real date is one that survives the round trip */
const real = (s: string) => { const [y, m, d] = parts(s); return iso(y, m - 1, d) === s; };
const display = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };
const longDate = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function DateInput({
  value,
  onChange,
  min,
  max,
  label,
  ariaLabel,
  placeholder = "DD/MM/YYYY",
  size = "sm",
  disabled,
  error,
  className,
}: {
  /** YYYY-MM-DD, or "" for none */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  label?: string;
  /** the name when no label shows (a table row, a filter row, a legacy field with its own caption) */
  ariaLabel?: string;
  placeholder?: string;
  size?: Size;
  disabled?: boolean;
  error?: string;
  className?: string;
}) {
  const id = useId();
  const out = (s: string) => (!!min && s < min) || (!!max && s > max);
  const [text, setText] = useState(() => display(value));
  const [last, setLast] = useState(value);
  // a new value from the parent replaces what the field shows
  if (value !== last) { setLast(value); setText(display(value)); }

  const [open, setOpen] = useState(false);
  // the day the keyboard is on; its month is the month on show
  const [cursor, setCursor] = useState(() => value || todayIso());
  const [view, setView] = useState(() => (value || todayIso()).slice(0, 7));
  const [moveIn, setMoveIn] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  function emit(v: string) { if (v !== value) onChange(v); }

  function openCalendar(focusInside: boolean) {
    if (disabled) return;
    let start = value && !out(value) ? value : todayIso();
    if (out(start)) start = min && start < min ? min : max ?? start;
    setCursor(start);
    setView(start.slice(0, 7));
    setMoveIn(focusInside);
    setOpen(true);
  }
  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) field.current?.focus();
  }
  function pick(s: string) {
    if (out(s)) return;
    emit(s);
    setText(display(s));
    close(true);
  }

  // typing: digits only, masked to DD/MM/YYYY; a full real date inside the bounds goes to the parent
  function typed(raw: string) {
    const n = raw.replace(/\D/g, "").slice(0, 8);
    if (n.length >= 2) { const d = Number(n.slice(0, 2)); if (d > 31 || d === 0) return; }
    if (n.length >= 4) { const m = Number(n.slice(2, 4)); if (m > 12 || m === 0) return; }
    setText(n.length >= 5 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length >= 3 ? `${n.slice(0, 2)}/${n.slice(2)}` : n);
    if (n.length === 8) {
      const s = fromDigits(n);
      if (real(s) && !out(s)) { emit(s); setCursor(s); setView(s.slice(0, 7)); }
    } else if (n.length === 0) emit("");
  }
  // leaving the field: half a date, an impossible one or one outside the bounds clears it
  function left() {
    const n = text.replace(/\D/g, "");
    const s = n.length === 8 ? fromDigits(n) : "";
    if (!s || !real(s) || out(s)) { setText(""); emit(""); }
    else emit(s);
  }

  function place() {
    const r = wrap.current?.querySelector("input")?.getBoundingClientRect();
    if (!r) return;
    const tall = 340;
    const up = window.innerHeight - r.bottom < tall && r.top > tall;
    setPos({ top: up ? undefined : r.bottom + 8, bottom: up ? window.innerHeight - r.top + 8 : undefined, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
  }
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !panel.current?.contains(t)) close(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  // the keyboard's day takes focus once the calendar was opened from the icon or the arrows
  useEffect(() => {
    if (open && moveIn) panel.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
  }, [open, moveIn, cursor, view]);

  function dayKeys(e: React.KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      const next = addDays(cursor, step);
      // a disabled day cannot hold focus, so the arrows stop at the bounds
      if (out(next)) return;
      setMoveIn(true);
      setCursor(next);
      setView(next.slice(0, 7));
    } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab" && !e.shiftKey) close(false);
  }
  const shiftMonth = (n: number) => {
    const [y, m] = view.split("-").map(Number);
    const first = iso(y, m - 1 + n, 1);
    setView(first.slice(0, 7));
    // the keyboard lands on the month's first day it may pick, or stays put when it may pick none
    const lastDay = iso(y, m + n, 0);
    const pickable = !out(first) ? first : min && min > first && min <= lastDay ? min : max && max >= first && max <= lastDay ? max : null;
    if (pickable) setCursor(pickable);
  };

  const [vy, vm] = view.split("-").map(Number);
  const lead = new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(vy, vm - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayIso();
  const navBtn = "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-brand-palette-50 hover:text-brand-palette-700 focus-visible:outline-2 focus-visible:outline-brand-palette-600 max-md:h-11 max-md:w-11";

  return (
    <div ref={wrap} className={cn("flex w-full flex-col gap-1.5 font-sans", className)}>
      {label && <label htmlFor={id} className="text-sm text-gray-900">{label}</label>}
      <div className="relative">
        <input
          ref={field}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          maxLength={10}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={!!error || undefined}
          onChange={(e) => typed(e.target.value)}
          onBlur={left}
          onClick={() => { if (!open) openCalendar(false); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); openCalendar(true); }
            if (e.key === "Escape" && open) { e.preventDefault(); close(false); }
          }}
          className={cn(
            "w-full border font-sans tabular-nums text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-500",
            FIELD[size],
            disabled ? "cursor-not-allowed border-slate-200 bg-gray-100 text-gray-500"
              : error ? "border-red-500 bg-red-50/30 focus:ring-2 focus:ring-red-500/15"
                : "border-slate-200 bg-white focus:border-brand-palette-600 focus:ring-2 focus:ring-brand-palette-500/15",
          )}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Choose a date${label || ariaLabel ? ` for ${label ?? ariaLabel}` : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close(true) : openCalendar(true))}
          className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-brand-palette-600 transition-colors hover:bg-brand-palette-50 hover:text-brand-palette-700 focus-visible:outline-2 focus-visible:outline-brand-palette-600 disabled:cursor-not-allowed disabled:text-gray-500"
        >
          <IconCalendar size={size === "sm" ? 16 : 20} />
        </button>
      </div>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      {open && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label={monthName}
          data-dropdown-portal
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left }}
          onMouseDown={(e) => e.preventDefault()}
          className={cn("fixed z-60 w-72 rounded-2xl border border-gray-100 bg-white p-4 font-sans shadow-xl", pos.bottom !== undefined ? "origin-bottom" : "origin-top")}
        >
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className={navBtn} onClick={() => shiftMonth(-1)} aria-label="Previous month"><IconChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-900" aria-live="polite">{monthName}</span>
            <button type="button" className={navBtn} onClick={() => shiftMonth(1)} aria-label="Next month"><IconChevronRight size={16} /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAYS.map((d) => <span key={d} className="text-center text-xs font-semibold text-gray-500">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" onKeyDown={dayKeys}>
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const s = iso(vy, vm - 1, i + 1);
              const on = s === value;
              const off = out(s);
              return (
                <button
                  key={s}
                  type="button"
                  data-day={s}
                  tabIndex={s === cursor ? 0 : -1}
                  disabled={off}
                  aria-label={longDate(s)}
                  aria-pressed={on}
                  aria-current={s === today ? "date" : undefined}
                  onClick={() => pick(s)}
                  onFocus={() => setCursor(s)}
                  className={cn(
                    "mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-xs tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-palette-600",
                    on ? "cursor-pointer bg-primary font-semibold text-white"
                      // a day outside the bounds is a disabled control, so it may sit below the text contrast floor
                      : off ? "cursor-not-allowed text-gray-400"
                        : cn("cursor-pointer text-gray-700 hover:bg-brand-palette-50 hover:text-brand-palette-700", s === today && "font-semibold text-brand-palette-700 ring-1 ring-brand-palette-200"),
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
