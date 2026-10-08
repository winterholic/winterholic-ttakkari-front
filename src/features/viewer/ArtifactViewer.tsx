import { lazy, Suspense, useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contentBlob, downloadLink, getArtifact, retryPreview } from "../../api/client";
import type { ArtifactOut, UUID } from "../../api/types";
import { Icon, KIND_GLYPH } from "../../ui/Icon";
import { errorText, inlineViewLink } from "./api";
import { clearHits, markHits, setCurrentHit } from "./findInDom";
import { useBlobText, useBlobUrl } from "./hooks";
import { ModalDialog } from "./ModalDialog";
import { downloadState, extOf, formatSize, PREVIEW_POLL_MS, resolveViewMode, shouldPollPreview, stepZoom, toolsFor } from "./kinds";
import type { ViewMode } from "./kinds";
import { MarkdownView } from "./renderers/MarkdownView";
import { ErrorBody, LoadingBody, StatePanel } from "./renderers/StatePanel";

// 무거운 렌더러는 처음 열 때만 받는다(코드 분할).
const PdfView = lazy(() => import("./renderers/PdfView"));
const CodeView = lazy(() => import("./renderers/CodeView"));
const SheetView = lazy(() => import("./renderers/SheetView"));

export interface ArtifactViewerProps {
  artifactId: UUID;
  /** 목록에서 이미 가진 값이 있으면 넘기면 첫 화면이 바로 그려진다. */
  initial?: ArtifactOut;
  onClose: () => void;
  /** 뷰어 아래 후속 지시 컴포저(docs/09 §5). */
  followup?: ReactNode;
  /** 있으면 툴바 "더보기" 에 "삭제…" 가 생긴다. 확인 대화상자는 호출한 화면이 연다. */
  onDelete?: (a: ArtifactOut) => void;
  /** 작업 공간처럼 목록이 role=tablist 일 때 패널 연결. */
  panel?: { id: string; labelledBy: string };
}

export function ArtifactViewer(props: ArtifactViewerProps) {
  // id 가 바뀌면 배율·찾기 같은 지역 상태를 버리고 새로 시작한다.
  return <ViewerInner key={props.artifactId} {...props} />;
}

