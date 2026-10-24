"use client";
/**
 * Weekly Reports (DECISIONS, 2 Oct 2026): the actual slides of a weekly deck, drawn from its PDF in the
 * browser (pdf.js), a week switcher, downloads, a Present mode, and "Ask AI" beside the slide. Ask AI
 * sends only which report and slide; the server reads the slide and the report's facts. Decks show
 * their versions in the same viewer, with their own title, address and actions.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { WeeklyItem } from "@/reports/weekly";
import type { SlideComment } from "@/decks/comments";
import { SlideComments } from "../decks/SlideComments";
import { SlideAsk } from "./SlideAsk";
import { sendSignal } from "../signal";
import { cn } from "../cn";
import { Button, buttonClass } from "../kit/Button";
import { IconChevronLeft, IconChevronRight, IconDownload } from "../kit/icons";
import { PageHeader } from "../kit/PageHeader";
import { Spinner } from "../kit/Spinner";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void } };

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

const docs = new Map<string, Promise<PdfDoc>>();
function loadDoc(fileId: string): Promise<PdfDoc> {
  if (!docs.has(fileId)) docs.set(fileId, pdfjs().then((m) => m.getDocument({ url: `/api/reports/files/${fileId}` }).promise as unknown as Promise<PdfDoc>));
  return docs.get(fileId)!;
}

/** Draw one page into a canvas at a CSS width, sharp on high-density screens. */
async function draw(doc: PdfDoc, n: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<{ cancel: () => void } | null> {
  if (n < 1 || n > doc.numPages) return null;
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (cssWidth * dpr) / base.width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(cssWidth * base.height) / base.width}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const task = page.render({ canvasContext: ctx, viewport });
  await task.promise.catch(() => undefined);
  return task;
}

function Thumb({ doc, n, on, title, onClick, pins = 0 }: { doc: PdfDoc | null; n: number; on: boolean; title: string; onClick: () => void; pins?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (doc && ref.current) void draw(doc, n, ref.current, 132);
  }, [doc, n]);
  useEffect(() => {
    if (on) btn.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [on]);
  return (
    <button ref={btn} type="button" onClick={onClick} title={`${n}. ${title}`} aria-label={`Slide ${n}: ${title}`} aria-current={on ? "true" : undefined}
      className={cn("relative shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 bg-white p-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600", on ? "border-brand-palette-600" : "border-card-border hover:border-brand-palette-300")}>
      <canvas ref={ref} className="block h-18.5 w-33" />
      <span className="absolute bottom-1 left-1 rounded-md bg-white/90 px-1.5 text-[10px] font-bold tabular-nums text-gray-700">{n}</span>
      {pins > 0 && <i title={`${pins} comment${pins === 1 ? "" : "s"}`} className="absolute right-1 top-1 min-w-5 rounded-full bg-brand-palette-100 px-1.5 py-0.5 text-center text-[11px] font-semibold not-italic text-brand-palette-800">{pins}</i>}
    </button>
  );
}

type ViewerProps = {
  items: WeeklyItem[];
  initialId: string;
  initialSlide: number;
  /** the page's heading and line under it; Weekly Reports by default */
  title?: string;
  subtitle?: string;
  /** where the address points: `${path}?${param}=<report>&s=<slide>` */
  path?: string;
  param?: string;
  /** buttons before the downloads */
  actions?: ReactNode;
  /** told which version is on screen */
  onPick?: (id: string) => void;
  /** a deck's versions take comments on each slide (src/decks/comments.ts) */
  comments?: { deckId: string };
  /** a line under the header: a version being made, or why the last run failed */
  banner?: ReactNode;
};

