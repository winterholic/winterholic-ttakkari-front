import { useParams } from "react-router";
import { ghOwner, ghOwnerRepos } from "../../../api/githubClient";
import { useGhInfinite, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { githubWebUrl, isOwner } from "../links";
import { GhErrorState, InfiniteView, QueryView } from "../state/StateView";
import { ProfileCard, RepoUl } from "./RepoList";
import { notFoundError } from "../routeErrors";

/** /github/:owner — 사용자와 조직을 응답의 type 으로 구분해 같은 화면에서 보여 준다. */
export function OwnerPage() {
  const { owner = "" } = useParams();
  const { account } = useGh();
  const valid = isOwner(owner);
  const profile = useGhQuery(account, ["owner", owner], () => ghOwner(account, owner), { enabled: valid });
  const repos = useGhInfinite(account, ["owner-repos", owner], (page) => ghOwnerRepos(account, owner, { page }), { enabled: valid });
  const web = githubWebUrl({ kind: "owner", owner });
  if (!valid) return <GhErrorState error={notFoundError()} />;
  return (
    <div className="gh-stack">
      <QueryView query={profile} skeleton="card" label="프로필을 불러오는 중" githubUrl={web}>
        {(p) => <ProfileCard profile={p} />}
      </QueryView>
      <section className="gh-section" aria-labelledby="gh-owner-repos">
        <h2 id="gh-owner-repos" className="gh-section__title">저장소</h2>
        <InfiniteView query={repos} label="저장소를 불러오는 중" empty={{ icon: "folder", title: "볼 수 있는 저장소가 없어요", text: "공개 저장소가 없거나 이 계정에 권한이 없어요." }} githubUrl={web}>
          {(items) => <RepoUl repos={items} />}
        </InfiniteView>
      </section>
    </div>
  );
}