function ViewerInner({ artifactId, initial, onClose, followup, onDelete, panel }: ArtifactViewerProps) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => getArtifact(artifactId),
    initialData: initial,
    refetchInterval: (query) => (query.state.data && shouldPollPreview(query.state.data) ? PREVIEW_POLL_MS : false),
  });
  const a = q.data;

  const [zoomPct, setZoomPct] = useState(100);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [hitCount, setHitCount] = useState(0);
  const [hitIndex, setHitIndex] = useState(0);
  const [codeFind, setCodeFind] = useState(0);
  const [page, setPage] = useState({ current: 1, total: 0 });
  const onTotal = useCallback((total: number) => setPage((p) => ({ ...p, total })), []);
  const onCurrent = useCallback((current: number) => setPage((p) => ({ ...p, current })), []);
  const [dlError, setDlError] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const hits = useRef<HTMLElement[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  const retry = useMutation({
    mutationFn: () => retryPreview(artifactId),
    onSuccess: (next) => qc.setQueryData(["artifact", artifactId], next),
  });

  const download = async () => {
    setDlError(null);
    setDlBusy(true);
    try {
      const { url } = await downloadLink(artifactId, "original");
      const link = document.createElement("a");
      link.href = url;
      link.download = a?.filename ?? "";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      setDlError(errorText(e).message);
    } finally {
      setDlBusy(false);
    }
  };

  const mode: ViewMode | null = a ? resolveViewMode(a) : null;
  const tools = mode ? toolsFor(mode) : { zoom: false, find: false, pages: false };

  // markdown 찾기: DOM 을 직접 감싸는 일이라 effect 가 아니라 입력·열기·닫기 핸들러에서 실행한다.
  const applyFind = (query: string) => {
    const root = articleRef.current;
    if (!root) return;
    hits.current = markHits(root, query);
    setHitCount(hits.current.length);
    setHitIndex(0);
    setCurrentHit(hits.current, 0);
  };
  const closeFind = () => {
    setFindOpen(false);
    setHitCount(0);
    hits.current = [];
    if (articleRef.current) clearHits(articleRef.current);
  };
  const moveHit = (dir: 1 | -1) => {
    const n = hits.current.length;
    if (!n) return;
    const next = (hitIndex + dir + n) % n;
    setHitIndex(next);
    setCurrentHit(hits.current, next);
  };

  const openFind = () => {
    if (mode === "code") setCodeFind((n) => n + 1);
    else {
      setFindOpen(true);
      applyFind(findQuery);
    }
  };

  if (!a) {
    return (
      <section className="tk-viewer" aria-busy={q.isLoading}>
        <div className="tk-viewer__toolbar">
          <button className="tk-icon-button" type="button" aria-label="닫기" onClick={onClose}><Icon name="back" /></button>
        </div>
        <div className="tk-viewer__body">
          {q.error ? (
            <ErrorBody {...errorText(q.error)} offline={!navigator.onLine} onRetry={() => void q.refetch()} />
          ) : (
            <LoadingBody label="결과물을 불러오는 중" />
          )}
        </div>
      </section>
    );
  }

  const dl = downloadState(a);
  const g = KIND_GLYPH[a.kind] ?? KIND_GLYPH.other;
  const glyphIcon = a.kind === "html" ? "globe" : g.icon;
  const zoom = zoomPct / 100;
  const dlLabel = dl.enabled ? "원본 다운로드" : `원본 다운로드 (${dl.reason})`;

  const downloadButton = (primary: boolean) => (
    <button className={primary ? "tk-button tk-button--primary" : "tk-button"} type="button" aria-disabled={!dl.enabled || undefined} aria-busy={dlBusy || undefined} title={dl.reason ?? undefined} onClick={() => dl.enabled && !dlBusy && void download()}>
      <Icon name="download" />원본 다운로드
    </button>
  );
  const disabledNote = !dl.enabled && <p>{dl.reason}</p>;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && tools.find) {
      e.preventDefault();
      openFind();
    }
  };

  const fallbackBody = (m: ViewMode): ReactNode => {
    switch (m) {
      case "blocked":
        return (
          <StatePanel state="blocked" kind={a.kind} icon="lock" title="이 기기에서는 열 수 없어요" actions={downloadButton(false)}>
            <p>이 파일은 <strong>민감 자료</strong>로 분류돼 열람·다운로드가 막혀 있어요. 꼭 필요하면 Mac Studio 에서 직접 여세요.</p>
            <span className="tk-policy" data-policy="restricted"><Icon name="lock" />민감 · 반출 차단</span>
          </StatePanel>
        );
      case "preview-pending":
        return <StatePanel state="pending" kind={a.kind} title="미리보기를 기다리는 중이에요" spinner actions={downloadButton(true)}><p>변환 순서를 기다리고 있어요. 원본은 지금도 받을 수 있어요.</p>{disabledNote}</StatePanel>;
      case "preview-converting":
        return <StatePanel state="converting" kind={a.kind} title="미리보기를 만드는 중이에요" spinner actions={downloadButton(true)}><p>끝나면 이 화면이 저절로 바뀌어요.</p>{disabledNote}</StatePanel>;
      case "preview-failed":
      case "preview-unavailable": {
        const failed = m === "preview-failed";
        return (
          <StatePanel
            state={failed ? "failed" : "unsupported"}
            kind={a.kind}
            title={failed ? "미리보기를 만들지 못했어요" : "이 서버에서는 미리보기를 만들 수 없어요"}
            actions={<>
              <button className="tk-button" type="button" aria-busy={retry.isPending || undefined} onClick={() => !retry.isPending && retry.mutate()}><Icon name="retry" />다시 변환</button>
              {downloadButton(true)}
            </>}
          >
            <p>{failed ? "원본은 그대로 있어요." : "변환기를 쓸 수 없는 상태예요. 원본은 그대로 있어요."}{a.preview_error && <> <code>{a.preview_error}</code></>}</p>
            {retry.isError && <p className="tk-error" role="alert">{errorText(retry.error).message}</p>}
            {disabledNote}
          </StatePanel>
        );
      }
      default:
        return (
          <StatePanel state="blocked" kind={a.kind} icon="file-archive" title="미리보기를 지원하지 않는 형식이에요" actions={downloadButton(true)}>
            <p>{extOf(a.filename).toUpperCase() || a.mime_type} · {formatSize(a.size_bytes)}</p>
            {disabledNote}
          </StatePanel>
        );
    }
  };

  const contentBody = (): ReactNode => {
    switch (mode) {
      case "markdown":
        return <MarkdownBody id={a.id} articleRef={articleRef} />;
      case "code":
        return <Suspense fallback={<LoadingBody label="코드 뷰어를 여는 중" />}><CodeBody a={a} findSignal={codeFind} /></Suspense>;
      case "pdf":
        return <PdfBody a={a} variant="original" zoom={zoom} onTotal={onTotal} onCurrent={onCurrent} />;
      case "preview-pdf":
        return <PdfBody a={a} variant="preview" zoom={zoom} onTotal={onTotal} onCurrent={onCurrent} slides={a.kind === "pptx"} />;
      case "sheet":
        return <Suspense fallback={<LoadingBody label="표를 여는 중" />}><SheetBody a={a} onDownload={dl.enabled ? () => void download() : undefined} /></Suspense>;
      case "image":
        return <ImageBody a={a} zoom={zoom} />;
      case "html":
        return <HtmlBody a={a} />;
      default:
        return mode ? fallbackBody(mode) : null;
    }
  };

  const noScrollBody = mode === "sheet" || mode === "code";
  const label = mode === "markdown" ? "문서 본문" : mode === "pdf" || mode === "preview-pdf" ? "PDF 페이지" : mode === "image" ? "이미지" : "미리보기";

  return (
    <section
      className="tk-viewer"
      id={panel?.id}
      role={panel ? "tabpanel" : undefined}
      aria-labelledby={panel?.labelledBy}
      aria-label={panel ? undefined : a.filename}
      onKeyDown={onKeyDown}
    >
      <div className="tk-viewer__toolbar">
        <button className="tk-icon-button tk-hide-from-lg" type="button" aria-label="목록으로" onClick={onClose}><Icon name="back" /></button>
        <div className="tk-viewer__title">
          <span className="tk-glyph tk-glyph--sm" data-type={g.type}><Icon name={glyphIcon} /></span>
          <h2 className="tk-viewer__name" title={`${a.filename} · ${a.kind.toUpperCase()} · ${formatSize(a.size_bytes)}`}>{a.filename}</h2>
        </div>
        <div className="tk-viewer__tools">
          <span className="tk-viewer__value tk-viewer__wide" aria-label={`${a.kind} ${formatSize(a.size_bytes)}`}>{formatSize(a.size_bytes)}</span>
          {tools.find && <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="문서 안 찾기" title="찾기 (Ctrl/⌘+F)" onClick={openFind}><Icon name="search" /></button>}
          {tools.zoom && (
            <>
              <span className="tk-viewer__divider tk-viewer__wide" aria-hidden />
              <button className="tk-icon-button tk-icon-button--sm tk-viewer__wide" type="button" aria-label="축소" disabled={zoomPct <= 50} onClick={() => setZoomPct((z) => stepZoom(z, "out"))}><Icon name="zoom-out" /></button>
              <span className="tk-viewer__value tk-viewer__wide" aria-hidden>{zoomPct}%</span>
              <button className="tk-icon-button tk-icon-button--sm tk-viewer__wide" type="button" aria-label="확대" disabled={zoomPct >= 300} onClick={() => setZoomPct((z) => stepZoom(z, "in"))}><Icon name="zoom-in" /></button>
              <button className="tk-icon-button tk-icon-button--sm tk-viewer__wide" type="button" aria-label="폭에 맞추기" title="폭에 맞추기" onClick={() => setZoomPct(100)}><Icon name="fit" /></button>
            </>
          )}
          {tools.pages && page.total > 0 && (
            <>
              <span className="tk-viewer__divider tk-viewer__wide" aria-hidden />
              <span className="tk-viewer__value" aria-label={`${page.current}쪽, 전체 ${page.total}쪽`}>{page.current} / {page.total}</span>
            </>
          )}
          <button
            className="tk-icon-button tk-icon-button--sm"
            type="button"
            aria-label={dlLabel}
            aria-disabled={!dl.enabled || undefined}
            aria-busy={dlBusy || undefined}
            title={dl.reason ?? "원본 다운로드"}
            onClick={() => dl.enabled && !dlBusy && void download()}
          >
            <Icon name="download" />
          </button>
          {onDelete && <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="더보기" onClick={() => setMenuOpen(true)}><Icon name="more-vertical" /></button>}
          <button className="tk-icon-button tk-icon-button--sm tk-hide-below-lg" type="button" aria-label="닫기" title="닫기" onClick={onClose}><Icon name="x" /></button>
        </div>
      </div>

      {findOpen && tools.find && mode === "markdown" && (
        <div className="tk-findbar">
          <span className="tk-input-wrap">
            <Icon name="search" />
            <input
              className="tk-input tk-input--sm"
              type="search"
              autoFocus
              value={findQuery}
              placeholder="문서 안에서 찾기"
              aria-label="문서 안에서 찾기"
              onChange={(e) => { setFindQuery(e.target.value); applyFind(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  moveHit(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  closeFind();
                }
              }}
            />
          </span>
          <span className="tk-findbar__count" aria-live="polite">{findQuery ? (hitCount ? `${hitIndex + 1}/${hitCount}` : "0건") : ""}</span>
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="이전 결과" onClick={() => moveHit(-1)}><Icon name="chevron-up" /></button>
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="다음 결과" onClick={() => moveHit(1)}><Icon name="chevron-down" /></button>
          <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label="찾기 닫기" onClick={closeFind}><Icon name="x" /></button>
        </div>
      )}

      {mode === "preview-pdf" && (
        <div className="tk-viewer__notice">
          <Icon name="info" />
          <p>PDF로 변환한 미리보기예요. 글꼴·애니메이션은 원본과 다를 수 있어요. {dl.enabled ? <button className="tk-link" type="button" onClick={() => void download()}>원본 받기</button> : dl.reason}</p>
        </div>
      )}
      {dlError && (
        <div className="tk-viewer__notice tk-viewer__notice--warning" role="alert">
          <Icon name="warning" />
          <p>다운로드 링크를 받지 못했어요. {dlError} <button className="tk-link" type="button" onClick={() => void download()}>다시 받기</button></p>
        </div>
      )}

      {noScrollBody || mode === "html" ? (
        <div className="tk-viewer__body" ref={bodyRef} style={noScrollBody ? { overflow: "hidden" } : undefined}>{contentBody()}</div>
      ) : (
        <div className="tk-viewer__body" ref={bodyRef} tabIndex={0} role="region" aria-label={label}>{contentBody()}</div>
      )}

      {followup && <div className="tk-viewer__followup">{followup}</div>}

      {onDelete && (
        <ModalDialog open={menuOpen} onClose={() => setMenuOpen(false)} className="tk-sheet" labelledBy="av-actions-title">
          <div className="tk-dialog__header">
            <h2 className="tk-dialog__title" id="av-actions-title">{a.filename}</h2>
            <button className="tk-icon-button" type="button" aria-label="닫기" onClick={() => setMenuOpen(false)}><Icon name="x" /></button>
          </div>
          <ul className="tk-sheet__actions" role="list">
            <li>
              <button className="tk-menu__item" type="button" aria-disabled={!dl.enabled || undefined} onClick={() => { if (dl.enabled) { setMenuOpen(false); void download(); } }}>
                <Icon name="download" />원본 다운로드{!dl.enabled && <span className="tk-menu__meta">{dl.reason}</span>}
              </button>
            </li>
            <li>
              <button className="tk-menu__item tk-menu__item--danger" type="button" onClick={() => { setMenuOpen(false); onDelete(a); }}>
                <Icon name="trash" />삭제…
              </button>
            </li>
          </ul>
        </ModalDialog>
      )}
    </section>
  );
}

