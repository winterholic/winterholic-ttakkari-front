import type { ArtifactOut } from "./types";

/** ArtCraft 관제 API(백엔드 docs/adr/0035-artcraft-control.md). 디자인시스템 타입과 섞지 않는다. */
export type ArtcraftAuthMode = "none" | "token" | "key" | "file" | "unknown";
/** 후보(미검토) → 기여 선택 → 진행 중 → 보고됨·PR 올림 → 해결, 옆길로 보류·제외. 상태는 따까리에만 저장된다. */
export type ArtcraftBugStatus = "candidate" | "selected" | "in_progress" | "reported" | "resolved" | "deferred" | "excluded";
export type ArtcraftBugKind = "issue" | "pr" | "security";
export type ArtcraftBugSection = "summary" | "impact" | "repro" | "evidence" | "suggestion" | "unverified";
export type ArtcraftJobState = "queued" | "running" | "succeeded" | "failed" | "timeout";
export type ArtcraftSmokeMode = "cli" | "full";

export interface ArtcraftSmoke {
  ts: string | null;
  source: "artcraft" | "ttakkari";
  error: string | null;
  passed: number;
  total: number;
  failed: { test: string; rc: number | null; evidence: string }[];
  mcp: { ok: boolean; tools: number | null } | null;
  mcp_flow: { ok: boolean; calls: number | null } | null;
  gui: { started: boolean | null; inspect: boolean | null; screenshot: boolean | string | null } | null;
}

export interface ArtcraftApp {
  app: string;
  title: string;
  domain: string | null;
  site_status: string | null;
  installed: {
    release: string | null;
    cli_ok: boolean;
    cli_version: string | null;
    bundle_installed: boolean;
    source_build: { commit: string | null; version: string | null } | null;
  };
  latest: { tag: string | null; update_available: boolean | null; checked_at: string | null };
  smoke: ArtcraftSmoke | null;
  mcp: { ok: boolean; tool_count: number | null; ms: number | null; error: string | null } | null;
  gui: { running: boolean; listening: boolean; port: number | null; transport: "tcp" | "file" | "none" };
  auth: { mode: ArtcraftAuthMode; label: string; protected: boolean };
  healthy: boolean;
  known_bugs: string[];
}

export interface ArtcraftJob {
  id: string;
  kind: "remote" | "smoke" | "gui";
  action: string;
  apps: string[];
  mode: ArtcraftSmokeMode | null;
  state: ArtcraftJobState;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  summary: string | null;
  output: string;
}

export interface ArtcraftOverview {
  generated_at: string;
  stale: boolean;
  error: string | null;
  apps: ArtcraftApp[];
  remote: { checked_at: string | null; attempted_at: string | null; error: string | null; checking: boolean };
  jobs: ArtcraftJob[];
}

export interface ArtcraftBug {
  id: string;
  title: string;
  repos: string[];
  apps: string[];
  severity: "S1" | "S2" | "S3" | null;
  kind: ArtcraftBugKind | null;
  /** 기록한 에이전트의 추정 */
  difficulty: "easy" | "medium" | "hard" | null;
  upstream: { state: "unchecked" | "none" | "related" | "duplicate"; note: string };
  found: string | null;
  verified: string;
  sections: Partial<Record<ArtcraftBugSection, string>>;
  truncated: string[];
  /** BUGS.md 형식이 어긋난 곳. 숨기지 않고 보여 준다. */
  problems: string[];
  status: ArtcraftBugStatus;
  note: string;
  /** 사용자가 올린 이슈·PR 링크(https://github.com/ 만) */
  url: string;
  updated_at: string | null;
  history: { status: ArtcraftBugStatus; at: string }[];
  /** 기여 선택 뒤 에이전트에게 넘길 요청 문구 */
  handoff: string;
}

export interface ArtcraftBugList {
  source_modified_at: string | null;
  counts: Record<ArtcraftBugStatus, number>;
  apps: string[];
  problems: number;
  bugs: ArtcraftBug[];
}

