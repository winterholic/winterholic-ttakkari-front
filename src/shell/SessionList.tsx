import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listSessions } from "../api/client";
import type { SessionOut } from "../api/types";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { groupSessions, hasRunning, sessionStatus, sessionTime } from "./groupSessions";

const RUNNING_POLL_MS = 5_000;

/** 세션 목록 쿼리. 실행 중인 세션이 있으면 5초마다 다시 읽는다. 사이드바·드로어가 같은 키를 공유한다. */
export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: () => listSessions(),
    refetchInterval: (q) => (hasRunning(q.state.data) ? RUNNING_POLL_MS : false),
  });
}

function SessionRow({ session, active, now }: { session: SessionOut; active: boolean; now: Date }) {
  const st = sessionStatus(session);
  return (
    <Link className="tk-session" to={`/chat/${session.id}`} aria-current={active ? "page" : undefined}>
      <span className="tk-session__title">{session.title || "제목 없는 세션"}</span>
      <span className="tk-session__time">{sessionTime(session.updated_at, now)}</span>
      <span className="tk-session__meta">
        {st.running && <span className="tk-dot tk-dot--live" aria-hidden="true" />}
        {st.label}
      </span>
    </Link>
  );
}

export function SessionList({ currentId }: { currentId?: string }) {
  const q = useSessions();
  const now = new Date();

  if (q.isPending) {
    return (
      <div className="tk-sidebar__group" aria-busy="true" aria-label="세션 목록을 불러오는 중">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="tk-skeleton tk-skeleton--text" />
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="tk-sidebar__group">
        <p className="tk-status tk-status--danger" role="status">
          <Icon name="circle-x" />
          세션 목록을 못 불러왔어요
        </p>
        <Button size="sm" onClick={() => void q.refetch()}>
          <Icon name="retry" />
          다시 시도
        </Button>
      </div>
    );
  }
  const groups = groupSessions(q.data, now);
  if (groups.length === 0) {
    return (
      <div className="tk-empty">
        <p className="tk-empty__title">아직 세션이 없어요</p>
        <p className="tk-body-sm tk-text-tertiary">새 세션에서 할 일을 지시해 보세요.</p>
      </div>
    );
  }
  return (
    <>
      {groups.map((g) => (
        <div className="tk-sidebar__group" key={g.key}>
          <p className="tk-sidebar__label">{g.label}</p>
          {g.sessions.map((s) => (
            <SessionRow key={s.id} session={s} active={s.id === currentId} now={now} />
          ))}
        </div>
      ))}
    </>
  );
}
