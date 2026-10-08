// 원본: back/src/ttakkari/schemas.py, back/docs/api-contract.md. 바뀌면 같이 바꾼다.
// UUID 와 ISO 8601 시각은 JSON 에서 문자열이다.

export type UUID = string;
export type ISODateTime = string;

export type EngineName = "claude" | "codex";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

export interface ApiErrorBody {
  code: string;
  message: string;
  errors?: { loc: (string | number)[]; msg: string }[];
}

// ---- auth
export interface LoginIn {
  password: string;
}
export interface TokenOut {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}
export interface MeOut {
  authenticated: boolean;
  password_set: boolean;
}

// ---- workspaces
export interface WorkspaceIn {
  name: string;
  root_path: string;
  default_engine?: EngineName;
  codex_sandbox?: CodexSandbox;
  export_allowed?: boolean;
}
export interface WorkspacePatch {
  name?: string;
  default_engine?: EngineName;
  codex_sandbox?: CodexSandbox;
  export_allowed?: boolean;
  archived?: boolean;
}
export interface WorkspaceOut {
  id: UUID;
  name: string;
  root_path: string;
  is_git: boolean;
  default_engine: string;
  codex_sandbox: string;
  export_allowed: boolean;
  created_at: ISODateTime;
  archived_at: ISODateTime | null;
}
export interface FileEntry {
  name: string;
  rel_path: string;
  type: "file" | "dir" | "symlink" | "other";
  size: number | null;
  modified_at: ISODateTime | null;
  sensitive: boolean;
}
export interface DirListing {
  rel_path: string;
  entries: FileEntry[];
  truncated: boolean;
}

// ---- sessions
export interface SessionIn {
  workspace_id: UUID;
  title?: string | null;
  engine?: EngineName | null;
  model?: string | null;
  effort?: Effort | null;
}
export interface SessionPatch {
  title?: string;
  model?: string | null;
  effort?: Effort | null;
  archived?: boolean;
}
export interface SessionOut {
  id: UUID;
  workspace_id: UUID;
  title: string;
  engine: string;
  model: string | null;
  effort: string | null;
  engine_session_id: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
  active_run_id: UUID | null;
  last_run_status: string | null;
}

// ---- runs
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["succeeded", "failed", "cancelled", "interrupted"];

export interface RunIn {
  prompt: string;
  context_artifact_ids?: UUID[];
  model?: string | null;
  effort?: Effort | null;
}
export interface RunOut {
  id: UUID;
  session_id: UUID;
  workspace_id: UUID;
  prompt: string;
  context_artifact_ids: UUID[];
  engine: string;
  model: string | null;
  effort: string | null;
  status: RunStatus;
  exit_code: number | null;
  error: string | null;
  result_text: string | null;
  cost_usd: number | null;
  usage: Record<string, unknown>;
  checkpoint_ref: string | null;
  last_seq: number;
  created_at: ISODateTime;
  started_at: ISODateTime | null;
  finished_at: ISODateTime | null;
}

// ---- artifacts
export type ArtifactKind = "markdown" | "html" | "pdf" | "pptx" | "docx" | "sheet" | "image" | "code" | "other";
export type ArtifactSource = "agent_output" | "agent_modified" | "user_registered" | "upload";
export type PreviewStatus = "not_required" | "pending" | "processing" | "ready" | "failed" | "unavailable";
export type ExportPolicy = "allow" | "deny" | "sensitive";
export type ArtifactVariant = "original" | "preview";

export interface ArtifactOut {
  id: UUID;
  workspace_id: UUID | null;
  session_id: UUID | null;
  run_id: UUID | null;
  filename: string;
  mime_type: string;
  kind: ArtifactKind;
  source: ArtifactSource;
  rel_path: string | null;
  storage_mode: string;
  size_bytes: number;
  sha256: string;
  preview_status: PreviewStatus;
  preview_mime: string | null;
  preview_error: string | null;
  export_policy: ExportPolicy;
  downloadable: boolean;
  retention_until: ISODateTime | null;
  created_at: ISODateTime;
}
export interface ArtifactRegisterIn {
  workspace_id: UUID;
  rel_path: string;
  session_id?: UUID | null;
}
export interface DownloadLinkOut {
  url: string;
  expires_at: ISODateTime;
}
export interface ArtifactListParams {
  workspace_id?: UUID;
  session_id?: UUID;
  run_id?: UUID;
  kind?: ArtifactKind;
  q?: string;
  limit?: number;
  offset?: number;
}

// ---- system (back/src/ttakkari/api/system.py)
export interface SystemInfo {
  engines: Record<EngineName, boolean>;
  preview_converter: boolean;
  allowed_roots: string[];
  max_concurrent_runs: number;
}
export interface StopAllOut {
  stopped: UUID[];
}

// ---- run events
export interface RunEventBase<T extends string, P> {
  seq: number;
  type: T;
  payload: P;
  created_at: ISODateTime;
}

export interface UsagePayload {
  cost_usd: number;
  [token_field: string]: number;
}

export type RunEvent =
  | RunEventBase<"run.status", { status: RunStatus }>
  | RunEventBase<"checkpoint", { ref: string }>
  | RunEventBase<"agent.session", { engine_session_id: string; model: string }>
  | RunEventBase<"message", { text: string }>
  | RunEventBase<"thinking", { text: string }>
  | RunEventBase<"tool.call", { call_id: string; name: string; input: unknown }>
  | RunEventBase<"tool.result", { call_id: string; is_error: boolean; output: string; exit_code?: number | null }>
  | RunEventBase<"guard.blocked", { call_id: string; reason: string }>
  | RunEventBase<"plan", { items: unknown[] }>
  | RunEventBase<"usage", UsagePayload>
  | RunEventBase<"artifact.created", { artifact: ArtifactOut }>
  | RunEventBase<"run.diff", { files: { path: string; added: number; removed: number }[]; new_files: string[] }>
  | RunEventBase<"log", { stream: "stdout" | "system"; text: string }>
  | RunEventBase<"error", { message: string }>
  | RunEventBase<
      "run.finished",
      { status: RunStatus; error: string | null; result_text: string | null; cost_usd: number | null; exit_code: number | null }
    >;

export type RunEventType = RunEvent["type"];
