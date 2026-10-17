// 원본: back/src/ttakkari/schemas.py, back/docs/api-contract.md. 바뀌면 같이 바꾼다.
// UUID 와 ISO 8601 시각은 JSON 에서 문자열이다.

export type UUID = string;
export type ISODateTime = string;

export type EngineName = "claude" | "codex" | "antigravity" | "muse";
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
  extra_writable_roots?: string[];
}
export interface WorkspacePatch {
  name?: string;
  default_engine?: EngineName;
  codex_sandbox?: CodexSandbox;
  export_allowed?: boolean;
  extra_writable_roots?: string[];
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
  extra_writable_roots: string[];
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
  /** orchestrator·desk 면 엔진은 서버가 auto 로 고정한다. desk 는 접수(ADR 0013): 바로 답하거나 기획 세션에 넘긴다. */
  kind?: "chat" | "orchestrator" | "desk";
  pool?: AccountPool;
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
  /** desk: 접수 · orchestrator: parent_id 가 있으면 접수가 만든 기획 세션, 없으면 옛 메인 오케스트레이터 · worker: 작업 세션 */
  kind: "chat" | "orchestrator" | "worker" | "desk";
  parent_id: UUID | null;
  /** personal | work(회사 업무 탭) */
  pool: AccountPool;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
  active_run_id: UUID | null;
  last_run_status: string | null;
  last_run_profile?: string | null;
  last_run_started_at?: ISODateTime | null;
  /** 마지막으로 끝난 Run 의 결과(없으면 오류) 앞 200자 */
  last_result?: string | null;
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
  /** user: 내 지시 · report: 작업·기획 세션 결과 보고 · orchestrator: 오케스트레이터가 작업 세션에 보낸 지시 · desk: 접수가 기획 세션에 넘긴 요청 */
  origin: "user" | "report" | "orchestrator" | "desk";
  /** 실제로 실행한 엔진 계정 이름(폴백하면 마지막 계정) */
  profile: string | null;
  last_seq: number;
  created_at: ISODateTime;
  started_at: ISODateTime | null;
  finished_at: ISODateTime | null;
  /** 접수 세션의 사용자 메시지 Run 에 남긴 판정. 목록·단건 조회에서만 채워지고, 없으면 null. */
  desk_feedback?: DeskFeedbackBrief | null;
}

export interface FailedRunOut extends RunOut {
  failed_at: ISODateTime;
  session_title: string;
  session_kind: "chat" | "orchestrator" | "desk";
  session_parent_id: UUID | null;
  pool: AccountPool;
  workspace_name: string;
}
export interface FailedRunsPage {
  items: FailedRunOut[];
  next_before: ISODateTime | null;
  next_before_id: UUID | null;
}

// ---- 접수 판정(back ADR 0013)
export type DeskAction = "answer" | "delegate";
/** ok: 접수가 맞았다 · should_delegate: 넘겼어야 했다 · should_answer: 바로 답했어야 했다 */
export type DeskVerdict = "ok" | "should_delegate" | "should_answer";
export interface DeskFeedbackIn {
  verdict: DeskVerdict;
  note?: string | null;
  /** should_delegate 이고 접수가 바로 답했던 Run 이면 그 메시지를 새 기획 세션에 넘긴다. */
  redo?: boolean;
}
export interface DeskFeedbackBrief {
  verdict: DeskVerdict;
  /** 판정 시점에 접수가 고른 쪽 */
  decided: DeskAction;
  /** 사용자가 맞다고 한 쪽 */
  expected: DeskAction;
  note: string | null;
  updated_at: ISODateTime;
}
export interface DeskFeedbackOut extends DeskFeedbackBrief {
  run_id: UUID;
  session_id: UUID;
  message: string;
  created_at: ISODateTime;
  /** redo 로 넘긴 기획 세션. 넘기지 않았으면 null. */
  lead_id: UUID | null;
}

