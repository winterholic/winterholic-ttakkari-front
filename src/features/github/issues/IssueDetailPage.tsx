import { Link, useParams } from "react-router";
import { ghComments, ghIssue } from "../../../api/githubClient";
import type { GhComment } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { GhMarkdown } from "../GhMarkdown";
import { ago, when } from "../format";
import { ghPath, githubWebUrl, parseNumber, safeGithubHref } from "../links";
import { IssueStateBadge, LabelBadges, WebLink } from "../parts";
import { notFoundError } from "../routeErrors";
import { GhErrorState, InfiniteView, QueryView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import "../pulls/github-pulls.css";

function CommentItem({ c, owner, repo }: { c: GhComment; owner: string; repo: string }) {
  return (
    <li className="gh-comment">
      <p className="gh-comment__head">
        <strong>{c.user ?? "알 수 없음"}</strong>
        {c.author_association && c.author_association !== "NONE" && <Badge>{c.author_association.toLowerCase()}</Badge>}
        <span className="gh-note" title={when(c.created_at)}>{ago(c.created_at)}</span>
      </p>
      <GhMarkdown base={{ owner, repo, file: "" }}>{c.body}</GhMarkdown>
    </li>
  );
}

function Comments({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const { account } = useGh();
  const query = useGhInfinite(account, ["comments", owner, repo, number], (page) => ghComments(account, owner, repo, number, { page }));
  return (
    <section className="gh-section" aria-label="댓글">
      <h3 className="gh-section__title">댓글</h3>
      <InfiniteView query={query} label="댓글을 불러오는 중" skeleton="card" empty={{ icon: "memo", title: "댓글이 없어요" }} githubUrl={githubWebUrl({ kind: "issue", owner, repo, number })} moreLabel="댓글 더 보기">
        {(items) => <ul className="gh-comments">{items.map((c) => <CommentItem key={c.id} c={c} owner={owner} repo={repo} />)}</ul>}
      </InfiniteView>
    </section>
  );
}

/** /github/:owner/:repo/issues/:number — 본문과 댓글(읽기 전용). */
export function IssueDetailPage() {
  const { owner, repo } = useRepoParams();
  const { number: raw } = useParams();
  const number = parseNumber(raw);
  const { account } = useGh();
  const query = useGhQuery(account, ["issue", owner, repo, number ?? 0], () => ghIssue(account, owner, repo, number ?? 0), { enabled: number !== null });
  if (number === null) return <GhErrorState error={notFoundError()} />;
  const web = githubWebUrl({ kind: "issue", owner, repo, number });
  return (
    <QueryView query={query} skeleton="card" label="이슈를 불러오는 중" githubUrl={web}>
      {(i) => (
        <div className="gh-stack">
          <header className="gh-card">
            <h2 className="gh-card__title">{i.title}</h2>
            <p className="gh-badges">
              <IssueStateBadge state={i.state} reason={i.state_reason} />
              <span className="gh-note">#{i.number}</span>
              <LabelBadges labels={i.labels} />
            </p>
            <p className="gh-card__text">
              {i.user ?? "알 수 없음"} · {ago(i.created_at)} 열림 · 댓글 {i.comments}개
              {i.assignees.length > 0 && " · 담당 " + i.assignees.join(", ")}
            </p>
            {i.kind === "pull" && (
              <p className="tk-banner tk-banner--neutral" role="status">
                <Icon name="git-pull-request" />
                <span className="tk-banner__text">이 번호는 Pull Request 예요. </span>
                <Link className="tk-button tk-button--ghost tk-button--xs" to={ghPath(account, { owner, repo, section: "pulls", number: i.number })}><span>PR 로 열기</span></Link>
              </p>
            )}
            <div className="gh-file__tools"><WebLink href={safeGithubHref(i.html_url) ?? web} /></div>
          </header>
          {i.body ? <GhMarkdown base={{ owner, repo, file: "" }}>{i.body}</GhMarkdown> : <p className="gh-note">작성된 설명이 없어요.</p>}
          <Comments owner={owner} repo={repo} number={number} />
        </div>
      )}
    </QueryView>
  );
}