export function WeeklyViewer({ items, initialId, initialSlide, title = "Weekly Reports", subtitle, path = "/weekly", param = "r", actions, onPick, comments, banner }: ViewerProps) {
  const [id, setId] = useState(initialId);
  const [n, setN] = useState(initialSlide);
  useEffect(() => { sendSignal("deck.version_opened", { report: id }); }, [id]);
  const [loaded, setLoaded] = useState<{ file: string; doc: PdfDoc } | null>(null);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [askOpen, setAskOpen] = useState(true);
  const [tab, setTab] = useState<"ask" | "comments">("ask");
  const [notes, setNotes] = useState<SlideComment[]>([]);
  const item = items.find((i) => i.id === id) ?? items[items.length - 1];
  const commentDeck = comments?.deckId;
  useEffect(() => {
    if (!commentDeck) return;
    let live = true;
    setNotes([]);
    void fetch(`/api/decks/${commentDeck}/comments?report=${item.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j?.comments) setNotes(j.comments); });
    return () => { live = false; };
  }, [commentDeck, item.id]);
  // a document belongs to one file: while the next week's PDF opens, nothing draws from the last one
  const doc = loaded && loaded.file === item.pdf ? loaded.doc : null;
  const total = item.slides.length || doc?.numPages || 1;
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // the URL follows the week and the slide, so a link opens the same place
  useEffect(() => {
    window.history.replaceState(null, "", `${path}?${param}=${id}&s=${n}`);
  }, [id, n, path, param]);
  useEffect(() => { onPick?.(id); }, [id, onPick]);

  useEffect(() => {
    let live = true;
    setError("");
    const file = item.pdf;
    if (!file) { setError("This report has no PDF."); return; }
    loadDoc(file).then((d) => { if (live) setLoaded({ file, doc: d }); }).catch((e) => { if (live) setError(`Could not open the slides: ${(e as Error).message}`); });
    return () => { live = false; };
  }, [item.pdf]);

  // the slide is as wide as the column allows while the deck stays on one screen (16:9)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const room = window.innerHeight - (presenting ? 90 : 300);
      setWidth(Math.max(320, Math.floor(Math.min(el.getBoundingClientRect().width, (room * 16) / 9))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [presenting, askOpen]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !width) return;
    let task: { cancel: () => void } | null = null;
    let live = true;
    void draw(doc, Math.min(n, doc.numPages), canvasRef.current, width).then((t) => { if (live) task = t; else t?.cancel(); });
    return () => { live = false; task?.cancel(); };
  }, [doc, n, width]);

  const go = useCallback((to: number) => setN(Math.max(1, Math.min(total, to))), [total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && presenting)) { e.preventDefault(); go(n + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(n - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, go, presenting]);

  useEffect(() => {
    const onFs = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const present = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shellRef.current?.requestFullscreen?.().catch(() => setPresenting((p) => !p));
  };

  const pickWeek = (next: string) => { setId(next); setN(1); };
  const slideTitle = item.slides.find((s) => s.n === n)?.title ?? `Slide ${n}`;
  const clients = [...new Set(items.map((i) => i.client))];

  const here = notes.filter((c) => c.slide === n).length;
  const navBtn = cn("inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600 disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 max-md:w-11",
    presenting ? "text-gray-100 hover:bg-white/10" : "text-gray-700 hover:bg-gray-100");
  const tabBtn = (on: boolean) => cn("relative inline-flex h-12 cursor-pointer items-center gap-1.5 px-4 font-sans text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-palette-600", on ? "text-gray-900" : "text-gray-500 hover:text-gray-900");

  return (
    <section data-tw className="flex min-h-full flex-col px-4 pb-6 md:px-6">
      <PageHeader
        title={title}
        subtitle={subtitle ?? `${item.deck} · ${item.client} · the actual slides, with Ask AI on each one`}
        actions={<>
          {actions}
          {item.pdf && <a className={buttonClass("outline", "sm")} href={`/api/reports/files/${item.pdf}`}><IconDownload size={16} />Download PDF</a>}
          {item.pptx && <a className={buttonClass("outline", "sm")} href={`/api/reports/files/${item.pptx}`}><IconDownload size={16} />PowerPoint</a>}
          <Button size="sm" onClick={present}>{presenting ? "Exit presenting" : "Present"}</Button>
        </>}
      />
      {banner && <div className="pt-4">{banner}</div>}
      <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pt-4 md:mx-0 md:flex-wrap md:px-0" role="tablist" aria-label="Week">
        {clients.map((c) => (
          <div key={c} className="flex shrink-0 items-center gap-1.5 md:flex-wrap">
            {clients.length > 1 && <b className="mr-1 text-xs font-semibold text-gray-500">{c}</b>}
            {items.filter((i) => i.client === c).map((i) => {
              const on = i.id === id;
              return (
                <button key={i.id} type="button" role="tab" aria-selected={on} onClick={() => pickWeek(i.id)}
                  className={cn("inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 font-sans text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600 max-md:min-h-11",
                    on ? "border-brand-palette-300 bg-brand-palette-50 text-brand-palette-700" : "border-slate-200 bg-white text-gray-700 hover:border-brand-palette-300 hover:text-brand-palette-700")}>
                  {i.iso.includes("W") && <span className={cn("text-[11px] font-bold", on ? "text-brand-palette-700" : "text-gray-500")}>{i.iso.slice(5)}</span>}{i.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {/* presenting: the full-screen shell goes dark so the slide is the only bright thing in the room (DESIGN.md 6.4) */}
      <div ref={shellRef} className={cn("grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 pt-4", askOpen && "min-[1101px]:grid-cols-[minmax(0,1fr)_380px]", presenting && "box-border h-dvh bg-gray-900 p-4")}>
        <div className={cn("flex min-h-0 min-w-0 flex-col", presenting && "justify-center")}>
          <div ref={stageRef} className="relative flex min-h-45 flex-none items-center justify-center" style={{ height: width ? Math.round((width * 9) / 16) : undefined }}>
            {error ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : (
              <canvas ref={canvasRef} onClick={(e) => { const r = (e.target as HTMLElement).getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? n + 1 : n - 1); }}
                className={cn("block cursor-pointer rounded-lg border border-card-border bg-white", !doc && "opacity-0")} />
            )}
            {!doc && !error && (
              <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
                <span aria-hidden="true" className="absolute inset-0 animate-pulse rounded-lg bg-gray-200" />
                <span className="relative flex items-center gap-2 text-sm text-gray-600"><Spinner />Opening the slides…</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pb-1.5 pt-2.5">
            <button type="button" className={navBtn} onClick={() => go(n - 1)} disabled={n <= 1} aria-label="Previous slide"><IconChevronLeft size={18} /></button>
            <span className={cn("min-w-0 max-w-[60ch] truncate text-sm tabular-nums", presenting ? "text-gray-300" : "text-gray-600")} title={`${n} / ${total} · ${slideTitle}`}>
              <b className={cn("font-semibold", presenting ? "text-white" : "text-gray-900")}>{n}</b> / {total} · {slideTitle}
            </span>
            <button type="button" className={navBtn} onClick={() => go(n + 1)} disabled={n >= total} aria-label="Next slide"><IconChevronRight size={18} /></button>
            {!askOpen && <Button size="sm" variant="outline" className="ml-2" onClick={() => setAskOpen(true)}>Ask AI about this slide</Button>}
          </div>
          {!presenting && (
            <div className="flex gap-2 overflow-x-auto px-0.5 pb-1 pt-1.5">
              {Array.from({ length: total }, (_, i) => i + 1).map((k) => (
                <Thumb key={`${item.id}-${k}`} doc={doc} n={k} on={k === n} title={item.slides.find((s) => s.n === k)?.title ?? ""} onClick={() => go(k)} pins={notes.filter((c) => c.slide === k && c.author === "person").length} />
              ))}
            </div>
          )}
        </div>
        {askOpen && (
          <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-card-border bg-white min-[1101px]:sticky min-[1101px]:top-4", presenting ? "max-h-[calc(100dvh-2rem)]" : "min-[1101px]:max-h-[calc(100dvh-9rem)]")}>
            {comments && (
              <div className="flex shrink-0 border-0 border-b border-card-border" role="tablist" aria-label="Beside the slide">
                <button type="button" role="tab" aria-selected={tab === "ask"} className={tabBtn(tab === "ask")} onClick={() => setTab("ask")}>
                  Ask AI{tab === "ask" && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-palette-600" />}
                </button>
                <button type="button" role="tab" aria-selected={tab === "comments"} className={tabBtn(tab === "comments")} onClick={() => setTab("comments")}>
                  Comments{here > 0 && <span className="min-w-5 rounded-full bg-brand-palette-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-palette-800">{here}</span>}
                  {tab === "comments" && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-palette-600" />}
                </button>
              </div>
            )}
            {!comments || tab === "ask"
              ? <SlideAsk key={item.id} reportId={item.id} n={n} slideTitle={slideTitle} week={item.label} onClose={() => setAskOpen(false)} />
              : <SlideComments deckId={comments.deckId} reportId={item.id} n={n} slideTitle={slideTitle} comments={notes} onPosted={(c) => setNotes((x) => [...x, ...c])} />}
          </div>
        )}
      </div>
    </section>
  );
}