// ---- artifacts
export type ArtifactKind = "markdown" | "html" | "pdf" | "pptx" | "docx" | "sheet" | "image" | "code" | "other";
export type ArtifactSource = "agent_output" | "agent_modified" | "user_registered" | "upload";
/** 보관함 분류. files 는 사용자가 올렸거나 넘겨받은 결과물, agent 는 에이전트가 작업 중 만든 파일. */
export type ArtifactArea = "files" | "agent";
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
  area: ArtifactArea;
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
/** 메시지 본문 링크의 경로 문자열(절대경로·~·file://·상대경로·`:줄`). 백엔드가 결과물로 바꿔 준다. */
export interface ArtifactResolveIn {
  path: string;
  workspace_id?: UUID | null;
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
  /** 보관함 탭. 생략하면 모두(세션 화면). */
  area?: ArtifactArea;
  /** true 면 작업이 워크스페이스에서 바꾼 파일(agent_modified)만, false 면 그것을 뺀다. 생략하면 모두. */
  changed?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

// ---- system (back/src/ttakkari/api/system.py)
export interface SystemInfo {
  engines: Record<EngineName, boolean>;
  preview_converter: boolean;
  allowed_roots: string[];
  /** 역할별 동시 실행 자리(ADR 0013) */
  max_concurrent: { desk: number; leads: number; workers: number };
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
  | RunEventBase<"run.status", { status: RunStatus; waiting?: boolean }>
  | RunEventBase<"checkpoint", { ref: string; untracked?: string[] }>
  /** 계정이 사용량 한도에 걸렸다. reset_at 까지 그 계정은 쉰다. */
  | RunEventBase<"account.limited", { account: string; engine: AccountEngine; reset_at: ISODateTime | null; detail: string }>
  /** 같은 Run 이 다음 계정으로 넘어갔다. resume: 그 계정의 엔진 대화를 이어감 · handoff: 대화·진행 요약을 새 대화에 실어 보냄. */
  | RunEventBase<
      "engine.fallback",
      { from: string; to: string; reason: "usage_limit" | "missing"; detail: string; reset_at?: ISODateTime | null; mode?: "resume" | "handoff" }
    >
  /** 쓸 수 있는 계정이 없어 Run 이 queued 로 초기화를 기다린다. handoff 는 재개용 내부 인계문이라 화면에 쓰지 않는다. */
  | RunEventBase<"run.waiting", { until: ISODateTime; accounts: { name: string; engine: AccountEngine; resets_at: ISODateTime }[]; handoff?: string }>
  | RunEventBase<"run.resumed", { account: string }>
  /** 접수(desk)가 고른 쪽. fallback 이면 모든 계정이 실패해 기획으로 넘긴 것이다. */
  | RunEventBase<"desk.route", { action: DeskAction; account: string | null; engine: AccountEngine | null; ms?: number; fallback?: boolean }>
  | RunEventBase<"desk.retry", { account: string; engine: AccountEngine; ms: number; reason: string }>
  /** redo: 사용자가 "넘겼어야 해"로 판정해 나중에 넘긴 것 */
  | RunEventBase<"desk.delegated", { lead_id: UUID; title: string; redo?: boolean }>
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

// ---- engine accounts (ADR 0006)
export type AccountEngine = "claude" | "codex" | "antigravity" | "muse";
/**
 * 계정이 어느 모드에 쓰이는지. 모든 계정은 개인 목록에 있고, work 는 그중 회사 모드에도 쓰려고 고른 계정이다.
 * 개인·회사 모드는 켜기·순서·임시 순서를 따로 가진다. 세션의 pool 은 그 대화가 쓰는 모드다.
 */
export type AccountPool = "personal" | "work";
export interface AccountOut {
  id: UUID;
  name: string;
  engine: AccountEngine;
  pool: AccountPool;
  config_dir: string | null;
  /** 개인 모드 켜기·순서 */
  enabled: boolean;
  priority: number;
  /** 5시간·주간 사용률 상한. 이 값 이상이면 초기화까지 새 Run 배정을 멈춘다. */
  max_used_percent: number;
  /** 회사 모드 켜기·순서. pool 이 work 인 계정에만 의미가 있고 개인 모드 값과 독립이다. */
  work_enabled: boolean;
  work_priority: number;
  /** ok: 로그인 확인 · unknown: 확인 못 함 · missing: 계정 폴더 없음 */
  login: "ok" | "unknown" | "missing";
  login_label: string | null;
  cooldown_seconds: number;
  /** 처음 한 번 Mac Studio 터미널에서 실행할 로그인 명령. 로그인돼 있으면 null */
  login_command?: string | null;
}
export interface AccountIn {
  name: string;
  engine: AccountEngine;
  pool?: AccountPool;
  config_dir?: string | null;
  enabled?: boolean;
  max_used_percent?: number;
}
export interface AccountPatch {
  name?: string;
  pool?: AccountPool;
  config_dir?: string | null;
  /** 개인 모드 켜기 */
  enabled?: boolean;
  /** 회사 모드 켜기 */
  work_enabled?: boolean;
  max_used_percent?: number;
}

// ---- 프로젝트 관리 PMS · WBS (ADR 0012)
export type PmsScope = "personal" | "work";
export type PmsProjectStatus = "planning" | "active" | "on_hold" | "done";
export type PmsTaskStatus = "todo" | "doing" | "review" | "done";
export type PmsPriority = "low" | "normal" | "high" | "urgent";
export type PmsNoteKind = "issue" | "risk" | "note";
export type PmsSeverity = "low" | "medium" | "high";
/** 말단 작업 기준 개수. overdue·due_soon 은 끝나지 않은 작업만 센다. */
export interface PmsCounts {
  total: number;
  todo: number;
  doing: number;
  review: number;
  done: number;
  overdue: number;
  due_soon: number;
  no_dates: number;
}
export interface PmsMilestone {
  id: UUID;
  project_id: UUID;
  title: string;
  due_date: string;
  done: boolean;
  /** 오늘까지 남은 일수(지났으면 음수) */
  days: number;
  overdue: boolean;
}
export interface PmsProject {
  id: UUID;
  name: string;
  description: string;
  scope: PmsScope;
  status: PmsProjectStatus;
  start_date: string | null;
  end_date: string | null;
  /** 담당자 자동완성용 이름표(계정 아님) */
  members: string[];
  created_at: string;
  updated_at: string;
  /** 0-100. 최상위 작업의 기간 가중 평균 */
  progress: number;
  counts: PmsCounts;
  next_milestone: PmsMilestone | null;
  open_notes: number;
}
export interface PmsProjectIn {
  name: string;
  description?: string;
  scope?: PmsScope;
  status?: PmsProjectStatus;
  start_date?: string | null;
  end_date?: string | null;
  members?: string[];
  /** 처음부터 만들 최상위 단계 이름 */
  phases?: string[];
}
export type PmsProjectPatch = Partial<Omit<PmsProjectIn, "phases">>;
export interface PmsTask {
  id: UUID;
  project_id: UUID;
  parent_id: UUID | null;
  position: number;
  depth: number;
  /** 1.1.2 형식 번호. 서버가 트리 순서로 매긴다 */
  wbs: string;
  has_children: boolean;
  title: string;
  description: string;
  priority: PmsPriority;
  assignee: string | null;
  /** 하위 작업이 있으면 자식에서 집계한 값 */
  status: PmsTaskStatus;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  /** 기간이 자식에서 집계된 값이면 직접 고칠 수 없다 */
  dates_rollup: boolean;
  overdue: boolean;
  predecessors: UUID[];
  created_at: string;
  updated_at: string;
  done_at: string | null;
}
export interface PmsTaskIn {
  title: string;
  parent_id?: UUID | null;
  /** 이 작업 바로 뒤 형제로 넣는다(parent_id 무시) */
  after_id?: UUID | null;
  description?: string;
  priority?: PmsPriority;
  assignee?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: PmsTaskStatus;
  progress?: number;
  predecessors?: UUID[];
}
export type PmsTaskPatch = Partial<Omit<PmsTaskIn, "parent_id" | "after_id">>;
/** 작업을 바꾸는 호출의 응답: 바뀐 작업과 번호·집계가 다시 계산된 전체 목록 */
export interface PmsTaskResult {
  task: PmsTask;
  tasks: PmsTask[];
}
export interface PmsTaskBrief {
  id: UUID;
  wbs: string;
  title: string;
  assignee: string | null;
  status: PmsTaskStatus;
  progress: number;
  end_date: string | null;
  /** 마감까지 남은 일수(지났으면 음수) */
  days: number | null;
  priority: PmsPriority;
}
export interface PmsAssigneeRow {
  /** 빈 문자열이 미배정 */
  name: string;
  total: number;
  todo: number;
  doing: number;
  review: number;
  done: number;
  overdue: number;
}
export interface PmsNote {
  id: UUID;
  project_id: UUID;
  task_id: UUID | null;
  kind: PmsNoteKind;
  title: string;
  body: string;
  severity: PmsSeverity;
  status: "open" | "resolved";
  owner: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}
export interface PmsNoteIn {
  kind?: PmsNoteKind;
  title: string;
  body?: string;
  severity?: PmsSeverity;
  owner?: string | null;
  task_id?: UUID | null;
}
export type PmsNotePatch = Partial<PmsNoteIn> & { status?: "open" | "resolved" };
export interface PmsDashboard {
  project: Omit<PmsProject, "progress" | "counts" | "next_milestone" | "open_notes">;
  today: string;
  progress: number;
  /** 기간 대비 오늘까지 흘러간 비율. 기간이 없으면 null */
  planned_progress: number | null;
  days_left: number | null;
  counts: PmsCounts;
  overdue: PmsTaskBrief[];
  due_soon: PmsTaskBrief[];
  by_assignee: PmsAssigneeRow[];
  phases: { id: UUID; wbs: string; title: string; progress: number; status: PmsTaskStatus; start_date: string | null; end_date: string | null }[];
  milestones: PmsMilestone[];
  notes: { open: number; issues: number; risks: number; high: number; top: PmsNote[] };
}


// ---- 작업 트리(back ADR 0014)
/** 트리 한 칸. 세션 하나에 마지막 Run 상태를 붙인 것이다. */
export interface TaskNode {
  id: UUID;
  parent_id: UUID | null;
  kind: SessionOut["kind"];
  title: string;
  pool: AccountPool;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  archived_at: ISODateTime | null;
  status: RunStatus | null;
  engine?: string | null;
  profile: string | null;
  model: string | null;
  last_result: string | null;
}
/** roots 는 보여 줄 순서다. 뿌리의 parent_id 는 접수일 수 있어 parent_id 만으로 뿌리를 가리지 않는다. */
export interface TaskForest {
  roots: UUID[];
  nodes: TaskNode[];
}
export interface TaskTreeOut {
  root_id: UUID;
  /** 뿌리부터 요청한 세션까지(양끝 포함) */
  path: TaskNode[];
  nodes: TaskNode[];
}
export interface TaskRoot extends TaskNode {
  descendants: number;
  active: number;
  failed: number;
}
export interface TaskLibrary {
  roots: TaskRoot[];
  next_before: ISODateTime | null;
}
export interface TaskHit {
  node: TaskNode;
  root_id: UUID;
  path: TaskNode[];
  field: "title" | "prompt" | "result";
  snippet: string;
}
