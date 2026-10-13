import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { listMeetings } from "../api/client";
import type { MeetingSummary } from "../api/client";
import { SCOPE_OPTIONS, StatusBadge, meetingWhen, scopeLabel } from "../features/meetings/shared";
import { ClovaBar, ClovaJobs, ClovaNotesView, useClovaStatus } from "../features/meetings/clova";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import "../features/meetings/meetings.css";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function counts(m: MeetingSummary): string {
  const c = m.counts;
  const parts = [c.decision && `결정 ${c.decision}`, c.action && `액션 ${c.action}`, c.open_issue && `미해결 ${c.open_issue}`].filter(Boolean);
  return parts.join(" · ");
}

/**
 * 회의록(ADR 0010·0021). 녹음은 클로바노트로 전사하고, 결정·액션을 뽑아 두고, 맥락 도서관 반영은 사용자가 승인한다.
 * 위에는 클로바노트 연결 상태와 처리 중인 작업, 아래는 회의록 목록 또는 클로바노트 노트(?view=clova). 범위는 ?scope=.
 */
export function MeetingsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "clova" ? "clova" : "meetings";
  const clova = useClovaStatus();
  const unimported = clova.data?.state === "ready" ? clova.data.unimported : 0;
  const setView = (v: "meetings" | "clova") =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === "clova") next.set("view", "clova");
      else next.delete("view");
      return next;
    }, { replace: true });

  return (
    <div className="tk-screen">
      <PageHeader
        title="회의록"
        actions={
          <Link className="tk-button tk-button--primary tk-button--sm" to="/meetings/new">
            <Icon name="plus" />새 회의록
          </Link>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--md">
          <div className="mt-page">
            <ClovaBar />
            <ClovaJobs />
            <div className="tk-segmented tk-segmented--block mt-tabs" role="radiogroup" aria-label="보기">
              <label><input type="radio" name="mt-view" checked={view === "meetings"} onChange={() => setView("meetings")} />회의록</label>
              <label>
                <input type="radio" name="mt-view" checked={view === "clova"} onChange={() => setView("clova")} />클로바노트
                {unimported > 0 && <span className="mt-tabs__count" data-alert aria-label={`안 가져온 노트 ${unimported}개`}>{unimported}</span>}
              </label>
            </div>
            {view === "clova" ? <ClovaNotesView /> : <MeetingList />}
          </div>
        </div>
      </div>
    </div>
  );
}

function MeetingList() {
  const [params, setParams] = useSearchParams();
  const scope = SCOPE_OPTIONS.find((s) => s.value === params.get("scope"))?.value;
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ["meetings", "list", scope ?? "all", search],
    queryFn: () => listMeetings({ scope, q: search }),
    placeholderData: (prev) => prev,
    // 분석·전사가 진행 중인 건이 있으면 상태가 바뀌는 걸 따라간다.
    refetchInterval: (query) => (query.state.data?.meetings.some((m) => m.status === "analyzing" || m.status === "transcribing") ? 3000 : false),
  });
  const meetings = list.data?.meetings ?? [];
  const setScope = (v: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set("scope", v);
      else next.delete("scope");
      return next;
    }, { replace: true });

  return (
    <>
      <div className="mt-toolbar">
        <div className="tk-segmented" role="radiogroup" aria-label="범위">
          <label><input type="radio" name="mt-scope" checked={!scope} onChange={() => setScope(null)} />전체</label>
          {SCOPE_OPTIONS.map((s) => (
            <label key={s.value}><input type="radio" name="mt-scope" checked={scope === s.value} onChange={() => setScope(s.value)} />{s.label}</label>
          ))}
        </div>
        <span className="tk-input-wrap mt-toolbar__search">
          <Icon name="search" />
          <input className="tk-input tk-input--sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목·요약·결정 찾기" aria-label="회의록 찾기" />
        </span>
      </div>
      {list.isPending && <ListSkeleton rows={4} label="회의록을 불러오는 중" />}
      {list.isError && <ErrorState error={list.error} what="회의록" onRetry={() => void list.refetch()} />}
      {list.isSuccess && meetings.length === 0 && (
        <EmptyState
          icon="memo"
          title={search ? "찾는 회의록이 없어요" : "아직 회의록이 없어요"}
          actions={!search && <Link className="tk-button tk-button--primary" to="/meetings/new"><Icon name="plus" />새 회의록</Link>}
        >
          {search ? "다른 단어로 찾아 보세요." : "녹음을 올리면 클로바노트로 전사해 결정과 할 일을 정리해 줘요. 클로바노트에 이미 있는 녹음은 '클로바노트' 탭에서 가져와요."}
        </EmptyState>
      )}
      {meetings.length > 0 && (
        <ul className="tk-list tk-list--inset" aria-label="회의록 목록">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link className="tk-list__item mt-row" to={`/meetings/${m.id}`}>
                <span className="tk-list__body">
                  <span className="tk-list__title tk-list__title--wrap">{m.title}</span>
                  <span className="tk-list__meta">
                    <StatusBadge status={m.status} />
                    <span>{meetingWhen(m)}</span>
                    <span>{scopeLabel(m.scope)}</span>
                    {m.project && <span>{m.project.name}</span>}
                  </span>
                  {m.summary && <span className="tk-list__snippet">{m.summary}</span>}
                  {(counts(m) || m.counts.pending_proposals > 0) && (
                    <span className="tk-list__meta">
                      {counts(m) && <span>{counts(m)}</span>}
                      {m.counts.pending_proposals > 0 && <span className="mt-pending">승인 대기 {m.counts.pending_proposals}</span>}
                    </span>
                  )}
                </span>
                <span className="tk-list__end"><Icon name="chevron-right" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
