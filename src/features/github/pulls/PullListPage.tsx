import { Link, useSearchParams } from "react-router";
import { ghPulls } from "../../../api/githubClient";
import type { GhPullItem, GhPullState } from "../../../api/githubTypes";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite } from "../data";
import { useGh } from "../GithubContext";
import { ago, when } from "../format";
import { ghPath, githubWebUrl, withQuery } from "../links";
import { FilterPills, LabelBadges, PullStateBadge } from "../parts";
import { InfiniteView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import "./github-pulls.css";

const STATES: { id: GhPullState; label: string }[] = [
  { id: "open", label: "열림" },
  { id: "closed", label: "닫힘" },
  { id: "all", label: "전체" },
];

export const parseState = (v: string | null): GhPullState => (v === "closed" || v === "all" ? v : "open");

function PullRow({ pull, account, owner, repo }: { pull: GhPullItem; account: string; owner: string; repo: string }) {
  return (
    <li>
      <Link className="tk-list__item gh-row" to={ghPath(account, { owner, repo, section: "pulls", number: pull.number })}>
        <Icon name={pull.merged ? "git-merge" : pull.draft ? "git-pr-draft" : "git-pull-request"} />
        <span className="tk-list__body">
          <span className="tk-list__title tk-list__title--wrap">{pull.title}</span>
          <span className="tk-list__meta">
            <span>#{pull.number}</span>
            <PullStateBadge state={pull.state} merged={pull.merged} draft={pull.draft} />
            {pull.user && <span>{pull.user}</span>}
            <span className="gh-branchpair" title={pull.head_ref + " → " + pull.base_ref}>{pull.head_ref} → {pull.base_ref}</span>
            <LabelBadges labels={pull.labels} />
            {pull.comments > 0 && <span>댓글 {pull.comments}</span>}
            <span title={when(pull.updated_at)}>{ago(pull.updated_at)} 갱신</span>
          </span>
        </span>
        <span className="tk-list__end"><Icon name="chevron-right" /></span>
      </Link>
    </li>
  );
}

/** /github/:owner/:repo/pulls?state= — 상태 필터는 URL 에 두므로 뒤로가기·새로고침해도 그대로다. */
export function PullListPage() {
  const { owner, repo } = useRepoParams();
  const { account } = useGh();
  const [params, setParams] = useSearchParams();
  const state = parseState(params.get("state"));
  const query = useGhInfinite(account, ["pulls", owner, repo, state], (page) => ghPulls(account, owner, repo, { state, page }));
  return (
    <section className="gh-section" aria-label="Pull Request 목록">
      <FilterPills label="상태" options={STATES} value={state} onChange={(v) => setParams(withQuery(params, { state: v === "open" ? undefined : v }), { replace: true })} />
      <InfiniteView query={query} label="PR 을 불러오는 중" empty={{ icon: "git-pull-request", title: state === "open" ? "열린 PR 이 없어요" : "PR 이 없어요" }} githubUrl={githubWebUrl({ kind: "pulls", owner, repo })}>
        {(items) => (
          <ul className="tk-list tk-list--inset">
            {items.map((p) => <PullRow key={p.number} pull={p} account={account} owner={owner} repo={repo} />)}
          </ul>
        )}
      </InfiniteView>
    </section>
  );
}
