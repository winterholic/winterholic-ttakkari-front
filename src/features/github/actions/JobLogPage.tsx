import { useContext } from "react";
import { useParams, useSearchParams } from "react-router";
import { GhApiError, ghJobLogs, ghRunJobs } from "../../../api/githubClient";
import type { GhLogWindow } from "../../../api/githubTypes";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { useState } from "react";
import { LIST_STALE, PINNED_STALE, useGhQuery } from "../data";
import { GhContext, useGh } from "../GithubContext";
import { duration } from "../format";
import { githubWebUrl, withQuery } from "../links";
import { RunResultBadge, WebLink } from "../parts";
import { notFoundError } from "../routeErrors";
import { GhEmpty, GhErrorState, GhNotes, GhSkeleton } from "../state/StateView";
import { describeGhError } from "../state/errors";
import { useRepoParams } from "../repo/useRepo";
import { StepList } from "./steps";
import "./github-actions.css";

/** 로그 창 크기. 서버 상한(2,000줄·256KiB)과 같다. */
export const LOG_LINES = 2000;
const IDS = /^[1-9]\d{0,18}$/;
// 로그가 없거나 읽을 수 없어서 생기는 오류. 일시 오류(타임아웃 등)와 달리 다시 시도해도 같다.
const UNAVAILABLE = new Set(["gh_not_found", "gh_gone", "gh_forbidden", "gh_too_large", "gh_unprocessable"]);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;

type Level = "error" | "warn" | "tool" | undefined;
function levelOf(line: string): Level {
  const body = line.replace(TIMESTAMP, "");
  if (body.startsWith("##[error]")) return "error";
  if (body.startsWith("##[warning]")) return "warn";
  if (body.startsWith("##[group]") || body.startsWith("##[command]")) return "tool";
  return undefined;
}

function LogUnavailable({ error, webUrl }: { error: GhApiError; webUrl: string | null }) {
  const ctx = useContext(GhContext);
  const view = describeGhError(error);
  const others = ctx ? ctx.accounts.filter((a) => a.login !== ctx.account) : [];
  const reason =
    error.code === "gh_gone" ? "보존 기간이 지나 삭제됐거나 로그가 비활성화된 job 이에요."
      : error.code === "gh_too_large" ? "로그가 너무 커서 이 화면에서 보여 줄 수 없어요."
        : error.code === "gh_forbidden" ? "이 계정에는 로그를 읽을 권한이 없어요."
          : error.code === "gh_unprocessable" ? "GitHub 가 이 로그를 주지 않았어요."
            : "로그가 없거나 이 계정으로는 볼 수 없어요.";
  return (
    <div className="gh-state" role="alert" data-tone="warning">
      <Icon name="file-archive" />
      <div className="gh-state__body">
        <p className="gh-state__title">로그를 볼 수 없어요</p>
        <p className="gh-state__text">{reason} 이 화면에는 로그를 대신 채워 넣지 않아요. GitHub 에서 직접 확인해 주세요.</p>
        <div className="gh-state__actions">
          <WebLink href={webUrl} />
          {view.switchAccount && others.map((a) => <Button key={a.login} size="sm" variant="ghost" onClick={() => ctx?.switchAccount(a.login)}>{a.login} 계정으로 열기</Button>)}
        </div>
      </div>
    </div>
  );
}

