import { Link, useParams } from "react-router";
import { ghRun, ghRunJobs } from "../../../api/githubClient";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { ago, duration, loginOf, shortSha, when } from "../format";
import { ghPath, githubWebUrl, safeGithubHref } from "../links";
import { RunResultBadge, WebLink } from "../parts";
import { notFoundError } from "../routeErrors";
import { GhErrorState, InfiniteView, QueryView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import { StepList } from "./steps";
import "./github-actions.css";

const isRunId = (s: string | undefined): s is string => !!s && /^[1-9]\d{0,18}$/.test(s);

/** /github/:owner/:repo/actions/runs/:id — run 요약과 job·step. 로그는 job 화면에서 창 단위로 연다. */
export function RunDetailPage() {
  const { owner, repo } = useRepoParams();
  const { id } = useParams();
  const { account } = useGh();
  const valid = isRunId(id);
  const runId = valid ? id : "";
  const run = useGhQuery(account, ["run", owner, repo, runId], () => ghRun(account, owner, repo, runId), { enabled: valid });
  const jobs = useGhInfinite(account, ["run-jobs", owner, repo, runId], (page) => ghRunJobs(account, owner, repo, runId, { page }), { enabled: valid });
  if (!valid) return <GhErrorState error={notFoundError()} />;
  const web = githubWebUrl({ kind: "actions-run", owner, repo, runId });
  return (
    <div className="gh-stack">
      <QueryView query={run} skeleton="card" label="실행을 불러오는 중" githubUrl={web}>
        {(r) => (
          <header className="gh-card">
            <h2 className="gh-card__title">{r.display_title ?? r.name ?? "실행 #" + r.run_number}</h2>
            <p className="gh-badges"><RunResultBadge status={r.status} conclusion={r.conclusion} /><span className="gh-note">#{r.run_number}{r.run_attempt && r.run_attempt > 1 ? " · 시도 " + r.run_attempt : ""}</span></p>
            <dl className="gh-facts">
              {r.name && <div><dt>워크플로</dt><dd>{r.name}</dd></div>}
              {r.event && <div><dt>이벤트</dt><dd>{r.event}</dd></div>}
              {r.head_branch && <div><dt>브랜치</dt><dd className="gh-branchpair">{r.head_branch}</dd></div>}
              {r.head_sha && <div><dt>커밋</dt><dd className="gh-branchpair" title={r.head_sha}>{shortSha(r.head_sha)}</dd></div>}
              {r.actor && <div><dt>실행한 사람</dt><dd>{loginOf(r.actor)}</dd></div>}
              {r.path && <div><dt>워크플로 파일</dt><dd className="gh-branchpair">{r.path.replace(/@.*$/, "")}</dd></div>}
              {(r.run_started_at ?? r.created_at) && <div><dt>시작</dt><dd title={when(r.run_started_at ?? r.created_at)}>{ago(r.run_started_at ?? r.created_at)}</dd></div>}
              {duration(r.run_started_at, r.updated_at) && r.status === "completed" && <div><dt>걸린 시간</dt><dd>{duration(r.run_started_at, r.updated_at)}</dd></div>}
            </dl>
            {r.head_commit_message && <p className="gh-card__text">{r.head_commit_message}</p>}
            <div className="gh-file__tools"><WebLink href={safeGithubHref(r.html_url) ?? web} /></div>
          </header>
        )}
      </QueryView>
      <section className="gh-section" aria-label="job 목록">
        <h3 className="gh-section__title">job</h3>
        <InfiniteView query={jobs} label="job 을 불러오는 중" empty={{ icon: "play", title: "job 이 없어요", text: "아직 시작되지 않았거나 job 정보가 남아 있지 않아요." }} githubUrl={web} moreLabel="job 더 보기">
          {(items) => (
            <ul className="gh-jobs">
              {items.map((j) => (
                <li key={j.id} className="gh-job">
                  <Link className="tk-list__item gh-row" to={ghPath(account, { owner, repo, section: "job", runId, jobId: String(j.id) })}>
                    <span className="tk-list__body">
                      <span className="tk-list__title tk-list__title--wrap">{j.name}</span>
                      <span className="tk-list__meta">
                        <RunResultBadge status={j.status} conclusion={j.conclusion} />
                        {duration(j.started_at, j.completed_at) && <span>{duration(j.started_at, j.completed_at)}</span>}
                        {j.runner_name && <span>{j.runner_name}</span>}
                      </span>
                    </span>
                    <span className="tk-list__end"><Icon name="chevron-right" /></span>
                  </Link>
                  <StepList steps={j.steps} firstFailed={j.first_failed_step} />
                </li>
              ))}
            </ul>
          )}
        </InfiniteView>
      </section>
    </div>
  );
}
