import type {
  ApiErrorBody,
  ArtifactListParams,
  ArtifactOut,
  ArtifactRegisterIn,
  ArtifactVariant,
  DirListing,
  DownloadLinkOut,
  FileEntry,
  MeOut,
  RunEvent,
  RunIn,
  RunOut,
  SessionIn,
  SessionOut,
  SessionPatch,
  StopAllOut,
  SystemInfo,
  TokenOut,
  UUID,
  WorkspaceIn,
  WorkspaceOut,
  WorkspacePatch,
} from "./types";

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://127.0.0.1:8787";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly errors?: ApiErrorBody["errors"];
  readonly retryAfter?: number;

  constructor(status: number, body: ApiErrorBody, retryAfter?: number) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.errors = body.errors;
    this.retryAfter = retryAfter;
  }
}

// access token 은 XSS 노출을 줄이려 메모리에만 둔다. 새로고침 후에는 refresh 쿠키로 복구한다.
let accessToken: string | null = null;
let authLostHandler: (() => void) | null = null;
let refreshInFlight: Promise<string> | null = null;

export const getAccessToken = (): string | null => accessToken;
export const setAccessToken = (t: string | null): void => {
  accessToken = t;
};
export const onAuthLost = (cb: (() => void) | null): void => {
  authLostHandler = cb;
};

export const apiUrl = (path: string): string => `${API_BASE.replace(/\/$/, "")}${path}`;

export async function toApiError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = { code: `http_${res.status}`, message: res.statusText || `HTTP ${res.status}` };
  try {
    const j = (await res.json()) as Partial<ApiErrorBody> & { detail?: unknown };
    const d = j.detail;
    const src = typeof d === "object" && d !== null && "code" in d ? (d as Partial<ApiErrorBody>) : j;
    if (typeof src.code === "string" || typeof src.message === "string") {
      body = {
        code: src.code ?? body.code,
        message: src.message ?? body.message,
        errors: j.errors,
      };
    } else if (typeof d === "string") {
      body = { ...body, message: d };
    }
  } catch {
    // 본문이 JSON 이 아니면 상태 줄만 쓴다.
  }
  const ra = Number(res.headers.get("Retry-After"));
  return new ApiError(res.status, body, Number.isFinite(ra) && ra > 0 ? ra : undefined);
}

/** 동시 호출은 하나의 refresh 요청을 공유한다. 성공하면 새 access token 을 메모리에 저장한다. */
export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch(apiUrl("/api/auth/refresh"), { method: "POST", credentials: "include" });
      if (!res.ok) throw await toApiError(res);
      const t = (await res.json()) as { access_token: string };
      accessToken = t.access_token;
      return t.access_token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** refresh 를 시도하고, 실패하면 토큰을 비우고 onAuthLost 를 부른 뒤 던진다. */
export async function refreshOrLose(): Promise<string> {
  try {
    return await refreshAccessToken();
  } catch (e) {
    accessToken = null;
    authLostHandler?.();
    throw e;
  }
}

interface ReqOpts {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  /** 로그인·refresh·logout 은 Bearer 도 401 재시도도 쓰지 않는다. */
  noAuth?: boolean;
}

