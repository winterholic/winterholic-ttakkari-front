import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { listSessions } from "../../api/client";
import type { RunStatus, SessionOut } from "../../api/types";
import { StateBadge } from "../chat/RunCard";
import { STATE_OF, STATUS_LABEL } from "../chat/runView";
import { Icon } from "../../ui/Icon";
import "./orchestrator.css";

const ACTIVE = ["queued", "running"];

export function workersKey(orchestratorId: string) {
  return ["workers", orchestratorId] as const;
}

/** 오케스트레이터의 작업 세션 목록. 실행 중이 있으면 자주, 없으면 가끔 다시 읽는다. */
export function useWorkers(orchestratorId: string) {
  return useQuery({
    enabled: orchestratorId !== "",
    queryKey: workersKey(orchestratorId),
    queryFn: () => listSessions({ parent_id: orchestratorId, limit: 100 }),
    refetchInterval: (q) => ((q.state.data ?? []).some((w) => w.last_run_status && ACTIVE.includes(w.last_run_status)) ? 3_000 : 15_000),
  });
}

function sortWorkers(list: SessionOut[]): SessionOut[] {
  const active = (w: SessionOut) => (w.last_run_status && ACTIVE.includes(w.last_run_status) ? 0 : 1);
  return [...list].sort((a, b) => active(a) - active(b) || b.updated_at.localeCompare(a.updated_at));
}

function when(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function engineLabel(w: SessionOut): string {
  const p = w.last_run_profile;
  if (p) return p;
  return w.engine === "codex" ? "Codex" : w.engine === "claude" ? "Claude Code" : "자동";
}

/**
 * 오케스트레이터 화면 오른쪽(모바일은 시트) 하위 세션 탭. 탭을 누르면 그 세션 상세(채팅 화면)로 간다.
 * 탭은 결과물이 아니라 세션 단위다(사용자 결정 10-11). 접수 아래는 기획 세션, 기획 아래는 작업 세션이다(ADR 0013).
 */
export function WorkerPanel({
  orchestratorId,
  currentId,
  inSheet,
  label = "작업 세션",
}: {
  orchestratorId: string;
  currentId?: string;
  inSheet?: boolean;
  label?: "작업 세션" | "기획 세션";
}) {
  const q = useWorkers(orchestratorId);
  const workers = sortWorkers(q.data ?? []);
  const running = workers.filter((w) => w.last_run_status && ACTIVE.includes(w.last_run_status)).length;
  return (
    <div className="worker-panel">
      <div className="worker-panel__head">
        {/* 시트는 다이얼로그 제목이 같은 말을 한다 */}
        {inSheet ? <span /> : <h2 className="worker-panel__title">{label}</h2>}
        {workers.length > 0 && (
          <span className="worker-panel__count">
            {running > 0 ? `${running}개 실행 중 · ` : ""}
            {workers.length}개
          </span>
        )}
      </div>
      {q.isPending && <p className="worker-panel__note">불러오는 중</p>}
      {q.isError && (
        <p className="worker-panel__note">
          {label}을 불러오지 못했어요.{" "}
          <button className="tk-button tk-button--xs" type="button" onClick={() => void q.refetch()}>
            다시 시도
          </button>
        </p>
      )}
      {q.isSuccess && workers.length === 0 && (
        <p className="worker-panel__note">
          {label === "기획 세션"
            ? "생각하거나 손이 가는 일을 맡기면 여기에 기획 세션이 하나씩 생겨요. 기획 세션이 작업 세션을 나눠 돌리고 결과를 이 대화에 보고해요."
            : "따까리가 일을 나눠 맡기면 여기에 작업 세션이 하나씩 생겨요. 누르면 진행과 로그를 자세히 볼 수 있어요."}
        </p>
      )}
      {workers.length > 0 && (
        <ul className="tk-list worker-panel__list" aria-label={`${label} 목록`}>
          {workers.map((w) => {
            const status = (w.last_run_status ?? "queued") as RunStatus;
            return (
              <li key={w.id}>
                <Link
                  className="tk-list__item tk-list__item--interactive worker-tab"
                  to={`/chat/${w.id}`}
                  aria-current={w.id === currentId ? "page" : undefined}
                >
                  <span className="tk-list__body">
                    <span className="worker-tab__top">
                      <span className="tk-list__title">{w.title}</span>
                      {w.last_run_status && <StateBadge state={STATE_OF[status]} label={STATUS_LABEL[status]} />}
                    </span>
                    <span className="tk-list__meta">
                      <span>{engineLabel(w)}</span>
                      <span>{when(w.updated_at)}</span>
                    </span>
                    {w.last_result && <span className="worker-tab__snippet">{w.last_result}</span>}
                  </span>
                  <Icon name="chevron-right" className="worker-tab__go" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
