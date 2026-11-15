import { Route, Routes } from "react-router";
import { DetailScreen } from "../features/repo-appraisal/DetailScreen";
import { StartScreen } from "../features/repo-appraisal/StartScreen";

/** 부가 기능 > 저장소 평가(/repo-appraisal/*). 시작 화면과 평가 상세 두 화면이다. 계정은 `?as=<login>` 으로 유지한다. */
export function RepoAppraisalPage() {
  return (
    <Routes>
      <Route index element={<StartScreen />} />
      <Route path=":id" element={<DetailScreen />} />
    </Routes>
  );
}
