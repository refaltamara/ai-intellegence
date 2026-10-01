"use client";
/**
 * Weekly Reports (DECISIONS, 2 Oct 2026): the actual slides of a weekly deck, drawn from its PDF in the
 * browser (pdf.js), a week switcher, downloads, a Present mode, and "Ask AI" beside the slide. Ask AI
 * sends only which report and slide; the server reads the slide and the report's facts. Decks show
 * their versions in the same viewer, with their own title, address and actions.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { WeeklyItem } from "@/reports/weekly";
import { SlideAsk } from "./SlideAsk";

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

function Thumb({ doc, n, on, title, onClick }: { doc: PdfDoc | null; n: number; on: boolean; title: string; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (doc && ref.current) void draw(doc, n, ref.current, 132);
  }, [doc, n]);
  useEffect(() => {
    if (on) btn.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [on]);
  return (
    <button ref={btn} className={`wk-thumb ${on ? "on" : ""}`} onClick={onClick} title={`${n}. ${title}`} aria-label={`Slide ${n}: ${title}`}>
      <canvas ref={ref} />
      <span>{n}</span>
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
};

export function WeeklyViewer({ items, initialId, initialSlide, title = "Weekly Reports", subtitle, path = "/weekly", param = "r", actions, onPick }: ViewerProps) {
  const [id, setId] = useState(initialId);
  const [n, setN] = useState(initialSlide);
  const [loaded, setLoaded] = useState<{ file: string; doc: PdfDoc } | null>(null);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [askOpen, setAskOpen] = useState(true);
  const item = items.find((i) => i.id === id) ?? items[items.length - 1];
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

  return (
    <section className="screen weekly">
      <div className="topbar">
        <div><h1>{title}</h1><span className="meta">{subtitle ?? `${item.deck} · ${item.client} · the actual slides, with Ask AI on each one`}</span></div>
        <div className="wk-actions">
          {actions}
          {item.pdf && <a className="btn sm" href={`/api/reports/files/${item.pdf}`}>Download PDF</a>}
          {item.pptx && <a className="btn sm" href={`/api/reports/files/${item.pptx}`}>PowerPoint</a>}
          <button className="btn pri sm" onClick={present}>{presenting ? "Exit presenting" : "Present"}</button>
        </div>
      </div>
      <div className="wk-weeks" role="tablist" aria-label="Week">
        {clients.map((c) => (
          <div key={c} className="wk-client">
            {clients.length > 1 && <b>{c}</b>}
            {items.filter((i) => i.client === c).map((i) => (
              <button key={i.id} role="tab" aria-selected={i.id === id} className={i.id === id ? "on" : ""} onClick={() => pickWeek(i.id)}>
                {i.iso.includes("W") && <span>{i.iso.slice(5)}</span>}{i.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div ref={shellRef} className={`wk-shell ${presenting ? "presenting" : ""} ${askOpen ? "asking" : ""}`}>
        <div className="wk-main">
          <div className="wk-stage" ref={stageRef} style={{ height: width ? Math.round((width * 9) / 16) : undefined }}>
            {error ? <div className="errbox">{error}</div> : <canvas ref={canvasRef} className={`wk-slide ${doc ? "" : "loading"}`} onClick={(e) => { const r = (e.target as HTMLElement).getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? n + 1 : n - 1); }} />}
            {!doc && !error && <div className="wk-loading">Opening the slides…</div>}
          </div>
          <div className="wk-nav">
            <button className="btn sm ghost" onClick={() => go(n - 1)} disabled={n <= 1} aria-label="Previous slide">‹</button>
            <span className="wk-count"><b>{n}</b> / {total} · {slideTitle}</span>
            <button className="btn sm ghost" onClick={() => go(n + 1)} disabled={n >= total} aria-label="Next slide">›</button>
            {!askOpen && <button className="btn sm wk-askbtn" onClick={() => setAskOpen(true)}>Ask AI about this slide</button>}
          </div>
          {!presenting && (
            <div className="wk-thumbs">
              {Array.from({ length: total }, (_, i) => i + 1).map((k) => (
                <Thumb key={`${item.id}-${k}`} doc={doc} n={k} on={k === n} title={item.slides.find((s) => s.n === k)?.title ?? ""} onClick={() => go(k)} />
              ))}
            </div>
          )}
        </div>
        {askOpen && <SlideAsk key={item.id} reportId={item.id} n={n} slideTitle={slideTitle} week={item.label} onClose={() => setAskOpen(false)} />}
      </div>
    </section>
  );
}