export type ArtcraftSnippetKind = "json" | "claude" | "codex";

export interface ArtcraftAgentConfig {
  apps: { app: string; title: string; server: string; tool_count: number | null; snippets: Record<ArtcraftSnippetKind, string>; notes: string[] }[];
  all: { json: string };
  note: string;
}

// ---- 작업 플랫폼(백엔드 docs/adr/0036-artcraft-work-platform.md). 관제 타입과 같은 파일이지만 서로 참조하지 않는다.
export type ArtcraftCategoryId = "photo" | "vector" | "ui" | "layout" | "video" | "motion" | "audio" | "pdf" | "doc" | "slides" | "sheet" | "cad";
export type ArtcraftMaturityLevel = "ready" | "limited" | "experimental";
export type ArtcraftSpeed = "fast" | "normal" | "careful";
/** 마지막 라운드 상태에서 계산한다. */
export type ArtcraftTaskState = "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted";

export interface ArtcraftTemplateOption {
  id: string;
  label: string;
  default: string;
  choices: { value: string; label: string }[];
}
export interface ArtcraftTemplate {
  id: string;
  title: string;
  prompt: string;
  example: string;
  min_files: number;
  apps: string[];
  options: ArtcraftTemplateOption[];
}
export interface ArtcraftCategoryApp {
  app: string;
  title: string;
  role: string;
  installed: boolean;
}
export interface ArtcraftCategory {
  id: ArtcraftCategoryId;
  section: string;
  title: string;
  tagline: string;
  icon: string;
  maturity: { level: ArtcraftMaturityLevel; label: string; summary: string };
  apps: ArtcraftCategoryApp[];
  can: string[];
  cannot: string[];
  accepts: string[];
  outputs: string[];
  templates: ArtcraftTemplate[];
}
export interface ArtcraftCatalog {
  sections: { id: string; title: string; categories: ArtcraftCategoryId[] }[];
  categories: ArtcraftCategory[];
  available: boolean;
  unavailable_reason: string | null;
  workspace_id: string | null;
  workspace_error: string | null;
  limits: { files: number; prompt: number };
}

export interface ArtcraftTaskSummary {
  id: string;
  session_id: string;
  category: ArtcraftCategoryId;
  title: string;
  apps: string[];
  template_id: string | null;
  state: ArtcraftTaskState;
  round_count: number;
  output_count: number;
  last_run_id: string | null;
  error: string | null;
  progress: string | null;
  waiting_reason: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface ArtcraftRound {
  id: string;
  index: number;
  status: string;
  state: ArtcraftTaskState;
  prompt: string;
  result_text: string | null;
  /** 이 라운드에서 에이전트가 한 마지막 답 몇 개(오래된 순). 마지막 답이 딴 이야기여도 결과 설명이 남는다. */
  messages: string[];
  error: string | null;
  options: Record<string, string>;
  use_previous: boolean;
  inputs: ArtifactOut[];
  outputs: ArtifactOut[];
  progress: string | null;
  waiting_reason: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}
export interface ArtcraftTaskDetail extends ArtcraftTaskSummary {
  options: Record<string, string>;
  rounds: ArtcraftRound[];
}
export interface ArtcraftOutputItem {
  artifact: ArtifactOut;
  task_id: string;
  task_title: string;
  category: ArtcraftCategoryId;
  run_id: string | null;
}
export interface ArtcraftOutputPage {
  items: ArtcraftOutputItem[];
  has_more: boolean;
}
export interface ArtcraftTaskIn {
  category: ArtcraftCategoryId;
  prompt: string;
  template_id?: string | null;
  input_artifact_ids?: string[];
  apps?: string[] | null;
  options?: Record<string, string>;
  speed?: ArtcraftSpeed;
}
export interface ArtcraftRoundIn {
  prompt: string;
  input_artifact_ids?: string[];
  use_previous?: boolean;
  options?: Record<string, string> | null;
  speed?: ArtcraftSpeed;
}
