import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./pdf.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfViewProps {
  url: string;
  /** 1 = 폭 맞춤. 단계 50~300% 는 호스트가 정한다. */
  zoom: number;
  label: string;
  slides?: boolean;
  onPages?: (total: number) => void;
  onPage?: (current: number) => void;
}

/** docs/19 §4: 페이지마다 article.tk-page 안에 캔버스 + 텍스트 레이어. 화면 밖 페이지는 data-pending 으로 자리만 둔다. */
export default function PdfView({ url, zoom, label, slides, onPages, onPage }: PdfViewProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({ url });
    task.promise
      .then(async (d) => {
        if (cancelled) return;
        // 첫 페이지 비율을 모든 자리에 먼저 쓰고, 실제 비율은 렌더 때 맞춘다(스크롤이 튀지 않게).
        const first = await d.getPage(1);
        const v = first.getViewport({ scale: 1 });
        setRatios(Array.from({ length: d.numPages }, () => v.width / v.height));
        setDoc(d);
        onPages?.(d.numPages);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
    // onPages 는 호출용 콜백이라 의존성에서 뺀다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (error) {
    return (
      <div className="tk-viewer__state" data-state="failed" role="status">
        <p className="tk-viewer__state-title">PDF 를 열지 못했어요</p>
        <p><code>{error}</code></p>
      </div>
    );
  }
  if (!doc) return <div className="tk-desk" aria-busy="true"><article className={`tk-page ${slides ? "tk-page--slide" : "tk-page--a4"}`} data-pending /></div>;

  return (
    <div className="tk-desk" style={{ "--tk-zoom": zoom } as React.CSSProperties}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={i} doc={doc} index={i + 1} ratio={ratios[i] ?? 210 / 297} zoom={zoom} label={`${label} ${i + 1}쪽`} onVisible={onPage} />
      ))}
    </div>
  );
}

function PdfPage({ doc, index, ratio, zoom, label, onVisible }: { doc: PDFDocumentProxy; index: number; ratio: number; zoom: number; label: string; onVisible?: (n: number) => void }) {
  const box = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  // 마지막으로 그린 배율. 배율이 바뀌거나 화면 밖으로 나가면 다시 빈 종이가 된다.
  const [doneZoom, setDoneZoom] = useState<number | null>(null);
  const rendered = near && doneZoom === zoom;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const near = new IntersectionObserver((es) => setNear(es.some((e) => e.isIntersecting)), { rootMargin: "800px 0px" });
    const center = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && onVisible?.(index), { rootMargin: "-45% 0px -45% 0px" });
    near.observe(el);
    center.observe(el);
    return () => {
      near.disconnect();
      center.disconnect();
    };
  }, [index, onVisible]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    (async () => {
      const page = await doc.getPage(index);
      const el = box.current;
      const cv = canvas.current;
      const tl = text.current;
      if (cancelled || !el || !cv || !tl) return;
      const cssWidth = el.clientWidth || 600;
      const base = page.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * dpr });
      cv.width = Math.floor(viewport.width);
      cv.height = Math.floor(viewport.height);
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const r = page.render({ canvas: cv, canvasContext: ctx, viewport });
      task = r;
      await r.promise;
      if (cancelled) return;
      tl.replaceChildren();
      tl.style.setProperty("--total-scale-factor", String(scale));
      tl.style.setProperty("--scale-factor", String(scale));
      const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: tl, viewport: page.getViewport({ scale }) });
      textLayer = layer;
      await layer.render();
      if (!cancelled) setDoneZoom(zoom);
    })().catch((e: unknown) => {
      // 취소된 렌더는 정상 경로다. 그 밖의 오류는 빈 종이로 남긴다.
      if (!(e instanceof Error && e.name === "RenderingCancelledException")) console.error(e);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, index, near, zoom]);

  return (
    <article ref={box} className="tk-page" aria-label={label} data-pending={!rendered || undefined} style={{ aspectRatio: String(ratio) }}>
      <canvas ref={canvas} style={rendered ? undefined : { display: "none" }} />
      <div ref={text} className="tk-pdf-text" />
    </article>
  );
}
