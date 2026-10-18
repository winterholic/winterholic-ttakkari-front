import { Link } from "react-router";
import type { GhProfile, GhRepo } from "../../../api/githubTypes";
import { Badge } from "../../../ui/Badge";
import { Icon } from "../../../ui/Icon";
import { useGh } from "../GithubContext";
import { ago, compact } from "../format";
import { ghPath } from "../links";

export const repoOwner = (r: GhRepo): string => r.owner?.login ?? r.full_name.split("/")[0];

/** 저장소 한 줄. 이름은 전체를 줄바꿈해 보이고, 설명은 두 줄까지만 보인다. */
export function RepoRow({ repo }: { repo: GhRepo }) {
  const { account } = useGh();
  return (
    <li>
      <Link className="tk-list__item gh-row" to={ghPath(account, { owner: repoOwner(repo), repo: repo.name })}>
        <span className="tk-list__body">
          <span className="tk-list__title tk-list__title--wrap">{repo.full_name}</span>
          {repo.description && <span className="tk-list__snippet">{repo.description}</span>}
          <span className="tk-list__meta">
            {repo.private && <Badge tone="warning">비공개</Badge>}
            {repo.archived && <Badge>보관됨</Badge>}
            {repo.fork && <Badge>포크</Badge>}
            {repo.language && <span>{repo.language}</span>}
            {repo.stargazers_count !== null && <span title="별">★ {compact(repo.stargazers_count)}</span>}
            {repo.pushed_at && <span>{ago(repo.pushed_at)} 푸시</span>}
          </span>
        </span>
        <span className="tk-list__end"><Icon name="chevron-right" /></span>
      </Link>
    </li>
  );
}

export function RepoUl({ repos }: { repos: GhRepo[] }) {
  return <ul className="tk-list tk-list--inset">{repos.map((r) => <RepoRow key={r.full_name} repo={r} />)}</ul>;
}

/** 사용자·조직 공통 소개 카드. 이미지는 불러오지 않는다. */
export function ProfileCard({ profile, heading }: { profile: GhProfile; heading?: string }) {
  const org = profile.type === "Organization";
  const about = org ? profile.description ?? profile.bio : profile.bio ?? profile.description;
  return (
    <section className="gh-card" aria-label={heading ?? "프로필"}>
      <div className="gh-card__head">
        <Icon name={org ? "org" : "user"} />
        <div className="gh-card__titles">
          <p className="gh-card__title">{profile.name ?? profile.login}</p>
          <p className="gh-card__sub">{profile.login}</p>
        </div>
        <Badge tone={org ? "info" : undefined}>{org ? "조직" : profile.type === "Bot" ? "봇" : "사용자"}</Badge>
      </div>
      {about && <p className="gh-card__text">{about}</p>}
      <dl className="gh-facts">
        {profile.public_repos !== null && <div><dt>공개 저장소</dt><dd>{profile.public_repos}</dd></div>}
        {!org && profile.followers !== null && <div><dt>팔로워</dt><dd>{compact(profile.followers)}</dd></div>}
        {!org && profile.following !== null && <div><dt>팔로잉</dt><dd>{compact(profile.following)}</dd></div>}
        {profile.location && <div><dt>위치</dt><dd>{profile.location}</dd></div>}
        {profile.company && <div><dt>소속</dt><dd>{profile.company}</dd></div>}
      </dl>
    </section>
  );
}
