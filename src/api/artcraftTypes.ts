/** ArtCraft 관제 API(백엔드 docs/adr/0035-artcraft-control.md). 디자인시스템 타입과 섞지 않는다. */
export type ArtcraftAuthMode = "none" | "token" | "key" | "file" | "unknown";
export type ArtcraftBugStatus = "unreported" | "reported" | "resolved";
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
  apps: string;
  severity: "S1" | "S2" | "S3" | null;
  severity_text: string;
  summary: string;
  verified: string;
  title: string;
  body: string;
  truncated: boolean;
  status: ArtcraftBugStatus;
  note: string;
  updated_at: string | null;
}

export interface ArtcraftBugList {
  source_modified_at: string | null;
  counts: Record<ArtcraftBugStatus, number>;
  bugs: ArtcraftBug[];
}

export type ArtcraftSnippetKind = "json" | "claude" | "codex";

export interface ArtcraftAgentConfig {
  apps: { app: string; title: string; server: string; tool_count: number | null; snippets: Record<ArtcraftSnippetKind, string>; notes: string[] }[];
  all: { json: string };
  note: string;
}
