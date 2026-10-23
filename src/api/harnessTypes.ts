// 하네스 조회(백엔드 ADR 0069). 읽기 전용이라 쓰기 타입은 없다.
export type HarnessCategory =
  | "instruction" | "setting" | "hook" | "skill" | "agent" | "rule" | "memory" | "plugin" | "mcp"
  | "prompt" | "guard" | "policy" | "capability";
export type HarnessEngine = "claude" | "codex" | "antigravity" | "muse" | "qwen-local" | "shared" | "ttakkari";
export type HarnessScope = "global" | "project" | "account" | "ttakkari";
export type HarnessSession = "desk" | "lead" | "worker" | "orchestrator";
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
}

export type LayerEngine = "claude" | "codex" | "antigravity" | "muse" | "qwen-local";
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
  cursor?: number;
}
