"use client";
/**
 * A dialog over the page (DESIGN.md 6.2): Escape and the backdrop close it, focus goes to its first control
 * and stays inside while it is open, and returns to whatever opened it. ConfirmDialog and PromptDialog
 * replace the browser's confirm() and prompt() so a question looks like the rest of the product.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { Button } from "./Button";
import { TextField } from "./Form";

const FOCUSABLE =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    // the field or the safest button first: a text input when there is one, else the first control
    const first =
      box.current?.querySelector<HTMLElement>("input, textarea") ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !box.current) return;
      const all = Array.from(
        box.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) {
        e.preventDefault();
        all[all.length - 1].focus();
      } else if (!e.shiftKey && at === all.length - 1) {
        e.preventDefault();
        all[0].focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      back?.focus?.();
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-tw
      className="fixed inset-0 z-999 grid place-items-center bg-black/40 p-4 font-sans backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "flex w-full max-w-100 flex-col gap-4 rounded-3xl bg-white p-6 text-[#1C1C1C] shadow-2xl sm:p-8",
          className,
        )}
      >
        <h2
          id={titleId}
          className="text-xl font-semibold leading-tight text-gray-900"
        >
          {title}
        </h2>
        {children && (
          <div className="text-sm leading-relaxed text-gray-600">
            {children}
          </div>
        )}
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 pt-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** "Are you sure?": the confirm label says what happens; danger turns it red */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            isLoading={busy}
            className={
              danger
                ? "bg-red-600 hover:bg-red-700 disabled:hover:bg-red-600"
                : undefined
            }
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}

/** one line of text, such as a name; Save stays off while it is empty unless the answer is `optional` (a note, "empty for none") */
export function PromptDialog({
  open,
  title,
  body,
  label,
  initial = "",
  confirmLabel = "Save",
  maxLength = 80,
  optional,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  label: string;
  initial?: string;
  confirmLabel?: string;
  maxLength?: number;
  optional?: boolean;
  busy?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const ok = optional || value.trim().length > 0;
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!ok}
            isLoading={busy}
            onClick={() => onSubmit(value.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {body && <p>{body}</p>}
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-gray-700">
          {label}
          <TextField
            value={value}
            maxLength={maxLength}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ok && !busy) {
                e.preventDefault();
                onSubmit(value.trim());
              }
            }}
          />
        </label>
      </div>
    </Modal>
  );
}
