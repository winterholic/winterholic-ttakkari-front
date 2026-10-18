import { Link, Outlet, useLocation, useSearchParams } from "react-router";
import type { GhRepo } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";
import { useGh } from "../GithubContext";
import { compact } from "../format";
import { ghPath, githubWebUrl, safeGithubHref } from "../links";
import type { PathSpec } from "../links";
import { notFoundError } from "../routeErrors";
import { GhErrorState, QueryView } from "../state/StateView";
import { useRepo, useRepoParams } from "./useRepo";
import "./github-repo.css";

type Section = "code" | "pulls" | "issues" | "actions";
const TABS: { id: Section; label: string; icon: IconName }[] = [
  { id: "code", label: "코드", icon: "code" },
  { id: "pulls", label: "PR", icon: "git-pull-request" },
  { id: "issues", label: "이슈", icon: "issue" },
  { id: "actions", label: "Actions", icon: "play" },
];

function permissionText(r: GhRepo): string {
  if (r.permissions.admin) return "관리자";
  if (r.permissions.push) return "쓰기";
  return "읽기";
}

export function RepoCard({ repo }: { repo: GhRepo }) {
  const web = safeGithubHref(repo.html_url) ?? githubWebUrl({ kind: "repo", owner: repo.owner, repo: repo.name });
  return (
    <section className="gh-card" aria-label="저장소 정보">
      <div className="gh-card__head">
        <Icon name={repo.private ? "lock" : "folder"} />
        <div className="gh-card__titles">
          <p className="gh-card__title">{repo.full_name}</p>
          <p className="gh-card__sub">기본 브랜치 {repo.default_branch}</p>
        </div>
      </div>
      <p className="gh-badges">
        {repo.private ? <Badge tone="warning">비공개</Badge> : <Badge>공개</Badge>}
        {repo.archived && <Badge>보관됨</Badge>}
        {repo.fork && <Badge>포크</Badge>}
        <Badge tone="info">내 권한 {permissionText(repo)}</Badge>
      </p>
      {repo.description && <p className="gh-card__text">{repo.description}</p>}
      {repo.topics.length > 0 && (
        <ul className="gh-chips" aria-label="토픽">
          {repo.topics.map((t) => <li key={t}><span className="tk-chip"><span>{t}</span></span></li>)}
        </ul>
      )}
      <dl className="gh-facts">
        {repo.language && <div><dt>언어</dt><dd>{repo.language}</dd></div>}
        <div><dt>별</dt><dd>{compact(repo.stargazers_count)}</dd></div>
        <div><dt>포크</dt><dd>{compact(repo.forks_count)}</dd></div>
        <div><dt>열린 이슈·PR</dt><dd>{compact(repo.open_issues_count)}</dd></div>
        {repo.license && <div><dt>라이선스</dt><dd>{repo.license}</dd></div>}
        {repo.homepage && <div><dt>홈페이지</dt><dd>{repo.homepage}</dd></div>}
      </dl>
      {web && <a className="tk-button tk-button--ghost tk-button--sm gh-inline-link" href={web} target="_blank" rel="noopener noreferrer"><span>GitHub 에서 열기</span><Icon name="external-link" /></a>}
    </section>
  );
}

/** /github/:owner/:repo/* 의 틀: 저장소 요약 + 코드·PR·이슈·Actions 이동. 저장소를 못 열면 아래 화면은 그리지 않는다. */
export function RepoLayout() {
  const { owner, repo, valid } = useRepoParams();
  const { account } = useGh();
  const location = useLocation();
  const [params] = useSearchParams();
  const query = useRepo(owner, repo, valid);
  const current = location.pathname.split("/")[4] as Section | undefined;
  const web = githubWebUrl({ kind: "repo", owner, repo });
  if (!valid) return <GhErrorState error={notFoundError()} />;
  return (
    <div className="gh-stack">
      <QueryView query={query} skeleton="card" label="저장소를 불러오는 중" githubUrl={web}>
        {(r) => (
          <>
            {current === undefined && <RepoCard repo={r} />}
            <nav className="gh-tabs" aria-label="저장소 메뉴">
              {TABS.map((t) => {
                const spec: PathSpec = { owner, repo, section: t.id, ref: t.id === "code" ? params.get("ref") ?? undefined : undefined };
                return (
                  <Link key={t.id} to={ghPath(account, spec)} aria-current={current === t.id ? "page" : undefined}>
                    <Icon name={t.icon} /><span>{t.label}</span>
                  </Link>
                );
              })}
            </nav>
            <Outlet />
          </>
        )}
      </QueryView>
    </div>
  );
}
