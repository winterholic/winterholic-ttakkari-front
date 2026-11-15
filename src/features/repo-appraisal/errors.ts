import { GhApiError } from "../../api/githubClient";
import { describeGhError } from "../github/state/errors";
import type { GhErrorView } from "../github/state/errors";

const GH_KNOWN = /^(gh_|account_unavailable$|invalid_target$|unsupported_host$|network$|no_account$|gh_cli_missing$|ref_not_found$|readme_not_found$)/;

/**
 * 평가 화면의 오류 상태. GitHub 상류 코드는 탐색 화면과 같은 문구를 쓰고(`describeGhError`),
 * 평가 API 고유 코드(not_found·app_unauthorized)와 앱 권한(403)만 여기서 가른다.
 * 없음(404)과 권한 없음(403)은 합치지 않는다. 보는 사람의 다음 행동이 다르기 때문이다.
 */
export function describeAppraisalError(error: unknown): GhErrorView {
  if (error instanceof GhApiError) {
    if (error.code === "not_found" || (error.status === 404 && error.code === "http_404")) {
      return { tone: "warning", title: "평가를 찾을 수 없어요", message: "주소를 확인해 주세요. 삭제됐거나 다른 기기에서 시작한 평가일 수 있어요.", retry: false, switchAccount: false, openOnGithub: false };
    }
    if (error.code === "app_unauthorized" || error.status === 401) {
      return { tone: "danger", title: "다시 로그인해 주세요", message: "따까리 로그인이 만료됐어요. 로그인하면 이어서 볼 수 있어요.", retry: false, switchAccount: false, openOnGithub: false };
    }
    if (error.status === 403) {
      return { tone: "warning", title: "볼 권한이 없어요", message: "이 평가는 지금 로그인한 계정으로 볼 수 없어요.", retry: false, switchAccount: false, openOnGithub: false };
    }
    if (GH_KNOWN.test(error.code)) return describeGhError(error);
    // 모르는 코드는 서버 문구를 살린다. 무엇을 고쳐야 할지 그 문장에만 있기 때문이다.
    return { tone: "danger", title: "불러오지 못했어요", message: error.message || "예상하지 못한 오류가 생겼어요. 다시 시도해 주세요.", retry: true, switchAccount: false, openOnGithub: false };
  }
  return describeGhError(error);
}
