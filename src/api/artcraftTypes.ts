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