// ---- 본문 렌더러 연결 --------------------------------------------------------

function bodyError(e: unknown, refetch: () => unknown): ReactNode {
  if (!e) return null;
  return <ErrorBody {...errorText(e)} offline={!navigator.onLine} onRetry={() => void refetch()} />;
}

function MarkdownBody({ id, articleRef }: { id: UUID; articleRef: React.Ref<HTMLElement> }) {
  const t = useBlobText(id);
  const err = bodyError(t.error, t.refetch);
  if (err) return err;
  if (t.text === undefined) return <LoadingBody label="문서를 불러오는 중" />;
  return <MarkdownView text={t.text} articleRef={articleRef} />;
}

function CodeBody({ a, findSignal }: { a: ArtifactOut; findSignal: number }) {
  const t = useBlobText(a.id);
  const err = bodyError(t.error, t.refetch);
  if (err) return err;
  if (t.text === undefined) return <LoadingBody label="코드를 불러오는 중" />;
  return <CodeView text={t.text} filename={a.filename} findSignal={findSignal} />;
}

function PdfBody({ a, variant, zoom, slides, onTotal, onCurrent }: { a: ArtifactOut; variant: "original" | "preview"; zoom: number; slides?: boolean; onTotal: (n: number) => void; onCurrent: (n: number) => void }) {
  const b = useBlobUrl(a.id, variant);
  const err = bodyError(b.error, b.refetch);
  if (err) return err;
  if (!b.url) return <LoadingBody label="PDF 를 불러오는 중" />;
  return (
    <Suspense fallback={<LoadingBody label="PDF 뷰어를 여는 중" />}>
      <PdfView url={b.url} zoom={zoom} label={a.filename} slides={slides} onPages={onTotal} onPage={onCurrent} />
    </Suspense>
  );
}

