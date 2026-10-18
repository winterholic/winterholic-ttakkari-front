import { Route, Routes } from "react-router";
import { CodePage } from "../features/github/code/CodePage";
import { GithubShell } from "../features/github/GithubShell";
import { GithubHome } from "../features/github/home/GithubHome";
import { OwnerPage } from "../features/github/home/OwnerPage";
import { RepoLayout } from "../features/github/repo/RepoLayout";
import { RepoOverview } from "../features/github/repo/RepoOverview";

/** 부가 기능 > GitHub(/github/*). 조회 전용이며 계정은 `?as=<login>` 으로 모든 경로에 유지한다(백엔드 ADR 0042). */
export function GithubPage() {
  return (
    <Routes>
      <Route element={<GithubShell />}>
        <Route index element={<GithubHome />} />
        <Route path=":owner" element={<OwnerPage />} />
        <Route path=":owner/:repo" element={<RepoLayout />}>
          <Route index element={<RepoOverview />} />
          <Route path="code" element={<CodePage />} />
        </Route>
      </Route>
    </Routes>
  );
}
