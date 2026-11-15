import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { GhApiError } from "../../api/githubClient";
import { getAppraisal, listAppraisals, raDetailKey, raHistoryKey } from "../../api/repoAppraisalClient";
import type { AppraisalDetail, AppraisalHistory } from "../../api/repoAppraisalTypes";
import { isActive } from "./format";

const HISTORY_STALE = 30_000;
/** 완료된 평가는 바뀌지 않는다. 시작 응답을 캐시에 넣으면 상세에서 다시 묻지 않는다. */
const DONE_STALE = 5 * 60_000;
const POLL_START_MS = 2000;
const POLL_MAX_MS = 10_000;

/**
 * 폴링 간격. 2초부터 1.5배씩 완만히 늘리고 10초에서 멈춘다.
 * 완료·실패·조회 불가(404·403)에서 멈추고, 언마운트에서는 react-query 가 정리한다.
 */
export function pollInterval(data: AppraisalDetail | undefined, error: unknown, updates: number): number | false {
  if (error instanceof GhApiError && (error.status === 404 || error.status === 403)) return false;
  if (data && !isActive(data.status)) return false;
  return Math.min(POLL_START_MS * Math.pow(1.5, Math.max(0, updates - 1)), POLL_MAX_MS);
}

/** 평가 상세. 진행 중이면 위 간격으로 폴링한다. */
export function useAppraisal(id: string): UseQueryResult<AppraisalDetail> {
  return useQuery({
    queryKey: raDetailKey(id),
    queryFn: ({ signal }) => getAppraisal(id, signal),
    // 폴링 간격은 refetchInterval 이 정하므로 staleTime 은 길어도 진행 추적에 영향이 없다.
    staleTime: DONE_STALE,
    refetchInterval: (q) => pollInterval(q.state.data, q.state.error, q.state.dataUpdateCount),
    retry: false,
  });
}

/** 같은 저장소의 이전 평가 목록. 상세에서 owner/repo 를 안 뒤에 켠다. */
export function useAppraisalHistory(owner: string | null, repo: string | null): UseQueryResult<AppraisalHistory> {
  return useQuery({
    queryKey: raHistoryKey(owner ?? "", repo ?? ""),
    queryFn: ({ signal }) => listAppraisals(owner as string, repo as string, 20, signal),
    enabled: !!owner && !!repo,
    staleTime: HISTORY_STALE,
    retry: false,
  });
}
