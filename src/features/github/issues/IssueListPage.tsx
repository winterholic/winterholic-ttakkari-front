import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { ghIssues } from "../../../api/githubClient";
import type { GhIssueItem, GhIssueState } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite } from "../data";
import { useGh } from "../GithubContext";
import { ago, loginOf, when } from "../format";
import { ghPath, githubWebUrl, withQuery } from "../links";
import { FilterPills, IssueStateBadge, LabelBadges } from "../parts";
import { InfiniteView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import "../pulls/github-pulls.css";

const STATES: { id: GhIssueState; label: string }[] = [
  { id: "open", label: "열림" },
  { id: "closed", label: "닫힘" },
  { id: "all", label: "전체" },
];

const parseState = (v: string | null): GhIssueState => (v === "closed" || v === "all" ? v : "open");
const MAX_LABEL = 100;

function IssueRow({ issue, account, owner, repo }: { issue: GhIssueItem; account: string; owner: string; repo: string }) {
  return (
    <li>
      <Link className="tk-list__item gh-row" to={ghPath(account, { owner, repo, section: "issues", number: issue.number })}>
        <Icon name="issue" />
        <span className="tk-list__body">
          <span className="tk-list__title tk-list__title--wrap">{issue.title}</span>
          <span className="tk-list__meta">
            <span>#{issue.number}</span>
            <IssueStateBadge state={issue.state} reason={issue.state_reason} />
            {issue.user && <span>{loginOf(issue.user)}</span>}
            {issue.locked && <Badge>잠김</Badge>}
            <LabelBadges labels={issue.labels} />
            {issue.comments > 0 && <span>댓글 {issue.comments}</span>}
            {issue.updated_at && <span title={when(issue.updated_at)}>{ago(issue.updated_at)} 갱신</span>}
          </span>
        </span>
        <span className="tk-list__end"><Icon name="chevron-right" /></span>
      </Link>
    </li>
  );
}

/** /github/:owner/:repo/issues?state=&labels= — PR 은 서버가 걸러 주므로 페이지가 짧을 수 있어 has_more 로만 이어 본다. */
export function IssueListPage() {
  const { owner, repo } = useRepoParams();
  const { account } = useGh();
  const [params, setParams] = useSearchParams();
  const state = parseState(params.get("state"));
  const labels = params.get("labels") || undefined;
  const [draft, setDraft] = useState(labels ?? "");
  const query = useGhInfinite(account, ["issues", owner, repo, state, labels ?? ""], (page) => ghIssues(account, owner, repo, { state, labels, page }));

  function submit(e: FormEvent) {
    e.preventDefault();
    setParams(withQuery(params, { labels: draft.trim().slice(0, MAX_LABEL) || undefined }), { replace: true });
  }

  return (
    <section className="gh-section" aria-label="이슈 목록">
      <FilterPills label="상태" options={STATES} value={state} onChange={(v) => setParams(withQuery(params, { state: v === "open" ? undefined : v }), { replace: true })} />
      <form className="gh-target" onSubmit={submit}>
        <label className="tk-label" htmlFor="gh-issue-label">라벨로 거르기</label>
        <div className="gh-target__row">
          <input id="gh-issue-label" className="tk-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="예: bug" maxLength={MAX_LABEL} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          <Button type="submit">적용</Button>
        </div>
      </form>
      <InfiniteView query={query} label="이슈를 불러오는 중" empty={{ icon: "issue", title: state === "open" ? "열린 이슈가 없어요" : "이슈가 없어요" }} githubUrl={githubWebUrl({ kind: "issues", owner, repo })}>
        {(items) => (
          <ul className="tk-list tk-list--inset">
            {items.map((i) => <IssueRow key={i.number} issue={i} account={account} owner={owner} repo={repo} />)}
          </ul>
        )}
      </InfiniteView>
    </section>
  );
}
