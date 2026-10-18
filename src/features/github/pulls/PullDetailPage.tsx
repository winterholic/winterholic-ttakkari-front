import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { ghPull, ghPullFiles } from "../../../api/githubClient";
import type { GhPull } from "../../../api/githubTypes";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { GhMarkdown } from "../GhMarkdown";
import { ago, loginOf, when } from "../format";
import { githubWebUrl, parseNumber, safeGithubHref, withQuery } from "../links";
import { FilterPills, PullStateBadge, WebLink } from "../parts";
import { notFoundError } from "../routeErrors";
import { GhErrorState, InfiniteView, QueryView } from "../state/StateView";
import { useRepoParams } from "../repo/useRepo";
import { DiffFile } from "./DiffView";
import { branchPair } from "./PullListPage";
import "./github-pulls.css";

/** GitHub 상류가 한 PR 에서 주는 파일 수의 상한. */
const FILE_LIMIT = 3000;

function mergeText(p: GhPull): { text: string; tone: "ok" | "warn" | "info" } {
  if (p.merged) return { text: p.merged_at ? when(p.merged_at) + "에 머지됐어요" : "머지됐어요", tone: "info" };
  if (p.state === "closed") return { text: "머지하지 않고 닫힌 PR 이에요", tone: "info" };
  if (p.mergeable_computing || p.mergeable === null) return { text: "GitHub 가 병합 가능 여부를 계산 중이에요. 잠시 뒤 다시 열어 보세요", tone: "info" };
  if (p.mergeable) return { text: "충돌 없이 병합할 수 있어요", tone: "ok" };
  return { text: "충돌이 있어요" + (p.mergeable_state ? " (" + p.mergeable_state + ")" : ""), tone: "warn" };
}

function PullFiles({ owner, repo, number, changed }: { owner: string; repo: string; number: number; changed: number }) {
  const { account } = useGh();
  const [wrap, setWrap] = useState(false);
  const query = useGhInfinite(account, ["pull-files", owner, repo, number], (page) => ghPullFiles(account, owner, repo, number, { page }));
  const web = githubWebUrl({ kind: "pull-files", owner, repo, number });
  const limitHit = query.data?.pages.some((p) => p.page?.limit_hit) ?? false;
  return (
    <section className="gh-section" aria-label="변경 파일">
      <InfiniteView query={query} label="변경 파일을 불러오는 중" empty={{ icon: "diff", title: "변경된 파일이 없어요" }} githubUrl={web} moreLabel="변경 파일 더 보기">
        {(files) => (
          <>
            <div className="gh-section__head">
              <p className="gh-note">
                {changed > files.length ? "변경 파일 " + changed.toLocaleString("ko-KR") + "개 중 " + files.length.toLocaleString("ko-KR") + "개" : "변경 파일 " + files.length.toLocaleString("ko-KR") + "개"}
              </p>
              <button type="button" className="tk-button tk-button--ghost tk-button--sm" aria-pressed={wrap} onClick={() => setWrap((v) => !v)}><Icon name="wrap" /><span>줄바꿈</span></button>
            </div>
            {(changed > FILE_LIMIT || limitHit) && <p className="tk-banner tk-banner--warning" role="status"><Icon name="warning" /><span className="tk-banner__text">GitHub 는 한 PR 에서 최대 3,000개 파일까지만 알려 줘요. 나머지는 GitHub 에서 확인하세요.</span></p>}
            <div className="gh-diffs">
              {files.map((f) => <DiffFile key={f.filename} file={f} webUrl={web} wrap={wrap} />)}
            </div>
          </>
        )}
      </InfiniteView>
    </section>
  );
}

/** /github/:owner/:repo/pulls/:number — 개요와 변경 파일(`?tab=files`). */
export function PullDetailPage() {
  const { owner, repo } = useRepoParams();
  const { number: raw } = useParams();
  const number = parseNumber(raw);
  const { account } = useGh();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "files" ? "files" : "overview";
  const query = useGhQuery(account, ["pull", owner, repo, number ?? 0], () => ghPull(account, owner, repo, number ?? 0), { enabled: number !== null });
  if (number === null) return <GhErrorState error={notFoundError()} />;
  const web = githubWebUrl({ kind: "pull", owner, repo, number });
  return (
    <QueryView query={query} skeleton="card" label="PR 을 불러오는 중" githubUrl={web}>
      {(p) => {
        const merge = mergeText(p);
        const htmlUrl = safeGithubHref(p.html_url) ?? web;
        return (
          <div className="gh-stack">
            <header className="gh-card">
              <h2 className="gh-card__title">{p.title}</h2>
              <p className="gh-badges"><PullStateBadge state={p.state} merged={p.merged} draft={p.draft} /><span className="gh-note">#{p.number}</span></p>
              <p className="gh-branches" title={branchPair(p)}><code>{p.head?.ref ?? "?"}</code><span aria-label="에서"> → </span><code>{p.base?.ref ?? "?"}</code></p>
              <p className="gh-card__text">
                {loginOf(p.user)} · {ago(p.created_at)} 열림{p.commits !== null && " · 커밋 " + p.commits + "개"}
              </p>
              <dl className="gh-facts">
                <div><dt>추가</dt><dd className="gh-add">+{p.additions ?? 0}</dd></div>
                <div><dt>삭제</dt><dd className="gh-del">−{p.deletions ?? 0}</dd></div>
                <div><dt>변경 파일</dt><dd>{p.changed_files ?? 0}</dd></div>
                {p.comments !== null && <div><dt>댓글</dt><dd>{p.comments}</dd></div>}
                {p.requested_reviewers.length > 0 && <div><dt>리뷰 요청</dt><dd>{p.requested_reviewers.map(loginOf).join(", ")}</dd></div>}
              </dl>
              <p className="gh-merge" data-tone={merge.tone}><Icon name={merge.tone === "warn" ? "warning" : merge.tone === "ok" ? "circle-check" : "info"} /><span>{merge.text}</span></p>
              <div className="gh-file__tools"><WebLink href={htmlUrl} /></div>
            </header>
            <FilterPills
              label="PR 보기"
              options={[{ id: "overview", label: "개요" }, { id: "files", label: "변경 파일 " + (p.changed_files ?? 0) }]}
              value={tab}
              onChange={(v) => setParams(withQuery(params, { tab: v === "files" ? "files" : undefined }), { replace: true })}
            />
            {tab === "overview" ? (
              <>
                {p.body ? <GhMarkdown base={{ owner, repo, file: "" }}>{p.body}</GhMarkdown> : <p className="gh-note">작성된 설명이 없어요.</p>}
                {p.body_truncated && <p className="gh-note">본문이 길어 앞부분만 보여 줘요. 전체는 GitHub 에서 열어 보세요.</p>}
              </>
            ) : (
              <PullFiles owner={owner} repo={repo} number={number} changed={p.changed_files ?? 0} />
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
