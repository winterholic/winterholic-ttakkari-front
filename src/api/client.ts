import type {
  AccountIn,
  AccountPool,
  AccountOut,
  AccountPatch,
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
  /** 배열은 같은 이름으로 여러 번 붙인다(?tag=a&tag=b). */
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  json?: unknown;
  form?: FormData;
  /** 바이트 그대로 보낼 본문(파일 조각). */
  blob?: Blob;
  signal?: AbortSignal;
  /** 로그인·refresh·logout 은 Bearer 도 401 재시도도 쓰지 않는다. */
  noAuth?: boolean;
}

async function raw(path: string, o: ReqOpts): Promise<Response> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(o.query ?? {})) {
    if (Array.isArray(v)) for (const x of v) qs.append(k, x);
    else if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const url = apiUrl(path) + (qs.size ? `?${qs}` : "");

  const send = (token: string | null) => {
    const headers: Record<string, string> = {};
    if (o.json !== undefined) headers["Content-Type"] = "application/json";
    if (o.blob) headers["Content-Type"] = "application/octet-stream";
    if (token && !o.noAuth) headers.Authorization = `Bearer ${token}`;
    return fetch(url, {
      method: o.method ?? "GET",
      headers,
      body: o.blob ?? o.form ?? (o.json !== undefined ? JSON.stringify(o.json) : undefined),
      credentials: "include",
      signal: o.signal,
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
/** 서버가 알아서 만드는 기본 워크스페이스. 사용자는 워크스페이스를 고르지 않는다. */
export const getDefaultWorkspace = (): Promise<WorkspaceOut> => json("/api/workspaces/default");
export const patchWorkspace = (id: UUID, body: WorkspacePatch): Promise<WorkspaceOut> =>
  json(`/api/workspaces/${id}`, { method: "PATCH", json: body });
export const listFiles = (id: UUID, path = ".", showHidden = false): Promise<DirListing> =>
  json(`/api/workspaces/${id}/files`, { query: { path, show_hidden: showHidden } });
export const searchFiles = (id: UUID, q: string): Promise<FileEntry[]> =>
  json(`/api/workspaces/${id}/search`, { query: { q } });

// ---- sessions
export const listSessions = (p: { workspace_id?: UUID; include_archived?: boolean; limit?: number; parent_id?: UUID; pool?: AccountPool } = {}): Promise<SessionOut[]> =>
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

/** 이 기기의 파일을 올린다. 결과 ID 를 다음 Run 의 context_artifact_ids 에 넣으면 에이전트가 읽는다. */
export function uploadFile(file: File, workspaceId: UUID, sessionId?: UUID | null): Promise<ArtifactOut> {
  const form = new FormData();
  form.set("file", file);
  form.set("workspace_id", workspaceId);
  if (sessionId) form.set("session_id", sessionId);
  return json("/api/uploads", { method: "POST", form });
}

// ---- system
export const systemInfo = (): Promise<SystemInfo> => json("/api/system/info");
export const stopAll = (): Promise<StopAllOut> => json("/api/system/stop-all", { method: "POST" });

// ---- engine accounts
export const listAccounts = (): Promise<AccountOut[]> => json("/api/accounts");
export const createAccount = (body: AccountIn): Promise<AccountOut> => json("/api/accounts", { method: "POST", json: body });
export const patchAccount = (id: UUID, body: AccountPatch): Promise<AccountOut> =>
  json(`/api/accounts/${id}`, { method: "PATCH", json: body });
export const deleteAccount = (id: UUID): Promise<void> => json(`/api/accounts/${id}`, { method: "DELETE" });
export const reorderAccounts = (ids: UUID[]): Promise<AccountOut[]> =>
  json("/api/accounts/reorder", { method: "POST", json: { ids } });
export const clearAccountCooldown = (id: UUID): Promise<AccountOut> =>
  json(`/api/accounts/${id}/cooldown/clear`, { method: "POST" });

// ---- 폰 → 컴퓨터 파일 보내기
export interface TransferStartIn {
  filename: string;
  size: number;
  dest_dir: string;
  convert_heic: boolean;
  strip_location: boolean;
  keep_original: boolean;
}
export interface TransferOut {
  id: string;
  received: number;
  size: number;
  chunk_size: number;
}
export interface DeliveredFile {
  path: string;
  name: string;
  size: number;
  artifact_id: string | null;
}
export interface TransferDone {
  files: DeliveredFile[];
  notes: string[];
}
export interface FolderRef {
  name: string;
  path: string;
}
export interface FoldersOut {
  path: string | null;
  parent: string | null;
  roots: FolderRef[];
  dirs: FolderRef[];
  default: string;
  can_write: boolean;
}
export interface TransferTokenOut {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  token: string | null;
}
export const startTransfer = (body: TransferStartIn): Promise<TransferOut> => json("/api/transfers", { method: "POST", json: body });
export const transferStatus = (id: string): Promise<TransferOut> => json(`/api/transfers/${id}`);
export const putTransferChunk = (id: string, offset: number, blob: Blob, signal?: AbortSignal): Promise<TransferOut> =>
  json(`/api/transfers/${id}`, { method: "PUT", query: { offset }, blob, signal });
export const completeTransfer = (id: string): Promise<TransferDone> => json(`/api/transfers/${id}/complete`, { method: "POST" });
export const cancelTransfer = (id: string): Promise<void> => json(`/api/transfers/${id}`, { method: "DELETE" });
export const transferFolders = (path?: string): Promise<FoldersOut> => json("/api/transfers/folders", { query: { path } });
export const makeTransferFolder = (path: string): Promise<FolderRef> => json("/api/transfers/folders", { method: "POST", json: { path } });
export const listTransferTokens = (): Promise<TransferTokenOut[]> => json("/api/transfer-tokens");
export const createTransferToken = (name: string): Promise<TransferTokenOut> => json("/api/transfer-tokens", { method: "POST", json: { name } });
export const revokeTransferToken = (id: string): Promise<void> => json(`/api/transfer-tokens/${id}`, { method: "DELETE" });


// ---- 비서 관리(ADR 0007)
export type MemoryKind = "fact" | "preference" | "decision" | "event" | "instruction" | "note";
export type EntityType = "person" | "project" | "org" | "place" | "tool" | "topic" | "preference" | "other";
export interface AssistantStatus {
  embedder: string;
  model: string | null;
  ready: boolean;
  counts: { memories: number; entities: number; relations: number; documents: number; chunks: number };
  brief: string;
}
export interface MemoryOut {
  id: string;
  kind: MemoryKind;
  content: string;
  pinned: boolean;
  source: string;
  entities: string[];
  created_at: string;
}
export interface EntityOut {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  summary: string | null;
  pinned: boolean;
}
export interface EntityDetail extends EntityOut {
  relations: { subject: string | null; predicate: string; object: string | null; note: string | null }[];
  memories: { id: string; kind: string; content: string }[];
}
export interface SourceOut {
  id: string;
  path: string;
  pattern: string;
  enabled: boolean;
  documents: number;
  chunks: number;
  last_indexed_at: string | null;
  last_error: string | null;
  indexing: boolean;
}
export interface RecallHit {
  type: "memory" | "chunk" | "entity";
  id: string;
  score: number;
  text: string;
  path?: string;
  heading?: string | null;
  kind?: string;
  entity_type?: string;
  name?: string;
}
export interface ToolInfo {
  name: string;
  group: string;
  who: string;
  desc: string;
}
const A = "/api/assistant";
export const assistantStatus = (): Promise<AssistantStatus> => json(`${A}/status`);
export const getInstructions = (): Promise<{ text: string }> => json(`${A}/instructions`);
export const putInstructions = (text: string): Promise<{ text: string }> => json(`${A}/instructions`, { method: "PUT", json: { text } });
export const listMemories = (p: { q?: string; kind?: MemoryKind; pinned?: boolean } = {}): Promise<{ memories: MemoryOut[] }> =>
  json(`${A}/memories`, { query: p });
export const addMemory = (body: { content: string; kind: MemoryKind; entities: string[]; pinned: boolean }): Promise<MemoryOut> =>
  json(`${A}/memories`, { method: "POST", json: body });
export const patchMemory = (id: string, body: Partial<Pick<MemoryOut, "content" | "kind" | "pinned">>): Promise<MemoryOut> =>
  json(`${A}/memories/${id}`, { method: "PATCH", json: body });
export const deleteMemory = (id: string): Promise<void> => json(`${A}/memories/${id}`, { method: "DELETE" });
export const listEntities = (p: { type?: EntityType; q?: string } = {}): Promise<{ entities: EntityOut[] }> => json(`${A}/entities`, { query: p });
export const getEntity = (id: string): Promise<EntityDetail> => json(`${A}/entities/${id}`);
export const addEntity = (body: { name: string; type: EntityType; summary?: string | null; pinned?: boolean }): Promise<EntityOut> =>
  json(`${A}/entities`, { method: "POST", json: body });
export const patchEntity = (id: string, body: { summary?: string | null; pinned?: boolean; type?: EntityType }): Promise<EntityOut> =>
  json(`${A}/entities/${id}`, { method: "PATCH", json: body });
export const deleteEntity = (id: string): Promise<void> => json(`${A}/entities/${id}`, { method: "DELETE" });
export const addRelation = (body: { subject: string; predicate: string; object: string }): Promise<{ id: string }> =>
  json(`${A}/relations`, { method: "POST", json: body });
export const listSources = (): Promise<{ sources: SourceOut[] }> => json(`${A}/sources`);
export const addSource = (path: string, pattern?: string): Promise<SourceOut> =>
  json(`${A}/sources`, { method: "POST", json: { path, pattern: pattern || "**/*.md" } });
export const reindexSource = (id: string): Promise<SourceOut> => json(`${A}/sources/${id}/reindex`, { method: "POST" });
export const deleteSource = (id: string): Promise<void> => json(`${A}/sources/${id}`, { method: "DELETE" });
export const recallTest = (query: string): Promise<{ results: RecallHit[] }> => json(`${A}/recall`, { method: "POST", json: { query, k: 8 } });
export const listTools = (): Promise<{ tools: ToolInfo[] }> => json(`${A}/tools`);

// ---- 계정 임시 우선순위·사용량
export interface OverrideOut {
  active: boolean;
  ids: string[];
  until: string | null;
}
export interface UsageWindow {
  key: string;
  label: string;
  percent: number;
  resets_at: number | null;
}
export interface AccountUsage {
  id: string;
  name: string;
  engine: "claude" | "codex";
  pool: AccountPool;
  enabled: boolean;
  rank: number;
  login: "ok" | "unknown" | "missing";
  cooldown_seconds: number;
  windows: UsageWindow[];
  /** Codex rate-limit 재설정 크레딧 */
  reset_credits?: { available: number; next_expires_at: number | null } | null;
  source: "api" | "stream" | "session_log" | null;
  plan: string | null;
  error: string | null;
  updated_at: number | null;
}
export const getOverride = (): Promise<OverrideOut> => json("/api/accounts/override");
export const putOverride = (ids: string[], until: string): Promise<OverrideOut> =>
  json("/api/accounts/override", { method: "PUT", json: { ids, until } });
export const deleteOverride = (): Promise<void> => json("/api/accounts/override", { method: "DELETE" });
export const accountUsage = (refresh = false): Promise<AccountUsage[]> => json("/api/accounts/usage", { query: { refresh } });
export const codexReset = (id: string): Promise<{ outcome: string; message: string }> =>
  json(`/api/accounts/${id}/codex-reset`, { method: "POST" });

// ---- 서버 리소스(사용자 메뉴). 바이트·퍼센트 그대로 받고 화면에서 단위를 붙인다.
export interface ResourceProcess {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_bytes: number;
  kind?: "backend" | "claude" | "codex" | "other";
}
export interface ResourceDisk {
  name: string;
  fstype: string;
  mounts: string[];
  total: number;
  used: number;
  free: number;
  percent: number;
  volumes: { mount: string; used: number }[];
}
export interface SystemResources {
  collected_at: number;
  host: { hostname: string; os: string; model: string | null; boot_time: number; uptime_seconds: number };
  cpu: {
    percent: number;
    per_core: number[];
    load_avg: number[];
    cores_logical: number;
    cores_physical: number | null;
    performance_cores: number | null;
    efficiency_cores: number | null;
    chip: string | null;
  };
  memory: {
    total: number;
    used: number;
    available: number;
    percent: number;
    wired: number | null;
    pressure: "normal" | "warn" | "critical" | null;
    pressure_free_percent: number | null;
    swap: { total: number; used: number; percent: number };
  };
  disks: ResourceDisk[];
  network: { rx_bytes_per_sec: number; tx_bytes_per_sec: number };
  processes: {
    top_cpu: ResourceProcess[];
    top_memory: ResourceProcess[];
    ttakkari: ResourceProcess[];
    ttakkari_total: { cpu_percent: number; memory_bytes: number };
  };
}
export const systemResources = (): Promise<SystemResources> => json("/api/system/resources");

// ---- 메모·캘린더(ADR 0008). 시각은 Asia/Seoul 벽시계 문자열이다(시간 `YYYY-MM-DDTHH:MM`, 종일 `YYYY-MM-DD`, 끝 날짜 포함).
export interface MemoSummary {
  id: string;
  title: string;
  tags: string[];
  /** null 이면 미분류. */
  category_id: string | null;
  pinned: boolean;
  source: "user" | "agent";
  rev: number;
  excerpt: string;
  created_at: string;
  updated_at: string;
}
export interface MemoOut extends MemoSummary {
  body: string;
}
export interface MemoPatch {
  title?: string;
  body?: string;
  tags?: string[];
  /** null 이면 미분류로 옮긴다. 빼면 그대로. */
  category_id?: string | null;
  pinned?: boolean;
  /** 마지막으로 본 버전. 서버와 다르면 409 conflict. */
  rev?: number;
}
/** 토큰 --tk-color-chart-categorical-1..6 순서. */
export const CATEGORY_COLORS = ["blue", "green", "amber", "violet", "red", "gray"] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];
export interface MemoCategory {
  id: string;
  name: string;
  color: CategoryColor | null;
  position: number;
  count: number;
}
export interface MemoCategoriesOut {
  categories: MemoCategory[];
  total: number;
  uncategorized: number;
}
export interface EventOut {
  id: string;
  title: string;
  description: string;
  location: string;
  all_day: boolean;
  start: string;
  end: string;
  /** 보류 전에 저장된 반복 규칙만 읽는다. 반복 입력은 보류(ADR 0008). */
  rrule: string | null;
  recurring: boolean;
  reminder: Reminder | null;
  /** 알림을 보낼 시각(서울 벽시계). */
  remind_at: string | null;
  reminder_sent: boolean;
  source: "user" | "agent";
  created_at: string;
  updated_at: string;
}
export interface EventIn {
  title: string;
  start: string;
  end?: string;
  all_day: boolean;
  description?: string;
  location?: string;
  /** null 이면 알림 없음. 시간 일정은 at_start~1d, 종일 일정은 day_9am·prev_day_9am. */
  reminder?: Reminder | null;
}
export type Reminder = "at_start" | "10m" | "30m" | "1h" | "1d" | "day_9am" | "prev_day_9am";
export type EventPatch = Partial<EventIn>;
export interface HolidayOut {
  date: string;
  name: string;
  substitute: boolean;
}

/** tags 는 모두 가진 메모만(AND). category 는 카테고리 id 또는 "none"(미분류). */
export const listMemos = (p: { q?: string; tags?: string[]; category?: string } = {}): Promise<{ memos: MemoSummary[] }> =>
  json("/api/memos", { query: { q: p.q, tag: p.tags, category: p.category, limit: 300 } });
export const listMemoTags = (category?: string): Promise<{ tags: { name: string; count: number }[] }> =>
  json("/api/memos/tags", { query: { category } });
export const createMemo = (body: { title?: string; body?: string; tags?: string[]; category_id?: string | null; pinned?: boolean } = {}): Promise<MemoOut> =>
  json("/api/memos", { method: "POST", json: body });
export const getMemo = (id: string): Promise<MemoOut> => json(`/api/memos/${id}`);
export const patchMemo = (id: string, body: MemoPatch): Promise<MemoOut> => json(`/api/memos/${id}`, { method: "PATCH", json: body });
export const deleteMemo = (id: string): Promise<void> => json(`/api/memos/${id}`, { method: "DELETE" });
export const listMemoCategories = (): Promise<MemoCategoriesOut> => json("/api/memo-categories");
export const createMemoCategory = (body: { name: string; color?: CategoryColor | null }): Promise<MemoCategory> =>
  json("/api/memo-categories", { method: "POST", json: body });
export const patchMemoCategory = (id: string, body: { name?: string; color?: CategoryColor | null }): Promise<MemoCategory> =>
  json(`/api/memo-categories/${id}`, { method: "PATCH", json: body });
export const orderMemoCategories = (ids: string[]): Promise<{ categories: MemoCategory[] }> =>
  json("/api/memo-categories/order", { method: "PUT", json: { ids } });
export const deleteMemoCategory = (id: string): Promise<void> => json(`/api/memo-categories/${id}`, { method: "DELETE" });

export const listEvents = (from: string, to: string): Promise<{ events: EventOut[] }> =>
  json("/api/calendar/events", { query: { from, to } });
export const listHolidays = (from: string, to: string): Promise<{ holidays: HolidayOut[] }> =>
  json("/api/calendar/holidays", { query: { from, to } });
export const getEvent = (id: string): Promise<EventOut> => json(`/api/calendar/events/${id}`);
export const createEvent = (body: EventIn): Promise<EventOut> => json("/api/calendar/events", { method: "POST", json: body });
export const patchEvent = (id: string, body: EventPatch): Promise<EventOut> =>
  json(`/api/calendar/events/${id}`, { method: "PATCH", json: body });
export const deleteEvent = (id: string): Promise<void> => json(`/api/calendar/events/${id}`, { method: "DELETE" });
