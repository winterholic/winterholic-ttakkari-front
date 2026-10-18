import { Link, useNavigate, useSearchParams } from "react-router";
import { GhApiError, ghContents, ghReadme } from "../../../api/githubClient";
import { Icon } from "../../../ui/Icon";
import { PINNED_STALE, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { GhMarkdown } from "../GhMarkdown";
import { ghPath, githubWebUrl } from "../links";
import { GhErrorState, GhSkeleton, QueryView } from "../state/StateView";
import { useRepo, useRepoParams } from "../repo/useRepo";
import { BranchPicker } from "./BranchPicker";
import { FileView, SubmoduleView, SymlinkView } from "./FileView";
import { TreeList } from "./TreeList";
import "./github-code.css";

const SHA = /^[0-9a-f]{40}$/i;

/** 경로를 마디별 링크로. 긴 이름은 줄바꿈해 전부 보인다. */
function PathBar({ account, owner, repo, ref_, path }: { account: string; owner: string; repo: string; ref_?: string; path: string }) {
  const segs = path ? path.split("/") : [];
  return (
    <nav className="tk-path gh-pathbar" aria-label="파일 경로">
      <ol>
        <li>{segs.length === 0 ? <span aria-current="location">{repo}</span> : <Link to={ghPath(account, { owner, repo, section: "code", ref: ref_ })}>{repo}</Link>}</li>
        {segs.map((s, i) => {
          const to = segs.slice(0, i + 1).join("/");
          const last = i === segs.length - 1;
          return (
            <li key={to}>
              {last ? <span aria-current="location">{s}</span> : <Link to={ghPath(account, { owner, repo, section: "code", ref: ref_, path: to })}>{s}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function RootReadme({ owner, repo, refName }: { owner: string; repo: string; refName?: string }) {
  const { account } = useGh();
  const query = useGhQuery(account, ["readme", owner, repo, refName ?? ""], () => ghReadme(account, owner, repo, { ref: refName }), { staleTime: refName && SHA.test(refName) ? PINNED_STALE : undefined });
  if (query.isPending) return <GhSkeleton kind="card" label="README 를 불러오는 중" />;
  // README 가 없는 저장소는 흔하다. 오류가 아니라 조용히 건너뛴다.
  if (query.isError) return query.error instanceof GhApiError && query.error.code === "gh_not_found" ? null : <GhErrorState compact error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data.data;
  return (
    <section className="gh-section" aria-label="README">
      <h2 className="gh-section__title">{r.name}</h2>
      {r.truncated && <p className="gh-note">README 가 길어 앞부분만 보여 줘요.</p>}
      <GhMarkdown base={{ owner, repo, ref: refName, file: r.path }}>{r.text}</GhMarkdown>
    </section>
  );
}

/** /github/:owner/:repo/code?ref=&path= — 트리와 파일을 한 라우트에서. ref·path 는 슬래시 때문에 쿼리로 둔다. */
export function CodePage() {
  const { owner, repo } = useRepoParams();
  const { account } = useGh();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ref_ = params.get("ref") || undefined;
  const path = params.get("path") || "";
  const repoQuery = useRepo(owner, repo);
  const contents = useGhQuery(
    account,
    ["contents", owner, repo, ref_ ?? "", path],
    () => ghContents(account, owner, repo, { ref: ref_, path: path || undefined }),
    { staleTime: ref_ && SHA.test(ref_) ? PINNED_STALE : undefined },
  );
  const web = githubWebUrl({ kind: path ? "blob" : "tree", owner, repo, ref: ref_ ?? repoQuery.data?.data.default_branch ?? "HEAD", path: path || undefined });
  const defaultBranch = repoQuery.data?.data.default_branch ?? "";

  return (
    <div className="gh-stack">
      <div className="gh-codebar">
        {defaultBranch && (
          <BranchPicker
            owner={owner}
            repo={repo}
            current={ref_}
            defaultBranch={defaultBranch}
            onPick={(picked) => navigate(ghPath(account, { owner, repo, section: "code", ref: picked }))}
          />
        )}
        <PathBar account={account} owner={owner} repo={repo} ref_={ref_} path={path} />
      </div>
      <QueryView query={contents} skeleton="code" label="코드를 불러오는 중" githubUrl={web}>
        {(c) => {
          switch (c.kind) {
            case "dir":
              return (
                <>
                  {c.entries.length === 0 ? (
                    <div className="tk-empty tk-empty--boxed"><Icon name="folder-open" /><p className="tk-empty__title">비어 있는 폴더예요</p></div>
                  ) : (
                    <TreeList account={account} owner={owner} repo={repo} ref_={ref_} entries={c.entries} />
                  )}
                  {c.truncated && <p className="gh-note">항목이 너무 많아 일부만 보여 줘요. 전체는 GitHub 에서 열어 보세요.</p>}
                  {path === "" && <RootReadme owner={owner} repo={repo} refName={ref_} />}
                </>
              );
            case "file":
              return <FileView file={c} owner={owner} repo={repo} refName={ref_} />;
            case "symlink":
              return <SymlinkView link={c} owner={owner} repo={repo} refName={ref_} />;
            case "submodule":
              return <SubmoduleView sub={c} />;
          }
        }}
      </QueryView>
    </div>
  );
}