function LogBox({ win, wrap, showTime }: { win: GhLogWindow; wrap: boolean; showTime: boolean }) {
  return (
    <section className="tk-diff gh-logbox" data-wrap={wrap || undefined}>
      <div className="tk-diff__body" tabIndex={0} role="region" aria-label="로그">
        <table className="tk-diff__table">
          <tbody>
            {win.lines.map((line, i) => (
              <tr key={i} data-level={levelOf(line)}>
                <td className="tk-diff__no">{win.from_line + i}</td>
                <td className="tk-diff__code">{showTime ? line : line.replace(TIMESTAMP, "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** /github/:owner/:repo/actions/runs/:id/jobs/:jobId?from_line= — 2,000줄 창과 이전/다음. 받지 못하면 로그를 지어내지 않고 이유와 GitHub 링크만 보인다. */
export function JobLogPage() {
  const { owner, repo } = useRepoParams();
  const { id, jobId } = useParams();
  const { account } = useGh();
  const [params, setParams] = useSearchParams();
  const [wrap, setWrap] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const valid = !!id && !!jobId && IDS.test(id) && IDS.test(jobId);
  const runId = valid ? id : "";
  const job = valid ? jobId : "";
  const fromRaw = Number(params.get("from_line"));
  const from = Number.isInteger(fromRaw) && fromRaw >= 1 && fromRaw <= 10_000_000 ? fromRaw : 1;

  const jobs = useGhQuery(account, ["run-jobs-first", owner, repo, runId], () => ghRunJobs(account, owner, repo, runId, { page: 1 }), { enabled: valid });
  const info = jobs.data?.data.find((j) => String(j.id) === job);
  const finished = info?.status === "completed";
  const logs = useGhQuery(account, ["job-logs", owner, repo, job, from], () => ghJobLogs(account, owner, repo, job, { from_line: from, lines: LOG_LINES }), {
    enabled: valid,
    staleTime: finished ? PINNED_STALE : LIST_STALE,
  });
  if (!valid) return <GhErrorState error={notFoundError()} />;
  const web = githubWebUrl({ kind: "actions-job", owner, repo, runId, jobId: job });
  const go = (line: number) => setParams(withQuery(params, { from_line: line <= 1 ? undefined : line }));

  return (
    <div className="gh-stack">
      {info && (
        <header className="gh-card">
          <h2 className="gh-card__title">{info.name}</h2>
          <p className="gh-badges">
            <RunResultBadge status={info.status} conclusion={info.conclusion} />
            {duration(info.started_at, info.completed_at) && <span className="gh-note">{duration(info.started_at, info.completed_at)}</span>}
          </p>
          <StepList steps={info.steps} />
        </header>
      )}
      {info && !finished && (
        <p className="tk-banner tk-banner--neutral" role="status">
          <Icon name="clock" />
          <span className="tk-banner__text">진행 중인 job 이라 로그가 계속 늘어나요. 새로 불러오면 최신 줄까지 볼 수 있어요.</span>
          <Button size="sm" variant="ghost" busy={logs.isFetching} onClick={() => void logs.refetch()}>새로 불러오기</Button>
        </p>
      )}
      <section className="gh-section" aria-label="job 로그">
        {logs.isPending && <GhSkeleton kind="code" label="로그를 불러오는 중" />}
        {logs.isError && (logs.error instanceof GhApiError && UNAVAILABLE.has(logs.error.code)
          ? <LogUnavailable error={logs.error} webUrl={web} />
          : <GhErrorState error={logs.error} onRetry={() => void logs.refetch()} githubUrl={web} />)}
        {logs.isSuccess && (() => {
          const w = logs.data.data;
          if (w.lines.length === 0) return <GhEmpty icon="terminal" title="로그가 비어 있어요">아직 시작되지 않았거나 남아 있는 로그가 없어요.</GhEmpty>;
          const end = w.from_line + w.lines.length - 1;
          const prevStart = Math.max(1, w.from_line - LOG_LINES);
          const nextCount = Math.min(LOG_LINES, w.total_lines - end);
          return (
            <>
              <GhNotes env={logs.data} />
              <div className="gh-file__tools">
                <button type="button" className="tk-button tk-button--ghost tk-button--sm" aria-pressed={wrap} onClick={() => setWrap((v) => !v)}><Icon name="wrap" /><span>줄바꿈</span></button>
                <button type="button" className="tk-button tk-button--ghost tk-button--sm" aria-pressed={showTime} onClick={() => setShowTime((v) => !v)}><Icon name="clock" /><span>시각 보기</span></button>
                <WebLink href={web} />
              </div>
              {w.from_line > 1 && <Button variant="ghost" block onClick={() => go(prevStart)}>이전 {(w.from_line - prevStart).toLocaleString("ko-KR")}줄</Button>}
              <LogBox win={w} wrap={wrap} showTime={showTime} />
              <p className="gh-note">{w.total_lines.toLocaleString("ko-KR")}줄 중 {w.from_line.toLocaleString("ko-KR")}–{end.toLocaleString("ko-KR")}줄{w.masked && " · 비밀 값은 가려져 있어요"}</p>
              {w.truncated && nextCount > 0 && w.lines.length < LOG_LINES && <p className="gh-note">창 크기 제한으로 이 창은 중간에서 끊겼어요. 다음 줄부터 이어서 볼 수 있어요.</p>}
              {nextCount > 0 && <Button variant="ghost" block onClick={() => go(end + 1)}>다음 {nextCount.toLocaleString("ko-KR")}줄</Button>}
            </>
          );
        })()}
      </section>
    </div>
  );
}
