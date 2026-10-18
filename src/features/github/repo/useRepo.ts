import { useParams } from "react-router";
import { ghRepo } from "../../../api/githubClient";
import { useGhQuery } from "../data";
import { useGh } from "../GithubContext";
import { isOwner, isRepo } from "../links";

/** 라우트의 `:owner/:repo`. 이름 규칙에 어긋나면 서버를 부르지 않는다. */
export function useRepoParams(): { owner: string; repo: string; valid: boolean } {
  const { owner = "", repo = "" } = useParams();
  return { owner, repo, valid: isOwner(owner) && isRepo(repo) };
}

/** 저장소 요약. 레이아웃과 하위 화면이 같은 키를 쓰므로 한 번만 가져온다. */
export function useRepo(owner: string, repo: string, enabled = true) {
  const { account } = useGh();
  return useGhQuery(account, ["repo", owner, repo], () => ghRepo(account, owner, repo), { enabled: enabled && isOwner(owner) && isRepo(repo) });
}
