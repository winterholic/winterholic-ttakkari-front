import { useEffect, useMemo } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getSession, listArtifacts, listSessions } from "../api/client";
import type { ArtifactOut } from "../api/types";
import { ArtifactViewerHost } from "../features/viewer/ArtifactViewerHost";
import { FollowupComposer } from "../features/viewer/FollowupComposer";
import { useIsDesktop } from "../features/viewer/hooks";
import { PREVIEW_POLL_MS } from "../features/viewer/kinds";
import { ArtifactRowContent, EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { useArtifactViewer } from "../features/viewer/useArtifactViewer";
import { PageHeader } from "../shell/PageHeader";

const PANEL_ID = "workspace-viewer-panel";

export function WorkspacePage() {
  const { sessionId } = useParams();
  if (!sessionId) return <LatestSessionRedirect />;
  return <SessionWorkspace sessionId={sessionId} />;
}

/** /workspace 는 세션이 없다. 가장 최근 세션으로 안내하고, 세션이 하나도 없으면 채팅으로 보낸다. */
function LatestSessionRedirect() {
  const q = useQuery({ queryKey: ["sessions", "latest"], queryFn: () => listSessions({ limit: 1 }) });
  if (q.isSuccess && q.data[0]) return <Navigate to={`/workspace/${q.data[0].id}`} replace />;
  return (
    <div className="tk-screen">
      <PageHeader title="작업 공간" />
      <div className="tk-screen__body">
        {q.isLoading && <ListSkeleton rows={3} label="최근 세션을 찾는 중" />}
        {q.isError && <ErrorState error={q.error} what="세션" onRetry={() => void q.refetch()} />}
        {q.isSuccess && (
          <EmptyState icon="workspace" title="아직 세션이 없어요" actions={<Link className="tk-button tk-button--primary" to="/chat">채팅 시작하기</Link>}>
            채팅에서 작업을 시키면 그 세션의 결과물이 여기에 모여요.
          </EmptyState>
        )}
      </div>
    </div>
  );
}

function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const { current } = useArtifactViewer();
  const desktop = useIsDesktop();
  const [, setParams] = useSearchParams();

  const session = useQuery({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
  const arts = useQuery({
    queryKey: ["artifacts", { session: sessionId }],
    queryFn: () => listArtifacts({ session_id: sessionId, limit: 100 }),
    // 변환 중인 발표·문서가 있으면 상태가 바뀌는 걸 따라간다.
    refetchInterval: (query) => (query.state.data?.some((a) => a.preview_status === "pending" || a.preview_status === "processing") ? PREVIEW_POLL_MS : false),
  });
  const items = useMemo(() => arts.data ?? [], [arts.data]);

  // 데스크톱은 오른쪽 패널이 비어 보이지 않게 첫 결과물을 연다. 기록을 쌓지 않으려고 replace.
  useEffect(() => {
    if (desktop && !current && items.length > 0) {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("artifact", items[0].id);
        return next;
      }, { replace: true });
    }
  }, [desktop, current, items, setParams]);

  const [ready, noPreview] = useMemo(() => {
    const r: ArtifactOut[] = [];
    const n: ArtifactOut[] = [];
    for (const a of items) (a.preview_status === "failed" || a.preview_status === "unavailable" || a.kind === "other" || a.export_policy !== "allow" ? n : r).push(a);
    return [r, n];
  }, [items]);

  const title = session.data?.title;
  return (
    <div className="tk-screen">
      <PageHeader title="작업 공간" meta={title ? `${title}${arts.isSuccess ? ` · 결과물 ${items.length}` : ""}` : undefined} />
      <ArtifactViewerHost
        alwaysOpen
        panel={current ? { id: PANEL_ID, labelledBy: `tab-${current}` } : undefined}
        followup={current ? <FollowupComposer sessionId={sessionId} artifactId={current} /> : undefined}
        resolveInitial={(id) => items.find((a) => a.id === id)}
        placeholder={items.length === 0 ? <p>결과물이 생기면 여기에서 바로 열려요.</p> : undefined}
      >
        <div className="tk-screen__body">
          {arts.isLoading && <ListSkeleton label="결과물을 불러오는 중" />}
          {arts.isError && <ErrorState error={arts.error} what="결과물" onRetry={() => void arts.refetch()} />}
          {arts.isSuccess && items.length === 0 && (
            <EmptyState icon="workspace" title="이 세션에는 아직 결과물이 없어요" actions={<Link className="tk-button" to={`/chat/${sessionId}`}>채팅으로 가기</Link>}>
              에이전트가 파일을 만들면 여기에 나타나요.
            </EmptyState>
          )}
          {arts.isSuccess && items.length > 0 && (
            <ArtifactTabs groups={[{ label: "방금 · 이 세션", items: ready }, { label: "미리보기 없음", items: noPreview }]} />
          )}
        </div>
      </ArtifactViewerHost>
    </div>
  );
}

/** 목록 = role=tablist(세로), 행 = role=tab. 화살표로 결과물을 옮겨 다닌다(docs/14 §3). */
function ArtifactTabs({ groups }: { groups: { label: string; items: ArtifactOut[] }[] }) {
  const { current, open } = useArtifactViewer();
  const flat = groups.flatMap((g) => g.items);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = Math.max(0, flat.findIndex((a) => a.id === current));
    const next = e.key === "Home" ? 0 : e.key === "End" ? flat.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length;
    open(flat[next].id);
    requestAnimationFrame(() => document.getElementById(`tab-${flat[next].id}`)?.focus());
  };
  return (
    <div className="tk-list" role="tablist" aria-orientation="vertical" aria-label="결과물" onKeyDown={onKeyDown}>
      {groups.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.label} role="presentation">
          <p className="tk-list__group">{g.label}</p>
          {g.items.map((a) => (
            <button
              key={a.id}
              id={`tab-${a.id}`}
              className="tk-list__item tk-artifact"
              type="button"
              role="tab"
              aria-selected={current === a.id}
              aria-controls={PANEL_ID}
              tabIndex={current === a.id || (!current && a.id === flat[0].id) ? 0 : -1}
              onClick={() => open(a.id)}
            >
              <ArtifactRowContent a={a} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