function SheetBody({ a, onDownload }: { a: ArtifactOut; onDownload?: () => void }) {
  const q = useQuery({
    queryKey: ["artifact-buffer", a.id],
    queryFn: async () => (await contentBlob(a.id, "original")).arrayBuffer(),
    gcTime: 0,
    staleTime: Infinity,
  });
  const err = bodyError(q.error, q.refetch);
  if (err) return err;
  if (!q.data) return <LoadingBody label="표를 불러오는 중" />;
  return <SheetView buffer={q.data} filename={a.filename} onDownload={onDownload} />;
}

function ImageBody({ a, zoom }: { a: ArtifactOut; zoom: number }) {
  const b = useBlobUrl(a.id, "original");
  const err = bodyError(b.error, b.refetch);
  if (err) return err;
  if (!b.url) return <LoadingBody label="이미지를 불러오는 중" />;
  return (
    <div className="tk-stage" style={{ "--tk-zoom": zoom } as React.CSSProperties}>
      <img src={b.url} alt={a.filename} />
    </div>
  );
}

function HtmlBody({ a }: { a: ArtifactOut }) {
  // 서명 링크는 5분이라 4분 뒤에는 새로 받는다. 응답에는 CSP sandbox 가 붙고 출처는 API 도메인이라 앱과 격리된다.
  const q = useQuery({ queryKey: ["artifact-inline", a.id], queryFn: () => inlineViewLink(a.id), staleTime: 4 * 60_000, gcTime: 0 });
  const err = bodyError(q.error, q.refetch);
  const url = useMemo(() => q.data?.url, [q.data]);
  if (err) return err;
  if (!url) return <LoadingBody label="미리보기를 여는 중" />;
  return (
    <div className="tk-frame">
      <p className="tk-frame__bar"><Icon name="shield" />격리된 미리보기 · 스크립트·외부 요청 꺼짐</p>
      <iframe sandbox="" title={`${a.filename} 격리 미리보기`} src={url} referrerPolicy="no-referrer" />
    </div>
  );
}
