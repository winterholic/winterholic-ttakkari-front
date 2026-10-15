import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { listFailedRuns } from "../api/client";
import type { FailedRunOut, ISODateTime } from "../api/types";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/tasks/tasks.css";

const PERIODS = [
  { value: "all", label: "전체 기간" },
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

function sessionKind(run: FailedRunOut): string {
  if (run.session_parent_id) return "작업 세션";
  if (run.session_kind === "orchestrator") return "기획 세션";
  if (run.session_kind === "desk") return "접수 대화";
  return "대화 세션";
}

function runLink(run: FailedRunOut): string {
  return `${run.pool === "work" ? "/work" : "/chat"}/${run.session_id}`;
}

function failureReason(error: string | null, exitCode: number | null): string {
  const summary = error?.replace(/\s+/g, " ").trim();
  if (summary) return summary.length > 240 ? `${summary.slice(0, 239)}…` : summary;
  return exitCode === null ? "실패 이유가 기록되지 않았어요." : `종료 코드 ${exitCode}`;
}

function failedTime(value: ISODateTime): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}


export function FailedTasksPage() {
  const [period, setPeriod] = useState<Period>("all");
  const [since, setSince] = useState<ISODateTime | undefined>();
  const query = useInfiniteQuery({
    queryKey: ["runs", "failed", period],
    queryFn: ({ pageParam }) => listFailedRuns({ limit: 30, since, ...pageParam }),
    initialPageParam: null as { before: ISODateTime; before_id: string } | null,
    getNextPageParam: (last) => last.next_before && last.next_before_id
      ? { before: last.next_before, before_id: last.next_before_id }
      : undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="tk-screen">
      <PageHeader title="실패한 작업" meta="실패한 실행을 최신순으로 모아 봅니다."
        actions={<Link className="tk-button tk-button--sm" to="/tasks">전체 작업</Link>} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--thread tasks-page failed-tasks-page">
          <div className="tk-segmented failed-tasks-page__period" role="radiogroup" aria-label="실패 시기">
            {PERIODS.map((option) => (
              <label key={option.value}>
                <input type="radio" name="failed-period" checked={period === option.value}
                  onChange={() => {
                    setPeriod(option.value);
                    setSince(option.value === "all" ? undefined : new Date(Date.now() - Number(option.value) * 24 * 60 * 60 * 1000).toISOString());
                  }} />
                {option.label}
              </label>
            ))}
          </div>

          {query.isPending && (
            <div aria-busy="true" aria-label="실패한 작업을 불러오는 중">
              {[0, 1, 2].map((i) => <div key={i} className="tk-skeleton tk-skeleton--block tasks-page__skeleton" />)}
            </div>
          )}
          {query.isError && (
            <div className="tk-empty tk-empty--boxed">
              <p className="tk-empty__title">실패 목록을 불러오지 못했어요</p>
              <Button size="sm" onClick={() => void query.refetch()}><Icon name="retry" />다시 시도</Button>
            </div>
          )}
          {query.isSuccess && items.length > 0 && (
            <section className="tk-section" aria-labelledby="failed-runs-title">
              <div className="tk-section__head"><h2 className="tk-section__title" id="failed-runs-title">에이전트 실행</h2></div>
              <ul className="tk-list tk-list--inset failed-run-list">
                {items.map((run) => (
                  <li key={run.id}>
                    <Link className="tk-list__item tk-list__item--interactive failed-run" to={runLink(run)}>
                      <span className="tk-list__body failed-run__body">
                        <span className="failed-run__titleline">
                          <span className="tk-badge tk-badge--danger">실패</span>
                          <span className="tk-list__title">{run.prompt.split("\n", 1)[0] || "제목 없는 작업"}</span>
                        </span>
                        <span className="tk-list__meta failed-run__meta">
                          {run.workspace_name} · {run.session_title} · {sessionKind(run)}
                        </span>
                        <span className="tk-list__meta failed-run__meta">
                          {run.engine} · {run.profile ?? "계정 미상"} · {run.model ?? "모델 미지정"}
                        </span>
                        <span className="failed-run__reason">{failureReason(run.error, run.exit_code)}</span>
                        <span className="tk-list__meta failed-run__time">{failedTime(run.failed_at)}</span>
                      </span>
                      <span className="tk-list__end failed-run__linklabel">원래 대화 열기</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {query.hasNextPage && (
                <div className="tasks-page__more">
                  <Button size="sm" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                    {query.isFetchingNextPage ? "불러오는 중" : "더 보기"}
                  </Button>
                </div>
              )}
            </section>
          )}
          {query.isSuccess && items.length === 0 && (
            <div className="tk-empty tk-empty--boxed">
              <p className="tk-empty__title">실패한 작업이 없어요</p>
              <p className="tk-body-sm tk-text-tertiary">실패한 실행이 생기면 이곳에 모여요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
