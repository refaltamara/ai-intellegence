"use client";
/**
 * A view that lives in the URL (filters, sort, pages) is drawn again on the server for every change, which can take
 * a few seconds. These keep the click answered meanwhile (DESIGN.md 6.1, `NavPending`): the control moves at once, the numbers
 * below dim until the new ones arrive, and a link shows it is on its way.
 */
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { cn } from "../cn";
import { Spinner } from "./Spinner";

type Nav = {
  pending: boolean;
  go: (href: string, opts?: { scroll?: boolean; before?: () => void }) => void;
  /** a full load is on its way (switching team): the page is covered by its skeleton until the new one arrives */
  leaving: boolean;
  setLeaving: (on: boolean) => void;
};

const Ctx = createContext<Nav>({ pending: false, go: (href) => window.location.assign(href), leaving: false, setLeaving: () => {} });

/** One transition for the whole signed-in frame (sidebar and page), so a filter row and the area it changes share the same wait. */
export function NavPendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const go: Nav["go"] = (href, opts) => start(() => {
    opts?.before?.();
    router.push(href, { scroll: opts?.scroll ?? true });
  });
  return <Ctx.Provider value={{ pending, go, leaving, setLeaving }}>{children}</Ctx.Provider>;
}

export const useNavPending = () => useContext(Ctx);

/** Over the page while a full load is on its way (the sidebar's team switch); `cover` is the next page's skeleton. */
export function LeavingCover({ cover }: { cover: ReactNode }) {
  const { leaving } = useNavPending();
  return leaving ? <div className="absolute inset-0 z-10 overflow-hidden bg-gray-50">{cover}</div> : null;
}

/** The part of a page a URL change replaces; it dims and ignores clicks while the new view loads. */
export function PendingArea({ children, className }: { children: ReactNode; className?: string }) {
  const { pending } = useNavPending();
  return (
    <div aria-busy={pending || undefined} className={cn("flex flex-col gap-6 transition-opacity duration-150", pending && "pointer-events-none opacity-60 delay-150", className)}>
      {children}
    </div>
  );
}

/**
 * A link to another view of the same page (sort, next page, a period). A plain click goes through the shared
 * transition so PendingArea dims; a modified click (new tab) stays a normal link.
 */
export function PendingLink({ href, scroll, onClick, before, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string; before?: () => void }) {
  const { go } = useNavPending();
  return (
    <Link href={href} scroll={scroll} {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href, { scroll: scroll ?? true, before });
      }} />
  );
}

/** Inside a <Link>: a small spinner while that link's page is on its way (sidebar rows, recent chats). */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className={cn("h-3.5 w-3.5", className)} /> : null;
}
