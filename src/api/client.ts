import type {
  AccountIn,
  AccountPool,
  AccountOut,
  AccountPatch,
  ApiErrorBody,
  ArtifactArea,
  ArtifactListParams,
  ArtifactOut,
  ArtifactRegisterIn,
  ArtifactVariant,
  DeskFeedbackIn,
  DeskFeedbackOut,
  DirListing,
  DownloadLinkOut,
  FileEntry,
  MeOut,
  PmsDashboard,
  PmsMilestone,
  PmsNote,
  PmsNoteIn,
  PmsNotePatch,
  PmsProject,
  PmsProjectIn,
  PmsProjectPatch,
  PmsProjectStatus,
  PmsScope,
  PmsTask,
  PmsTaskIn,
  PmsTaskPatch,
  PmsTaskResult,
  RunEvent,
  RunIn,
  RunOut,
  SessionIn,
  SessionOut,
  TaskForest,
  TaskHit,
  TaskLibrary,
  TaskTreeOut,
  SessionPatch,
  StopAllOut,
  SystemInfo,
  TokenOut,
  ISODateTime,
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
/** 모드(개인·회사)마다 하나뿐인 따까리 대화. 없으면 서버가 만든다. */
export const ensureDesk = (pool: AccountPool): Promise<SessionOut> => json("/api/desk", { method: "POST", json: { pool } });
export const patchSession = (id: UUID, body: SessionPatch): Promise<SessionOut> =>
  json(`/api/sessions/${id}`, { method: "PATCH", json: body });

// ---- 작업 트리(back ADR 0014)
export const activeTasks = (recentHours?: number): Promise<TaskForest> =>
  json("/api/tasks/active", { query: { recent_hours: recentHours } });
export const taskLibrary = (p: { pool?: AccountPool; before?: ISODateTime; limit?: number } = {}): Promise<TaskLibrary> =>
  json("/api/tasks/library", { query: p });
export const searchTasks = (q: string, pool?: AccountPool): Promise<TaskHit[]> => json("/api/tasks/search", { query: { q, pool } });
export const taskTree = (sessionId: UUID): Promise<TaskTreeOut> => json(`/api/tasks/${sessionId}/tree`);

// ---- runs
/** limit 을 주면 최근 limit 개만 시간순으로 온다(접수 대화는 하나뿐이라 끝없이 길어진다). */
export const listRuns = (sessionId: UUID, p: { limit?: number; before?: ISODateTime } = {}): Promise<RunOut[]> =>
  json(`/api/sessions/${sessionId}/runs`, { query: p });
export const createRun = (sessionId: UUID, body: RunIn): Promise<RunOut> =>
  json(`/api/sessions/${sessionId}/runs`, { method: "POST", json: body });
export const getRun = (id: UUID): Promise<RunOut> => json(`/api/runs/${id}`);
export const cancelRun = (id: UUID): Promise<RunOut> => json(`/api/runs/${id}/cancel`, { method: "POST" });
export const putDeskFeedback = (runId: UUID, body: DeskFeedbackIn): Promise<DeskFeedbackOut> =>
  json(`/api/runs/${runId}/desk-feedback`, { method: "POST", json: body });
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
export const moveArtifact = (id: UUID, area: ArtifactArea): Promise<ArtifactOut> =>
  json(`/api/artifacts/${id}`, { method: "PATCH", json: { area } });
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
/** pool 모드의 기본 순서. work 는 회사에 들어온 계정만 보내고 그 모드 목록을 돌려받는다. */
export const reorderAccounts = (ids: UUID[], pool: AccountPool = "personal"): Promise<AccountOut[]> =>
  json("/api/accounts/reorder", { method: "POST", json: { ids }, query: { pool } });
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

// ---- meetings (ADR 0010). 원본: back/src/ttakkari/api/meetings.py, back/docs/api-contract.md
export type MeetingStatus = "uploaded" | "transcribing" | "transcribed" | "analyzing" | "analyzed" | "review" | "failed";
export type MeetingItemKind = "discussion" | "decision" | "action" | "open_issue";
export type MeetingItemStatus = "open" | "done" | "cancelled";
export type MeetingScope = "personal" | "work";
export interface MeetingCounts { discussion: number; decision: number; action: number; open_issue: number; pending_proposals: number }
export interface MeetingSummary {
  id: string;
  title: string;
  scope: MeetingScope;
  status: MeetingStatus;
  failed_stage: "transcription" | "analysis" | null;
  error: string | null;
  project: { id: string; name: string } | null;
  held_at: string | null;
  participants: string[];
  source: "audio" | "text";
  provider: string | null;
  audio: { artifact_id: string; filename: string; size_bytes: number } | null;
  transcript_chars: number;
  transcript_source: string | null;
  summary: string | null;
  counts: MeetingCounts;
  analysis_run_id: string | null;
  analysis_session_id: string | null;
  created_at: string;
  updated_at: string;
  analyzed_at: string | null;
}
export interface MeetingConflict { ref: string; type: "memory" | "action"; target_id: string; text: string; reason: string; change: "supersede" | "cancel" | "revise"; new_text: string | null }
export interface MeetingItem {
  id: string;
  kind: MeetingItemKind;
  position: number;
  text: string;
  detail: string | null;
  owner: string | null;
  due: string | null;
  evidence: string | null;
  status: MeetingItemStatus;
  conflicts: MeetingConflict[];
}
export type MeetingProposalKind = "add_memory" | "supersede_memory" | "update_action_item";
export interface MeetingProposal {
  id: string;
  item_id: string | null;
  kind: MeetingProposalKind;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  /** add_memory·supersede_memory: content, memory_kind, targets[{id, content}]. update_action_item: target_text, change, new_text, target_meeting_title. */
  payload: {
    content?: string;
    memory_kind?: string;
    targets?: { id: string; content: string }[];
    target_text?: string;
    change?: "cancel" | "revise";
    new_text?: string | null;
    target_meeting_title?: string | null;
  };
  result: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}
export interface MeetingDetail extends MeetingSummary {
  transcript: string | null;
  items: MeetingItem[];
  proposals: MeetingProposal[];
  analysis_context: { ref: string; type: "memory" | "action"; text: string; kind?: string; meeting_title?: string }[];
}
export interface MeetingProvider { id: string; label: string; state: "ready" | "unconfigured" | "not_implemented"; message: string; profile_configured: boolean }
export interface MeetingIn {
  title: string;
  scope: MeetingScope;
  project_id?: string | null;
  held_at?: string | null;
  audio_artifact_id?: string | null;
  transcript?: string | null;
  transcript_source?: "paste" | "file";
}
const M = "/api/meetings";
export const meetingProviders = (): Promise<{ providers: MeetingProvider[] }> => json(`${M}/providers`);
export const listMeetings = (p: { scope?: "personal" | "work"; q?: string } = {}): Promise<{ meetings: MeetingSummary[] }> =>
  json(M, { query: { scope: p.scope ?? "all", q: p.q || undefined } });
export const createMeeting = (body: MeetingIn): Promise<MeetingDetail> => json(M, { method: "POST", json: body });
export const getMeeting = (id: string): Promise<MeetingDetail> => json(`${M}/${id}`);
export const patchMeeting = (id: string, body: { title?: string; project_id?: string | null }): Promise<MeetingDetail> =>
  json(`${M}/${id}`, { method: "PATCH", json: body });
export const deleteMeeting = (id: string): Promise<void> => json(`${M}/${id}`, { method: "DELETE" });
export const putMeetingTranscript = (id: string, text: string, source: "paste" | "file"): Promise<MeetingDetail> =>
  json(`${M}/${id}/transcript`, { method: "POST", json: { text, source } });
export const requestMeetingTranscription = (id: string): Promise<MeetingDetail> => json(`${M}/${id}/transcribe`, { method: "POST" });
export const analyzeMeeting = (id: string): Promise<MeetingDetail> => json(`${M}/${id}/analyze`, { method: "POST" });
export const cancelMeetingAnalysis = (id: string): Promise<MeetingDetail> => json(`${M}/${id}/analyze/cancel`, { method: "POST" });
export const patchMeetingItem = (id: string, itemId: string, body: { status?: MeetingItemStatus }): Promise<MeetingItem> =>
  json(`${M}/${id}/items/${itemId}`, { method: "PATCH", json: body });
export const resolveMeetingProposal = (id: string, proposalId: string, action: "approve" | "reject"): Promise<MeetingDetail> =>
  json(`${M}/${id}/proposals/${proposalId}/${action}`, { method: "POST" });


// ---- 비서 관리(ADR 0007)
export type MemoryKind = "fact" | "preference" | "decision" | "event" | "instruction" | "note";
export type EntityType = "person" | "project" | "org" | "place" | "tool" | "topic" | "preference" | "other";
export type ContextScope = "personal" | "work" | "shared";
export const SCOPE_LABEL: Record<ContextScope, string> = { personal: "개인", work: "회사", shared: "공통" };
export const CATEGORY_LABEL: Record<string, string> = { projects: "프로젝트", "work-history": "작업 기록", knowledge: "지식", health: "건강" };
export interface AssistantStatus {
  embedder: string;
  retrieval?: string;
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
  scope?: ContextScope;
  source_ref?: string | null;
}
export interface EntityOut {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  summary: string | null;
  pinned: boolean;
  scope?: ContextScope;
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
  scope?: ContextScope;
  category?: string;
  entity_id?: string | null;
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
  scope?: ContextScope;
  category?: string;
  project?: string | null;
  source_ref?: string | null;
}
export interface ToolInfo {
  name: string;
  group: string;
  who: string;
  desc: string;
}
const A = "/api/assistant";
export const assistantStatus = (): Promise<AssistantStatus> => json(`${A}/status`);
/** common: 접수를 뺀 모든 실행 · desk: 접수 · lead: 기획 세션 · worker: 작업 세션 (ADR 0013) */
export type InstructionRole = "common" | "desk" | "lead" | "worker";
export interface InstructionsOut {
  text: string;
  role: InstructionRole;
  /** 저장한 적 없이 기본값을 보여 주는 중(접수만 기본값이 있다) */
  is_default: boolean;
}
export const getInstructions = (role: InstructionRole): Promise<InstructionsOut> => json(`${A}/instructions`, { query: { role } });
export const putInstructions = (role: InstructionRole, text: string): Promise<InstructionsOut> =>
  json(`${A}/instructions`, { method: "PUT", json: { text }, query: { role } });
export const resetInstructions = (role: InstructionRole): Promise<InstructionsOut> =>
  json(`${A}/instructions`, { method: "DELETE", query: { role } });
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
export const listTools = (): Promise<{ tools: ToolInfo[] }> => json(`${A}/tools`);

// ---- 맥락 도서관 화면(읽기 전용). back/src/ttakkari/context/insight.py 가 만든다.
export type LibScope = "all" | "personal" | "work";
export type LibCategory = "projects" | "work-history" | "knowledge" | "health";
export interface LibErrorSource { id: string; path: string; category: string; scope: ContextScope; last_error: string | null; last_indexed_at: string | null }
export interface LibOverview {
  scope: LibScope;
  retrieval: string;
  totals: { sources: number; enabled_sources: number; documents: number; chunks: number; memories: number; entities: number; relations: number };
  by_category: { category: string; scope: ContextScope; sources: number; documents: number; chunks: number }[];
  memories: { by_scope: Record<string, number>; by_kind: Record<string, number>; by_source: Record<string, number> };
  entities: { by_scope: Record<string, number>; by_type: Record<string, number> };
  last_indexed_at: string | null;
  never_indexed: number;
  error_sources: LibErrorSource[];
}
export interface LibTreeSource {
  id: string; path: string; pattern: string; scope: ContextScope; enabled: boolean;
  documents: number; chunks: number; last_indexed_at: string | null; last_error: string | null;
}
export interface LibTreeGroup { entity_id: string | null; name: string; entity_type: string | null; sources: LibTreeSource[]; documents: number; chunks: number; scopes: ContextScope[] }
export interface LibTreeCategory { category: string; groups: LibTreeGroup[]; sources: number; documents: number; chunks: number }
export interface LibTree { scope: LibScope; categories: LibTreeCategory[] }
export interface LibDocuments { source_id: string; path: string; total: number; documents: { id: string; path: string; title: string; chunks: number; indexed_at: string | null }[] }
export interface LibChunks {
  document_id: string; path: string; title: string; total: number;
  chunks: { id: string; ord: number; heading: string | null; length: number; content: string }[];
}
export interface LibNode {
  id: string; name: string; type: EntityType; scope: ContextScope; aliases: string[]; summary: string; pinned: boolean;
  degree: number; memories: number; sources: number; documents: number; chunks: number;
  flags: { isolated: boolean; no_alias: boolean; no_summary: boolean; no_evidence: boolean; duplicate_suspect: boolean };
}
export interface LibEdge { id: string; source: string; target: string; predicate: string; note: string | null; origin: string }
export interface LibDuplicate { a: string; b: string; a_name: string; b_name: string; reason: string; score: number }
export interface LibGraph { scope: LibScope; nodes: LibNode[]; edges: LibEdge[]; duplicates: LibDuplicate[]; predicates: Record<string, number> }
export interface LibEntityEvidence extends EntityDetail {
  sources: { id: string; path: string; category: string; scope: ContextScope; documents: number; chunks: number }[];
}
export interface LibChunkExample { id: string; document_id: string; path: string; title: string; heading: string | null; length: number; preview: string; copies?: number; documents?: number }
export interface LibFinding { level: "ok" | "info" | "warn"; code: string; title: string; detail: string; count: number }
export interface LibQuality {
  scope: LibScope;
  chunks: {
    total: number; histogram: { label: string; min: number; max: number | null; count: number }[]; short_limit: number; long_limit: number; target: number;
    stats: { min: number; median: number; p90: number; max: number; mean: number } | null;
    short: number; long: number; short_examples: LibChunkExample[]; long_examples: LibChunkExample[]; no_heading: number;
  };
  duplicates: { groups: number; extra_chunks: number; examples: LibChunkExample[]; truncated: boolean };
  documents: { total: number; empty: number; count_mismatch: number; empty_examples: { id: string; path: string }[]; chunks_per_doc: { mean: number; max: number }; largest: { id: string; path: string; title: string; chunks: number }[] };
  sources: { total: number; disabled: number; errors: number; never_indexed: number; stale: { id: string; path: string; last_indexed_at: string | null }[]; empty: { id: string; path: string }[]; unlinked: number };
  entities: {
    total: number; no_alias: number; no_alias_names: string[]; no_summary: number; isolated: number; isolated_names: string[];
    no_evidence: number; no_evidence_names: string[]; duplicate_pairs: LibDuplicate[]; by_type: Record<string, number>;
  };
  relations: { total: number; predicates: Record<string, number>; predicate_variants: string[][]; bidirectional_same_predicate: number };
  memories: { total: number; unlinked: number; no_source_ref: number; pinned: number; duplicate: number; by_kind: Record<string, number>; by_source: Record<string, number>; length: { max: number; mean: number } };
  findings: LibFinding[];
}
export interface LibSearchHit {
  rank: number; type: "memory" | "chunk" | "entity"; id: string; score: number; text: string;
  matched_terms: string[]; match_in: string[]; via: "keyword" | "entity" | "fuzzy"; coverage: number; entities: string[] | null;
  path?: string; title?: string; heading?: string | null; name?: string; project?: string | null; category?: string; scope?: ContextScope;
  source_ref?: string | null; indexed_at?: string; updated_at?: string; kind?: string; entity_type?: string; aliases?: string[];
}
export interface LibSearchLab { query: string; scope: LibScope; terms: string[]; anchors: string[]; elapsed_ms: number; results: LibSearchHit[] }
const L = "/api/assistant/library";
export const libOverview = (scope: LibScope): Promise<LibOverview> => json(`${L}/overview`, { query: { scope } });
export const libTree = (scope: LibScope): Promise<LibTree> => json(`${L}/tree`, { query: { scope } });
export const libSourceDocuments = (id: string, scope: LibScope): Promise<LibDocuments> => json(`${L}/sources/${id}/documents`, { query: { scope } });
export const libDocumentChunks = (id: string, scope: LibScope): Promise<LibChunks> => json(`${L}/documents/${id}/chunks`, { query: { scope } });
export const libGraph = (scope: LibScope): Promise<LibGraph> => json(`${L}/graph`, { query: { scope } });
export const libEntity = (id: string, scope: LibScope): Promise<LibEntityEvidence> => json(`${L}/entities/${id}`, { query: { scope } });
export const libQuality = (scope: LibScope): Promise<LibQuality> => json(`${L}/quality`, { query: { scope } });
export const libSearchLab = (query: string, scope: LibScope, k = 10): Promise<LibSearchLab> =>
  json(`${L}/search-lab`, { method: "POST", json: { query, scope, k } });

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
  /** 개인 모드 켜기·순위 */
  enabled: boolean;
  rank: number;
  /** 회사 모드 켜기·순위. 회사에 안 들어온 계정은 work_rank 가 null */
  work_enabled: boolean;
  work_rank: number | null;
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
export const getOverride = (pool: AccountPool = "personal"): Promise<OverrideOut> => json("/api/accounts/override", { query: { pool } });
export const putOverride = (ids: string[], until: string, pool: AccountPool = "personal"): Promise<OverrideOut> =>
  json("/api/accounts/override", { method: "PUT", json: { ids, until }, query: { pool } });
export const deleteOverride = (pool: AccountPool = "personal"): Promise<void> =>
  json("/api/accounts/override", { method: "DELETE", query: { pool } });
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

// ---- 프로젝트 관리 PMS · WBS (ADR 0012)
const PMS = "/api/pms";
export const listPmsProjects = (p: { scope?: PmsScope; status?: PmsProjectStatus; q?: string } = {}): Promise<{ projects: PmsProject[] }> =>
  json(`${PMS}/projects`, { query: { scope: p.scope ?? "all", status: p.status, q: p.q || undefined } });
export const createPmsProject = (body: PmsProjectIn): Promise<PmsProject> => json(`${PMS}/projects`, { method: "POST", json: body });
export const getPmsProject = (id: string): Promise<PmsProject> => json(`${PMS}/projects/${id}`);
export const patchPmsProject = (id: string, body: PmsProjectPatch): Promise<PmsProject> =>
  json(`${PMS}/projects/${id}`, { method: "PATCH", json: body });
export const deletePmsProject = (id: string): Promise<void> => json(`${PMS}/projects/${id}`, { method: "DELETE" });
export const getPmsDashboard = (id: string): Promise<PmsDashboard> => json(`${PMS}/projects/${id}/dashboard`);
export const listPmsTasks = (id: string): Promise<{ tasks: PmsTask[] }> => json(`${PMS}/projects/${id}/tasks`);
export const createPmsTask = (id: string, body: PmsTaskIn): Promise<PmsTaskResult> =>
  json(`${PMS}/projects/${id}/tasks`, { method: "POST", json: body });
export const patchPmsTask = (id: string, body: PmsTaskPatch): Promise<PmsTaskResult> =>
  json(`${PMS}/tasks/${id}`, { method: "PATCH", json: body });
export const movePmsTask = (id: string, body: { parent_id: string | null; index?: number }): Promise<PmsTaskResult> =>
  json(`${PMS}/tasks/${id}/move`, { method: "POST", json: body });
export const deletePmsTask = (id: string): Promise<{ removed: number; tasks: PmsTask[] }> => json(`${PMS}/tasks/${id}`, { method: "DELETE" });
export const listPmsMilestones = (id: string): Promise<{ milestones: PmsMilestone[] }> => json(`${PMS}/projects/${id}/milestones`);
export const createPmsMilestone = (id: string, body: { title: string; due_date: string; done?: boolean }): Promise<PmsMilestone> =>
  json(`${PMS}/projects/${id}/milestones`, { method: "POST", json: body });
export const patchPmsMilestone = (id: string, body: { title?: string; due_date?: string; done?: boolean }): Promise<PmsMilestone> =>
  json(`${PMS}/milestones/${id}`, { method: "PATCH", json: body });
export const deletePmsMilestone = (id: string): Promise<void> => json(`${PMS}/milestones/${id}`, { method: "DELETE" });
export const listPmsNotes = (id: string, status: "open" | "resolved" | "all" = "all"): Promise<{ notes: PmsNote[] }> =>
  json(`${PMS}/projects/${id}/notes`, { query: { status } });
export const createPmsNote = (id: string, body: PmsNoteIn): Promise<PmsNote> => json(`${PMS}/projects/${id}/notes`, { method: "POST", json: body });
export const patchPmsNote = (id: string, body: PmsNotePatch): Promise<PmsNote> => json(`${PMS}/notes/${id}`, { method: "PATCH", json: body });
export const deletePmsNote = (id: string): Promise<void> => json(`${PMS}/notes/${id}`, { method: "DELETE" });