async function raw(path: string, o: ReqOpts): Promise<Response> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== null) qs.set(k, String(v));
  const url = apiUrl(path) + (qs.size ? `?${qs}` : "");

  const send = (token: string | null) => {
    const headers: Record<string, string> = {};
    if (o.json !== undefined) headers["Content-Type"] = "application/json";
    if (token && !o.noAuth) headers.Authorization = `Bearer ${token}`;
    return fetch(url, {
      method: o.method ?? "GET",
      headers,
      body: o.json !== undefined ? JSON.stringify(o.json) : undefined,
      credentials: "include",
    });
  };

  const sentWith = accessToken;
  let res = await send(sentWith);
  if (res.status === 401 && !o.noAuth) {
    // 다른 요청이 이미 토큰을 갱신했다면 refresh 없이 새 토큰으로 재요청만 한다.
    const token = accessToken !== sentWith && accessToken ? accessToken : await refreshOrLose();
    res = await send(token);
    if (res.status === 401) {
      accessToken = null;
      authLostHandler?.();
    }
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function json<T>(path: string, o: ReqOpts = {}): Promise<T> {
  const res = await raw(path, o);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

// ---- auth
export async function login(password: string): Promise<TokenOut> {
  const t = await json<TokenOut>("/api/auth/login", { method: "POST", json: { password }, noAuth: true });
  accessToken = t.access_token;
  return t;
}
export async function logout(): Promise<void> {
  try {
    await json<void>("/api/auth/logout", { method: "POST", noAuth: true });
  } finally {
    accessToken = null;
  }
}
/** 앱 시작 시 세션 복구용. 실패해도 onAuthLost 는 부르지 않고 던지기만 한다. */
export const refresh = (): Promise<string> => refreshAccessToken();
export const me = (): Promise<MeOut> => json("/api/auth/me");

// ---- workspaces
export const listWorkspaces = (includeArchived = false): Promise<WorkspaceOut[]> =>
  json("/api/workspaces", { query: { include_archived: includeArchived } });
export const createWorkspace = (body: WorkspaceIn): Promise<WorkspaceOut> =>
  json("/api/workspaces", { method: "POST", json: body });
export const getWorkspace = (id: UUID): Promise<WorkspaceOut> => json(`/api/workspaces/${id}`);
export const patchWorkspace = (id: UUID, body: WorkspacePatch): Promise<WorkspaceOut> =>
  json(`/api/workspaces/${id}`, { method: "PATCH", json: body });
export const listFiles = (id: UUID, path = ".", showHidden = false): Promise<DirListing> =>
  json(`/api/workspaces/${id}/files`, { query: { path, show_hidden: showHidden } });
export const searchFiles = (id: UUID, q: string): Promise<FileEntry[]> =>
  json(`/api/workspaces/${id}/search`, { query: { q } });

// ---- sessions
export const listSessions = (p: { workspace_id?: UUID; include_archived?: boolean; limit?: number } = {}): Promise<SessionOut[]> =>
  json("/api/sessions", { query: p });
export const createSession = (body: SessionIn): Promise<SessionOut> => json("/api/sessions", { method: "POST", json: body });
export const getSession = (id: UUID): Promise<SessionOut> => json(`/api/sessions/${id}`);
export const patchSession = (id: UUID, body: SessionPatch): Promise<SessionOut> =>
  json(`/api/sessions/${id}`, { method: "PATCH", json: body });

// ---- runs
export const listRuns = (sessionId: UUID): Promise<RunOut[]> => json(`/api/sessions/${sessionId}/runs`);
export const createRun = (sessionId: UUID, body: RunIn): Promise<RunOut> =>
  json(`/api/sessions/${sessionId}/runs`, { method: "POST", json: body });
export const getRun = (id: UUID): Promise<RunOut> => json(`/api/runs/${id}`);
export const cancelRun = (id: UUID): Promise<RunOut> => json(`/api/runs/${id}/cancel`, { method: "POST" });
export const runEvents = (id: UUID, after = 0, limit = 500): Promise<RunEvent[]> =>
  json(`/api/runs/${id}/events`, { query: { after, limit } });
export async function runDiff(id: UUID): Promise<string> {
  return (await raw(`/api/runs/${id}/diff`, {})).text();
}

// ---- artifacts
export const listArtifacts = (p: ArtifactListParams = {}): Promise<ArtifactOut[]> =>
  json("/api/artifacts", { query: { ...p } });
export const getArtifact = (id: UUID): Promise<ArtifactOut> => json(`/api/artifacts/${id}`);
export const registerArtifact = (body: ArtifactRegisterIn): Promise<ArtifactOut> =>
  json("/api/artifacts", { method: "POST", json: body });
export const deleteArtifact = (id: UUID): Promise<void> => json(`/api/artifacts/${id}`, { method: "DELETE" });
export const retryPreview = (id: UUID): Promise<ArtifactOut> =>
  json(`/api/artifacts/${id}/preview/retry`, { method: "POST" });
export async function contentBlob(id: UUID, variant: ArtifactVariant = "original"): Promise<Blob> {
  return (await raw(`/api/artifacts/${id}/content`, { query: { variant } })).blob();
}
/** 서명 링크를 받아 절대 URL 로 돌려준다. 이 URL 은 인증 헤더 없이 열린다(5분). */
export async function downloadLink(id: UUID, variant: ArtifactVariant = "original"): Promise<DownloadLinkOut> {
  const r = await json<DownloadLinkOut>(`/api/artifacts/${id}/download-link`, { method: "POST", query: { variant } });
  return { ...r, url: /^https?:\/\//.test(r.url) ? r.url : apiUrl(r.url) };
}

// ---- system
export const systemInfo = (): Promise<SystemInfo> => json("/api/system/info");
export const stopAll = (): Promise<StopAllOut> => json("/api/system/stop-all", { method: "POST" });
