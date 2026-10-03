'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface ViewerAnchor {
  page: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  kind: 'PIN' | 'RECT';
}

export interface ViewerMark {
  id: string;
  label: string;
  anchor: ViewerAnchor;
  tone: 'open' | 'responded' | 'closed' | 'note';
  active?: boolean;
}

/** pdf.js assets are copied to /public/pdfjs by scripts/copy-pdf-worker.mjs (same origin, no CDN). */
const PDFJS = '/pdfjs';

async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  // legacy build: polyfills newer JS features not yet in every supported browser
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  return pdfjs.getDocument({
    url,
    withCredentials: false,
    // fonts that are not embedded (e.g. Helvetica) and CJK CMaps
    standardFontDataUrl: `${PDFJS}/standard_fonts/`,
    cMapUrl: `${PDFJS}/cmaps/`,
    cMapPacked: true,
  }).promise;
}

const TONE: Record<ViewerMark['tone'], string> = {
  open: 'bg-danger-fg text-white border-danger-fg',
  responded: 'bg-warning-fg text-white border-warning-fg',
  closed: 'bg-success-fg text-white border-success-fg',
  note: 'bg-info-fg text-white border-info-fg',
};

/**
 * PdfViewer (docs/07-web-ui.md §3): pdf.js page rendering, thumbnails, zoom/fit and our own
 * comment layer with coordinates normalised 0..1 from the top-left of each page.
 * In add mode a click drops a PIN and a drag draws a RECT.
 */
export function PdfViewer({
  url,
  page,
  onPageChange,
  marks,
  addMode,
  onAdd,
  onSelect,
}: {
  url: string;
  page: number;
  onPageChange: (p: number) => void;
  marks: ViewerMark[];
  addMode: boolean;
  onAdd: (a: ViewerAnchor) => void;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('documents');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    loadPdf(url)
      .then((d) => {
        doc = d;
        if (!cancelled) setPdf(d);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      void doc?.loadingTask.destroy();
    };
  }, [url]);

  // render the current page at "fit width × zoom"
  useEffect(() => {
    if (!pdf || !canvasRef.current || !wrapRef.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const p = await pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages));
      if (cancelled || !canvasRef.current || !wrapRef.current) return;
      const base = p.getViewport({ scale: 1 });
      const fit = (wrapRef.current.clientWidth - 32) / base.width;
      const viewport = p.getViewport({ scale: Math.max(0.2, fit * zoom) });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      task = p.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);

  const point = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
    };
  }, []);

  if (error) return <p className="p-6 text-sm text-danger-fg">{t('pdfLoadFailed')}</p>;
  const pages = pdf?.numPages ?? 0;
  const onPage = marks.filter((m) => m.anchor.page === page);

  return (
    <div className="flex h-full min-h-0">
      <Thumbnails pdf={pdf} page={page} onPageChange={onPageChange} marks={marks} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-sm">
          <span data-testid="pdf-page">{t('pageOf', { page, pages })}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            aria-label="-"
          >
            <Minus />
          </Button>
          <button
            type="button"
            className="w-14 text-center tabular-nums"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            aria-label="+"
          >
            <Plus />
          </Button>
          {addMode ? (
            <span className="ml-auto text-xs text-info-fg">{t('addModeHint')}</span>
          ) : null}
        </div>
        <div ref={wrapRef} className="min-h-0 flex-1 overflow-auto bg-subtle p-4">
          {!pdf ? <Skeleton className="mx-auto h-[70vh] w-full max-w-3xl" /> : null}
          <div className="relative mx-auto w-fit shadow-md" data-testid="pdf-page-canvas">
            <canvas ref={canvasRef} className="block bg-white" />
            {size ? (
              <div
                className={cn('absolute inset-0', addMode && 'cursor-crosshair')}
                data-testid="pdf-layer"
                onMouseDown={(e) => {
                  if (!addMode) return;
                  const p = point(e);
                  setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                }}
                onMouseMove={(e) => {
                  if (!drag) return;
                  const p = point(e);
                  setDrag({ ...drag, x1: p.x, y1: p.y });
                }}
                onMouseUp={() => {
                  if (!drag) return;
                  const w = Math.abs(drag.x1 - drag.x0);
                  const h = Math.abs(drag.y1 - drag.y0);
                  setDrag(null);
                  if (w * size.w < 8 && h * size.h < 8) {
                    onAdd({ kind: 'PIN', page, x: drag.x0, y: drag.y0 });
                  } else {
                    onAdd({
                      kind: 'RECT',
                      page,
                      x: Math.min(drag.x0, drag.x1),
                      y: Math.min(drag.y0, drag.y1),
                      w,
                      h,
                    });
                  }
                }}
              >
                {onPage.map((m) =>
                  m.anchor.kind === 'RECT' ? (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        'absolute rounded-sm border-2 bg-transparent',
                        m.tone === 'open' && 'border-danger-fg',
                        m.tone === 'responded' && 'border-warning-fg',
                        m.tone === 'closed' && 'border-success-fg',
                        m.tone === 'note' && 'border-info-fg',
                        m.active && 'ring-2 ring-primary ring-offset-1',
                      )}
                      style={{
                        left: `${m.anchor.x * 100}%`,
                        top: `${m.anchor.y * 100}%`,
                        width: `${(m.anchor.w ?? 0) * 100}%`,
                        height: `${(m.anchor.h ?? 0) * 100}%`,
                      }}
                      data-testid={`mark-${m.label}`}
                    >
                      <span
                        className={cn(
                          'absolute -top-3 -left-3 flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
                          TONE[m.tone],
                        )}
                      >
                        {m.label}
                      </span>
                    </button>
                  ) : (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        'absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-xs font-semibold shadow',
                        TONE[m.tone],
                        m.active && 'ring-2 ring-primary ring-offset-1',
                      )}
                      style={{ left: `${m.anchor.x * 100}%`, top: `${m.anchor.y * 100}%` }}
                      data-testid={`mark-${m.label}`}
                    >
                      {m.label}
                    </button>
                  ),
                )}
                {drag ? (
                  <div
                    className="absolute border-2 border-dashed border-primary bg-primary/10"
                    style={{
                      left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                      top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                      width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                      height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumbnails({
  pdf,
  page,
  onPageChange,
  marks,
}: {
  pdf: PDFDocumentProxy | null;
  page: number;
  onPageChange: (p: number) => void;
  marks: ViewerMark[];
}) {
  if (!pdf) return <div className="w-28 border-r border-border bg-surface" />;
  const pages = Array.from({ length: Math.min(pdf.numPages, 200) }, (_, i) => i + 1);
  return (
    <div className="w-28 shrink-0 overflow-y-auto border-r border-border bg-surface p-2">
      {pages.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPageChange(n)}
          className={cn(
            'relative mb-2 block w-full rounded border p-1 text-center text-xs',
            n === page ? 'border-primary' : 'border-border hover:border-muted',
          )}
          data-testid={`thumb-${n}`}
        >
          <Thumb pdf={pdf} n={n} />
          <span>{n}</span>
          {marks.some((m) => m.anchor.page === n && m.tone === 'open') ? (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-danger-fg" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Thumb({ pdf, n }: { pdf: PDFDocumentProxy; n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const p = await pdf.getPage(n);
      if (cancelled || !ref.current) return;
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: 88 / base.width });
      ref.current.width = viewport.width;
      ref.current.height = viewport.height;
      task = p.render({ canvas: ref.current, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, n]);
  return <canvas ref={ref} className="mx-auto block w-full bg-white" />;
}
