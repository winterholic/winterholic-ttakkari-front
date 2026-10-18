import { useState } from "react";
import { Link } from "react-router";
import { ghMe, ghMyOrgs, ghMyRepos } from "../../../api/githubClient";
import { Icon } from "../../../ui/Icon";
import { useGhInfinite, useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { ghPath } from "../links";
import { InfiniteView, QueryView } from "../state/StateView";
import { TargetInput } from "../state/TargetInput";
import { ProfileCard, RepoUl } from "./RepoList";

type Sort = "pushed" | "updated" | "full_name";
const SORTS: { id: Sort; label: string }[] = [
  { id: "pushed", label: "최근 푸시" },
  { id: "updated", label: "최근 변경" },
  { id: "full_name", label: "이름" },
];

/** /github: 저장소 주소 입력, 내 프로필, 내가 속한 조직, 내 저장소. */
export function GithubHome() {
  const { account } = useGh();
  const [sort, setSort] = useState<Sort>("pushed");
  const me = useGhQuery(account, ["me"], () => ghMe(account));
  const orgs = useGhQuery(account, ["orgs"], () => ghMyOrgs(account));
  const repos = useGhInfinite(account, ["my-repos", sort], (page) => ghMyRepos(account, { sort, page }));
  return (
    <div className="gh-stack">
      <TargetInput />

      <section className="gh-section" aria-labelledby="gh-me-title">
        <h2 id="gh-me-title" className="gh-section__title">내 프로필</h2>
        <QueryView query={me} skeleton="card" label="프로필을 불러오는 중">
          {(profile) => (
            <>
              <ProfileCard profile={profile} heading="내 프로필" />
              <Link className="tk-button tk-button--ghost tk-button--sm gh-inline-link" to={ghPath(account, { owner: profile.login })}>
                <Icon name="user" /><span>내 페이지 열기</span>
              </Link>
            </>
          )}
        </QueryView>
      </section>

      <section className="gh-section" aria-labelledby="gh-orgs-title">
        <h2 id="gh-orgs-title" className="gh-section__title">조직</h2>
        <QueryView query={orgs} skeleton="list" label="조직을 불러오는 중" isEmpty={(d) => d.length === 0} empty={{ icon: "org", title: "속한 조직이 없어요", text: "이 계정이 볼 수 있는 조직이 없거나 조직 접근이 승인되지 않았어요." }}>
          {(list) => (
            <ul className="tk-list tk-list--inset">
              {list.map((o) => (
                <li key={o.login}>
                  <Link className="tk-list__item gh-row" to={ghPath(account, { owner: o.login })}>
                    <Icon name="org" />
                    <span className="tk-list__body">
                      <span className="tk-list__title tk-list__title--wrap">{o.login}</span>
                      {o.description && <span className="tk-list__snippet">{o.description}</span>}
                    </span>
                    <span className="tk-list__end"><Icon name="chevron-right" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </section>

      <section className="gh-section" aria-labelledby="gh-repos-title">
        <div className="gh-section__head">
          <h2 id="gh-repos-title" className="gh-section__title">내 저장소</h2>
          <div className="gh-pills" role="group" aria-label="정렬">
            {SORTS.map((s) => <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</button>)}
          </div>
        </div>
        <InfiniteView query={repos} label="저장소를 불러오는 중" empty={{ icon: "folder", title: "저장소가 없어요" }}>
          {(items) => <RepoUl repos={items} />}
        </InfiniteView>
      </section>
    </div>
  );
}
