import { Route, Routes } from "react-router";
import { JobLogPage } from "../features/github/actions/JobLogPage";
import { RunDetailPage } from "../features/github/actions/RunDetailPage";
import { RunListPage } from "../features/github/actions/RunListPage";
import { CodePage } from "../features/github/code/CodePage";
import { GithubShell } from "../features/github/GithubShell";
import { GithubHome } from "../features/github/home/GithubHome";
import { OwnerPage } from "../features/github/home/OwnerPage";
import { IssueDetailPage } from "../features/github/issues/IssueDetailPage";
import { IssueListPage } from "../features/github/issues/IssueListPage";
import { PullDetailPage } from "../features/github/pulls/PullDetailPage";
import { PullListPage } from "../features/github/pulls/PullListPage";
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
          <Route path="pulls" element={<PullListPage />} />
          <Route path="pulls/:number" element={<PullDetailPage />} />
          <Route path="issues" element={<IssueListPage />} />
          <Route path="issues/:number" element={<IssueDetailPage />} />
          <Route path="actions" element={<RunListPage />} />
          <Route path="actions/runs/:id" element={<RunDetailPage />} />
          <Route path="actions/runs/:id/jobs/:jobId" element={<JobLogPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
