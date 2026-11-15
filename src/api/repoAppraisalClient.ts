import { apiUrl, getAccessToken, refreshOrLose, toApiError } from "./client";
import { GhApiError } from "./githubClient";
import type {
  AppraisalDetail, AppraisalHistory, AppraisalStartIn, AppraisalStartOut,
} from "./repoAppraisalTypes";

// 저장소 평가 전용 호출 계층. GitHub 상류 오류는 앱 세션과 무관하므로,
// `client.ts` 의 공통 요청(401 이면 refresh·실패하면 로그아웃)을 쓰지 않고 `githubClient` 와 같은 코드 가드를 둔다.
// 백엔드는 상류 401 을 502 로 바꾸지만(github/errors.py), 혹시 401 로 와도 여기서 걸러 로그아웃하지 않는다.

/** 평가 상세·이력의 쿼리 키. 시작 응답을 상세 캐시에 미리 넣어 두는 데도 쓴다. */
export const raDetailKey = (id: string): readonly [string, string] => ["repo-appraisal", id] as const;
export const raHistoryKey = (owner: string, repo: string): readonly [string, string, string, string] =>
  ["repo-appraisal", "history", owner, repo] as const;

type QueryValue = string | number | undefined | null;

const UPSTREAM_CODE = /^(gh_|account_|no_account$|invalid_target$|unsupported_host$|not_found$)/;

function buildUrl(path: string, query: Record<string, QueryValue>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  return apiUrl(path) + (qs.size ? `?${qs}` : "");
}

async function toRaError(res: Response): Promise<GhApiError> {
  const base = await toApiError(res);
  return new GhApiError({ status: res.status, code: base.code, message: base.message });
}

interface ReqOpts {
  query?: Record<string, QueryValue>;
  json?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, o: ReqOpts = {}): Promise<{ status: number; data: T }> {
  const url = buildUrl(path, o.query ?? {});
  const send = (token: string | null) =>
    fetch(url, {
      method,
      headers: { ...(o.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: o.json !== undefined ? JSON.stringify(o.json) : undefined,
      credentials: "include",
      signal: o.signal,
    });
  let res: Response;
  try {
    const sentWith = getAccessToken();
    res = await send(sentWith);
    if (res.status === 401) {
      const err = await toRaError(res);
      // GitHub 쪽 만료·권한 문제는 앱 세션과 무관하다. 로그아웃도 refresh 도 하지 않는다.
      if (UPSTREAM_CODE.test(err.code)) throw err;
      const token = getAccessToken() !== sentWith && getAccessToken() ? getAccessToken() : await refreshOrLose();
      res = await send(token);
    }
  } catch (e) {
    if (e instanceof GhApiError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // refreshOrLose 가 던진 앱 인증 실패는 이미 로그아웃 처리가 끝났다.
    if (e instanceof Error && e.name === "ApiError") throw new GhApiError({ status: 401, code: "app_unauthorized", message: e.message });
    throw new GhApiError({ status: 0, code: "network", message: "Mac Studio 에 연결하지 못했어요. 네트워크를 확인해 주세요." });
  }
  if (!res.ok) throw await toRaError(res);
  return { status: res.status, data: (await res.json()) as T };
}

/** 평가 시작. 같은 조건의 완료 결과가 있으면 200 으로 그 결과를, 없으면 202 로 새 실행을 돌려준다. */
export async function startAppraisal(body: AppraisalStartIn): Promise<AppraisalStartOut> {
  const { status, data } = await request<AppraisalDetail>("POST", "/api/repo-appraisals", { json: body });
  return { reused: status === 200, appraisal: data };
}

export async function getAppraisal(id: string, signal?: AbortSignal): Promise<AppraisalDetail> {
  const { data } = await request<AppraisalDetail>("GET", `/api/repo-appraisals/${encodeURIComponent(id)}`, { signal });
  return data;
}

export async function listAppraisals(owner: string, repo: string, limit = 20, signal?: AbortSignal): Promise<AppraisalHistory> {
  const { data } = await request<AppraisalHistory>("GET", "/api/repo-appraisals", { query: { owner, repo, limit }, signal });
  return data;
}
