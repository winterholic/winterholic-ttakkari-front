import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { ghRuns } from "../../../api/githubClient";
import type { GhRun } from "../../../api/githubTypes";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite } from "../data";
import { useGh } from "../GithubContext";
import { ago, loginOf, when } from "../format";
import { ghPath, githubWebUrl, withQuery } from "../links";
import { FilterPills, RunResultBadge } from "../parts";
import { InfiniteView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import "./github-actions.css";

type StatusFilter = "all" | "in_progress" | "success" | "failure" | "cancelled";
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "in_progress", label: "진행 중" },
  { id: "success", label: "성공" },
  { id: "failure", label: "실패" },
  { id: "cancelled", label: "취소" },
];
const MAX_BRANCH = 255;

const parseStatus = (v: string | null): StatusFilter => (STATUSES.some((s) => s.id === v) && v !== "all" ? (v as StatusFilter) : "all");

function RunRow({ run, account, owner, repo }: { run: GhRun; account: string; owner: string; repo: string }) {
  const title = run.display_title ?? run.name ?? "실행 #" + run.run_number;
  return (
    <li>
      <Link className="tk-list__item gh-row" to={ghPath(account, { owner, repo, section: "run", runId: String(run.id) })}>
        <Icon name="play" />
        <span className="tk-list__body">
          <span className="tk-list__title tk-list__title--wrap">{title}</span>
          <span className="tk-list__meta">
            {run.name && run.name !== title && <span>{run.name}</span>}
            <span>#{run.run_number}{run.run_attempt && run.run_attempt > 1 ? " (시도 " + run.run_attempt + ")" : ""}</span>
            <RunResultBadge status={run.status} conclusion={run.conclusion} />
            {run.event && <span>{run.event}</span>}
            {run.head_branch && <span className="gh-branchpair" title={run.head_branch}>{run.head_branch}</span>}
            {run.actor && <span>{loginOf(run.actor)}</span>}
            {run.created_at && <span title={when(run.created_at)}>{ago(run.created_at)}</span>}
          </span>
        </span>
        <span className="tk-list__end"><Icon name="chevron-right" /></span>
      </Link>
    </li>
  );
}

/** /github/:owner/:repo/actions?status=&branch= */
export function RunListPage() {
  const { owner, repo } = useRepoParams();
  const { account } = useGh();
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const branch = params.get("branch") || undefined;
  const [draft, setDraft] = useState(branch ?? "");
  const query = useGhInfinite(account, ["runs", owner, repo, status, branch ?? ""], (page) =>
    ghRuns(account, owner, repo, { status: status === "all" ? undefined : status, branch, page }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setParams(withQuery(params, { branch: draft.trim().slice(0, MAX_BRANCH) || undefined }), { replace: true });
  }

  return (
    <section className="gh-section" aria-label="Actions 실행">
      <FilterPills label="결과" options={STATUSES} value={status} onChange={(v) => setParams(withQuery(params, { status: v === "all" ? undefined : v }), { replace: true })} />
      <form className="gh-target" onSubmit={submit}>
        <label className="tk-label" htmlFor="gh-run-branch">브랜치로 거르기</label>
        <div className="gh-target__row">
          <input id="gh-run-branch" className="tk-input tk-input--mono" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="예: main" maxLength={MAX_BRANCH} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <Button type="submit">적용</Button>
        </div>
      </form>
      <InfiniteView query={query} label="실행 기록을 불러오는 중" empty={{ icon: "play", title: "실행 기록이 없어요", text: "Actions 를 쓰지 않거나 조건에 맞는 실행이 없어요." }} githubUrl={githubWebUrl({ kind: "actions", owner, repo })}>
        {(items) => (
          <ul className="tk-list tk-list--inset" aria-label="실행 목록">
            {items.map((r) => <RunRow key={r.id} run={r} account={account} owner={owner} repo={repo} />)}
          </ul>
        )}
      </InfiniteView>
    </section>
  );
}
