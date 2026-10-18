import { Link } from "react-router";
import { GhApiError, ghReadme } from "../../../api/githubClient";
import { Icon } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";
import { useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { GhMarkdown } from "../GhMarkdown";
import { ghPath } from "../links";
import { GhErrorState, GhSkeleton } from "../state/StateView";
import { useRepo, useRepoParams } from "./useRepo";

// README 가 없거나 빈 저장소인 것은 흔하다. 오류로 보이지 않고 조용히 건너뛴다.
const SILENT = new Set(["readme_not_found", "gh_empty_repository"]);

const SECTIONS: { id: "code" | "pulls" | "issues" | "actions"; label: string; hint: string; icon: IconName }[] = [
  { id: "code", label: "코드", hint: "파일과 폴더, 브랜치", icon: "code" },
  { id: "pulls", label: "Pull Request", hint: "목록·상세·변경 파일", icon: "git-pull-request" },
  { id: "issues", label: "이슈", hint: "목록·상세·댓글", icon: "issue" },
  { id: "actions", label: "Actions", hint: "실행·job·로그", icon: "play" },
];

/** 저장소 첫 화면: 보고 싶은 곳으로 가는 큰 버튼 넷과 README. */
export function RepoOverview() {
  const { owner, repo } = useRepoParams();
  const { account } = useGh();
  const repoQuery = useRepo(owner, repo);
  const defaultBranch = repoQuery.data?.data.default_branch;
  const readme = useGhQuery(account, ["readme", owner, repo, ""], () => ghReadme(account, owner, repo, {}));
  const readmeFile = readme.data?.data.file ?? null;
  return (
    <>
      <ul className="gh-grid" aria-label="바로 가기">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <Link className="gh-tile" to={ghPath(account, { owner, repo, section: s.id })}>
              <Icon name={s.icon} />
              <span className="gh-tile__label">{s.label}</span>
              <span className="gh-tile__hint">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      {defaultBranch && <p className="gh-note">기본 브랜치 {defaultBranch} 기준이에요. 다른 브랜치는 코드 화면에서 바꿔요.</p>}
      {readme.isPending && <GhSkeleton kind="card" label="README 를 불러오는 중" />}
      {readme.isError && !(readme.error instanceof GhApiError && SILENT.has(readme.error.code)) && <GhErrorState compact error={readme.error} onRetry={() => void readme.refetch()} />}
      {readme.isSuccess && readmeFile && typeof readmeFile.text === "string" && (
        <section className="gh-section" aria-label="README">
          <h2 className="gh-section__title">{readmeFile.name}</h2>
          {(readmeFile.truncated || readmeFile.too_large) && <p className="gh-note">README 가 길어 앞부분만 보여 줘요.</p>}
          <GhMarkdown base={{ owner, repo, file: readmeFile.path }}>{readmeFile.text}</GhMarkdown>
        </section>
      )}
    </>
  );
}
