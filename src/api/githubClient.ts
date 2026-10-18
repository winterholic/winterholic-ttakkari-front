import { apiUrl, getAccessToken, refreshOrLose, toApiError } from "./client";
import type {
  GhAccounts, GhBranch, GhComment, GhContent, GhEnvelope, GhIssue, GhIssueItem, GhIssueState, GhJob, GhLogWindow, GhOrg, GhProfile, GhPull, GhPullFile,
  GhPullItem, GhPullState, GhReadme, GhRepo, GhRepoItem, GhResolved, GhRun,
} from "./githubTypes";

// GitHub 탐색 전용 호출 계층. `client.ts` 의 공통 요청은 401 이면 앱 세션을 로그아웃시키므로 쓰지 않는다.
// 백엔드가 GitHub 상류 401 을 `gh_*` 코드로 내려도(ADR 0042 §5.9 는 502 이지만) 그 응답이 앱 로그아웃으로 번지지 않게 코드로 가른다.
// 토큰은 프론트가 다루지 않는다. 여기서 쓰는 Bearer 는 앱 자신의 세션 토큰뿐이다.

export class GhApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly reason?: string;
  /** 한도 초기화 시각(Unix 초). */
  readonly reset?: number;
  /** `Retry-After` 초. */
  readonly retryAfter?: number;

  constructor(o: { status: number; code: string; message: string; reason?: string; reset?: number; retryAfter?: number }) {
    super(o.message);
    this.name = "GhApiError";
    this.status = o.status;
    this.code = o.code;
    this.reason = o.reason;
    this.reset = o.reset;
    this.retryAfter = o.retryAfter;
  }
}

// 계정 목록 쿼리 키. 계정별 키(["github", login, …])와 겹치지 않게 따로 둔다(login 이 "accounts" 일 수 있다).
export const GH_ACCOUNTS_KEY = ["github-accounts"] as const;

type QueryValue =string | number | undefined | null;

const UPSTREAM_CODE = /^(gh_|account_|no_account$|invalid_target$|unsupported_host$)/;

/** 모든 GitHub 화면의 쿼리 키는 선택 계정으로 시작한다. 계정이 다르면 캐시가 절대 공유되지 않는다. */
export const ghKey = (account: string, ...parts: (string | number | undefined)[]): (string | number | undefined)[] => ["github", account, ...parts];

function buildUrl(path: string, query: Record<string, QueryValue>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  return apiUrl(path) + (qs.size ? `?${qs}` : "");
}

async function toGhError(res: Response): Promise<GhApiError> {
  const base = await toApiError(res.clone());
  let reason: string | undefined;
  let reset: number | undefined;
  try {
    const j = (await res.json()) as Record<string, unknown>;
    const d = typeof j.detail === "object" && j.detail !== null ? (j.detail as Record<string, unknown>) : j;
    if (typeof d.reason === "string") reason = d.reason;
    if (typeof d.reset === "number") reset = d.reset;
  } catch {
    // 본문이 JSON 이 아니면 상태 줄만 쓴다.
  }
  return new GhApiError({ status: res.status, code: base.code, message: base.message, reason, reset, retryAfter: base.retryAfter });
}

async function request<T>(path: string, query: Record<string, QueryValue>, signal?: AbortSignal): Promise<T> {
  const url = buildUrl(path, query);
  const send = (token: string | null) =>
    fetch(url, { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include", signal });
  let res: Response;
  try {
    const sentWith = getAccessToken();
    res = await send(sentWith);
    if (res.status === 401) {
      const err = await toGhError(res);
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
  if (!res.ok) throw await toGhError(res);
  return (await res.json()) as T;
}

const seg = encodeURIComponent;
const repoPath = (o: string, r: string) => `/api/github/repos/${seg(o)}/${seg(r)}`;
const get = <T>(path: string, account: string, query: Record<string, QueryValue> = {}, signal?: AbortSignal) =>
  request<GhEnvelope<T>>(path, { account, ...query }, signal);

// ---- 계정·입력 해석(account 불필요)
export const ghAccounts = (): Promise<GhAccounts> => request("/api/github/accounts", {});
export const ghResolve = (q: string): Promise<GhResolved> => request("/api/github/resolve", { q });

// ---- 내 정보·소유자
export const ghMe = (account: string) => get<GhProfile>("/api/github/me", account);
export const ghMyOrgs = (account: string) => get<GhOrg[]>("/api/github/me/orgs", account);
export const ghMyRepos = (account: string, q: { sort?: string; page?: number } = {}) => get<GhRepoItem[]>("/api/github/me/repos", account, q);
export const ghOwner = (account: string, login: string) => get<GhProfile>(`/api/github/owners/${seg(login)}`, account);
export const ghOwnerRepos = (account: string, login: string, q: { page?: number } = {}) => get<GhRepoItem[]>(`/api/github/owners/${seg(login)}/repos`, account, q);

// ---- 저장소·코드
export const ghRepo = (account: string, o: string, r: string) => get<GhRepo>(repoPath(o, r), account);
export const ghBranches = (account: string, o: string, r: string, q: { page?: number } = {}) => get<GhBranch[]>(`${repoPath(o, r)}/branches`, account, q);
export const ghContents = (account: string, o: string, r: string, q: { ref?: string; path?: string }) => get<GhContent>(`${repoPath(o, r)}/contents`, account, q);
export const ghReadme = (account: string, o: string, r: string, q: { ref?: string }) => get<GhReadme>(`${repoPath(o, r)}/readme`, account, q);

// ---- PR·이슈
export const ghPulls = (account: string, o: string, r: string, q: { state?: GhPullState; page?: number }) => get<GhPullItem[]>(`${repoPath(o, r)}/pulls`, account, q);
export const ghPull = (account: string, o: string, r: string, n: number | string) => get<GhPull>(`${repoPath(o, r)}/pulls/${seg(String(n))}`, account);
export const ghPullFiles = (account: string, o: string, r: string, n: number | string, q: { page?: number }) =>
  get<GhPullFile[]>(`${repoPath(o, r)}/pulls/${seg(String(n))}/files`, account, q);
export const ghIssues = (account: string, o: string, r: string, q: { state?: GhIssueState; labels?: string; page?: number }) =>
  get<GhIssueItem[]>(`${repoPath(o, r)}/issues`, account, q);
export const ghIssue = (account: string, o: string, r: string, n: number | string) => get<GhIssue>(`${repoPath(o, r)}/issues/${seg(String(n))}`, account);
export const ghComments = (account: string, o: string, r: string, n: number | string, q: { page?: number }) =>
  get<GhComment[]>(`${repoPath(o, r)}/issues/${seg(String(n))}/comments`, account, q);

// ---- Actions
export const ghRuns = (account: string, o: string, r: string, q: { status?: string; branch?: string; event?: string; page?: number }) =>
  get<GhRun[]>(`${repoPath(o, r)}/actions/runs`, account, q);
export const ghRun = (account: string, o: string, r: string, id: string) => get<GhRun>(`${repoPath(o, r)}/actions/runs/${seg(id)}`, account);
export const ghRunJobs = (account: string, o: string, r: string, id: string, q: { page?: number } = {}) =>
  get<GhJob[]>(`${repoPath(o, r)}/actions/runs/${seg(id)}/jobs`, account, q);
export const ghJobLogs = (account: string, o: string, r: string, jobId: string, q: { from_line?: number; lines?: number }) =>
  get<GhLogWindow>(`${repoPath(o, r)}/actions/jobs/${seg(jobId)}/logs`, account, q);
