// 하네스 조회(백엔드 ADR 0069). 읽기 전용이라 쓰기 타입은 없다.
export type HarnessCategory =
  | "instruction" | "setting" | "hook" | "skill" | "agent" | "rule" | "memory" | "plugin" | "mcp"
  | "prompt" | "guard" | "policy" | "capability";
export type HarnessEngine = "claude" | "codex" | "antigravity" | "muse" | "qwen-local" | "shared" | "ttakkari" | "opencode" | "copilot";
export type HarnessScope = "global" | "project" | "account" | "ttakkari";
export type HarnessSession = "desk" | "lead" | "worker" | "orchestrator";
export type HarnessGroupId = "claude" | "codex" | "muse" | "qwen" | "antigravity" | "ttakkari" | "projects" | "opencode" | "copilot";
export type HarnessConcern =
  | "instruction" | "skill" | "hook" | "setting" | "mcp" | "memory" | "agent" | "plugin"
  | "prompt" | "policy" | "guard" | "capability";
export type HarnessPool = "personal" | "company";
export type HarnessWarningKind = "broken_ref" | "duplicate" | "too_long" | "other";

export interface HarnessWarning {
  item_id: string;
  name: string;
  category: HarnessCategory;
  engine: HarnessEngine;
  kind: HarnessWarningKind;
  message: string;
  count: number;
}

export interface HarnessCategoryCount {
  id: HarnessCategory;
  label: string;
  total: number;
  present: number;
  missing: number;
  inactive: number;
  warnings: number;
}

export interface HarnessSummary {
  generated_at: number;
  total: number;
  present: number;
  categories: HarnessCategoryCount[];
  engines: { id: HarnessEngine; total: number }[];
  scopes: { id: HarnessScope; total: number }[];
  warning_total: number;
  warning_kinds: Record<HarnessWarningKind, number>;
  warnings: HarnessWarning[];
  session_kinds: HarnessSession[];
  layer_engines: LayerEngine[];
  groups: HarnessGroupCard[];
  labels: { concerns: Record<string, string>; layers: Record<string, string>; groups: Record<string, string> };
}

export interface HarnessCounts { total: number; present: number; missing: number; inactive: number; warnings: number }
export interface HarnessGroupCard extends HarnessCounts {
  id: HarnessGroupId;
  label: string;
  short: string;
  kind: "main" | "ttakkari" | "projects";
  blurb: string;
  exists: boolean;
  concerns: { id: HarnessConcern; label: string; total: number; present: number }[];
  projects?: number;
  company_projects?: number;
}
export interface HarnessConcernRow extends HarnessCounts { id: HarnessConcern; label: string; exists: boolean }
export interface HarnessInjection {
  id: string;
  title: string;
  phase: LayerPhase;
  applies: boolean;
  evidence: "code" | "external";
  condition: string;
  item_id: string | null;
  source: string;
}
export interface HarnessGroupLayer extends HarnessCounts {
  id: string;
  label: string;
  note: string;
  order: number;
  evidence: "code" | "external";
  applies: boolean;
  concerns: Record<string, number>;
  link?: { group: HarnessGroupId; label: string; total: number; projects: number };
  injection?: HarnessInjection[];
}
export interface HarnessGroupDetail extends HarnessCounts {
  id: HarnessGroupId;
  label: string;
  kind: "main" | "ttakkari" | "projects";
  blurb: string;
  exists: boolean;
  concerns: HarnessConcernRow[];
  layers: HarnessGroupLayer[];
  notes: string[];
}
export interface HarnessProjectRow extends HarnessCounts {
  key: string;
  name: string;
  container: string;
  pool: HarnessPool;
  engines: Record<string, number>;
  concerns: Record<string, number>;
}
export interface HarnessProjectList {
  projects: HarnessProjectRow[];
  total: number;
  scanned: number;
  without_harness: string[];
  company: number;
}
export interface HarnessProjectConcern { id: HarnessConcern; label: string; total: number; items: HarnessRow[]; truncated: boolean }
export interface HarnessProjectEngine extends HarnessCounts { id: string; label: string; concerns: HarnessProjectConcern[] }
export interface HarnessProjectDetail extends HarnessCounts {
  key: string;
  name: string;
  pool: HarnessPool;
  engines: HarnessProjectEngine[];
}
export interface HarnessCrumb { kind: "group" | "project" | "engine" | "concern"; id: string; label: string }
export interface HarnessCounterparts {
  items: { id: string; name: string; engine: string; hgroup: HarnessGroupId; label: string; present: boolean; path: string | null }[];
  concerns: { hgroup: HarnessGroupId; engine: string; label: string; concern: HarnessConcern; project: string; total: number }[];
}

export interface HarnessRow {
  id: string;
  category: HarnessCategory;
  name: string;
  group: string;
  description: string;
  scope: HarnessScope;
  engine: HarnessEngine;
  sessions: HarnessSession[];
  source: "file" | "code" | "db" | "config" | "generated";
  path: string | null;
  mtime: number | null;
  present: boolean;
  active: boolean | null;
  active_note: string;
  kind: "markdown" | "json" | "text";
  chars: number;
  lines: number;
  masked: number;
  warnings: string[];
  alias_of: string | null;
  hgroup: HarnessGroupId;
  concern: HarnessConcern;
  layer: string;
  project: string;
  pool: HarnessPool | "";
  crumb?: HarnessCrumb[];
  snippet?: string;
  matched_in?: string[];
}

export interface HarnessList {
  total: number;
  items: HarnessRow[];
  next_cursor: number | null;
  facets: { groups: string[] };
}

export interface HarnessDetail extends HarnessRow {
  body: string;
  offset: number;
  next_offset: number | null;
  truncated_source: boolean;
  real_path: string | null;
  frontmatter: Record<string, string> | null;
  meta: Record<string, unknown>;
  crumb: HarnessCrumb[];
  layer_label: string;
  counterparts: HarnessCounterparts;
}

export type LayerEngine = "claude" | "codex" | "antigravity" | "muse" | "qwen-local" | "opencode" | "copilot";
export type LayerPhase = "prompt" | "delivery" | "load" | "tool" | "guard";

export interface HarnessLayer {
  order: number;
  id: string;
  title: string;
  origin: "code" | "file" | "db" | "generated" | "engine" | "cli";
  source: string;
  applies: boolean;
  condition: string;
  evidence: "code" | "external";
  phase: LayerPhase;
  chars: number;
  preview: string;
  item_id: string | null;
}

export interface HarnessLayers {
  session: HarnessSession;
  session_label: string;
  engine: LayerEngine;
  pool: "personal" | "work";
  layers: HarnessLayer[];
  notes: string[];
  prompt_chars: number;
  applied: number;
  total: number;
  external: number;
}

export interface HarnessQuery {
  q?: string;
  category?: string;
  engine?: string;
  scope?: string;
  active?: boolean;
  warned?: boolean;
  present?: boolean;
  hgroup?: string;
  concern?: string;
  layer?: string;
  project?: string;
  pool?: string;
  cursor?: number;
}
