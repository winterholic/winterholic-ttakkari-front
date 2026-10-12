import { useEffect, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getSession, listArtifacts, listSessions } from "../api/client";
import type { ArtifactOut } from "../api/types";
import { ArtifactViewerHost } from "../features/viewer/ArtifactViewerHost";
import { FollowupComposer } from "../features/viewer/FollowupComposer";
import { useIsDesktop } from "../features/viewer/hooks";
import { PREVIEW_POLL_MS, formatWhen } from "../features/viewer/kinds";
import { ArtifactRowContent, EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { useArtifactViewer } from "../features/viewer/useArtifactViewer";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "./workspace.css";

const PANEL_ID = "workspace-viewer-panel";

export function WorkspacePage() {
  const { sessionId } = useParams();
  if (!sessionId) return <WorkspaceOverview />;
  return <SessionWorkspace sessionId={sessionId} />;
}

/** 결과물 목록을 한 번에 받는 최대치(백엔드 상한 200). 이보다 오래된 결과물만 있는 세션은 개요에서 빠진다. */
const OVERVIEW_LIMIT = 200;

interface SessionGroup {
  id: string;
  title: string;
  count: number;
  latest: string;
}

/**
 * /workspace 는 특정 세션이 아니라 개요다. 결과물이 있는 세션을 최근 결과물 순으로 늘어놓고, 고르면 그 세션의 작업 공간으로 간다.
 * 예전에는 가장 최근 세션으로 바로 보냈는데, 그 세션에 결과물이 없으면 무엇을 하는 화면인지 알 수 없는 빈 화면만 보였다.
 */
function WorkspaceOverview() {
  const arts = useQuery({ queryKey: ["artifacts", { overview: true }], queryFn: () => listArtifacts({ limit: OVERVIEW_LIMIT }) });
  const sessions = useQuery({
    queryKey: ["sessions", "workspace-overview"],
    queryFn: () => listSessions({ limit: OVERVIEW_LIMIT, include_archived: true }),
  });
  const groups = useMemo(() => {
    const titles = new Map((sessions.data ?? []).map((x) => [x.id, x.title]));
    const byId = new Map<string, SessionGroup>();
    // 목록은 최신순이라 처음 만난 결과물의 시각이 그 세션의 마지막 결과물 시각이다.
    for (const a of arts.data ?? []) {
      if (!a.session_id) continue;
      const g = byId.get(a.session_id);
      if (g) g.count += 1;
      else byId.set(a.session_id, { id: a.session_id, title: titles.get(a.session_id) || "제목 없는 세션", count: 1, latest: a.created_at });
    }
    return [...byId.values()];
  }, [arts.data, sessions.data]);

  return (
    <div className="tk-screen">
      <PageHeader title="작업 공간" meta={groups.length > 0 ? `결과물이 있는 세션 ${groups.length}` : undefined} />
      <div className="tk-screen__body">
        <p className="workspace-intro">에이전트가 만든 파일을 세션별로 모아 봐요. 세션을 열면 결과물을 보면서 이어서 지시할 수 있어요.</p>
        {arts.isLoading && <ListSkeleton rows={3} label="결과물이 있는 세션을 찾는 중" />}
        {arts.isError && <ErrorState error={arts.error} what="결과물" onRetry={() => void arts.refetch()} />}
        {arts.isSuccess && groups.length === 0 && (
          <EmptyState icon="workspace" title="아직 결과물이 없어요" actions={<Link className="tk-button tk-button--primary" to="/chat">채팅 시작하기</Link>}>
            채팅에서 문서·표·이미지 같은 파일을 만들어 달라고 하면 그 세션의 결과물이 여기에 모여요.
          </EmptyState>
        )}
        {arts.isSuccess && groups.length > 0 && (
          <nav className="tk-list" aria-label="결과물이 있는 세션">
            {groups.map((g) => (
              <Link key={g.id} className="tk-list__item" to={`/workspace/${g.id}`}>
                <span className="tk-glyph" data-type="doc"><Icon name="chat" /></span>
                <span className="tk-list__body">
                  <span className="tk-list__title">{g.title}</span>
                  <span className="tk-list__meta">
                    <span>결과물 {g.count}</span>
                    <span>{formatWhen(g.latest)}</span>
                  </span>
                </span>
                <span className="tk-list__end"><Icon name="chevron-right" /></span>
              </Link>
            ))}
          </nav>
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
          <div className="workspace-intro workspace-intro--session">
            <span>이 세션에서 만든 결과물이에요. 눌러서 보고 이어서 지시할 수 있어요.</span>
            <span className="workspace-intro__links">
              <Link to="/workspace">다른 세션</Link>
              <Link to={`/chat/${sessionId}`}>대화 보기</Link>
            </span>
          </div>
          {arts.isLoading && <ListSkeleton label="결과물을 불러오는 중" />}
          {arts.isError && <ErrorState error={arts.error} what="결과물" onRetry={() => void arts.refetch()} />}
          {arts.isSuccess && items.length === 0 && (
            <EmptyState
              icon="workspace"
              title="이 세션에는 아직 결과물이 없어요"
              actions={
                <>
                  <Link className="tk-button tk-button--primary" to={`/chat/${sessionId}`}>대화로 가기</Link>
                  <Link className="tk-button" to="/workspace">다른 세션 보기</Link>
                </>
              }
            >
              대화에서 파일을 만들어 달라고 하면 여기에 나타나요.
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
