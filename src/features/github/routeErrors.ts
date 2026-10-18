import { GhApiError } from "../../api/githubClient";

/** 주소 조각이 이름 규칙에 맞지 않을 때, 서버를 부르지 않고 같은 "찾을 수 없음" 상태를 보인다. */
export const notFoundError = (): GhApiError => new GhApiError({ status: 404, code: "gh_not_found", message: "not found" });
