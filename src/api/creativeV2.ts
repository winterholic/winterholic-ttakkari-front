import { json } from "./client";

export type DurationMode = "auto" | "preferred" | "exact" | "platform_cap";

export interface DurationRequest {
  mode: DurationMode;
  seconds?: number | null;
  platform?: string | null;
  source?: string | null;
  as_of?: string | null;
}

export interface DurationPolicy {
  version: string;
  presets_seconds: number[];
  min_seconds: number;
  max_seconds: number;
  default_fps: number;
  platform_caps: Record<
    string,
    { label: string; max_seconds: number; source: string; as_of: string; note: string }
  >;
  note: string;
}

export interface BeatNeed {
  beat_id: string;
  speech_seconds: number;
  speech_source: "none" | "estimate" | "measured";
  floor: number;
  ideal: number;
  ceiling: number;
  essential: boolean;
}

export interface NeededRuntime {
  min_seconds: number;
  ideal_seconds: number;
  max_seconds: number;
  speech_seconds: number;
  music_seconds: number | null;
  beats: BeatNeed[];
  reasons: string[];
}

export interface DurationAlternative {
  kind:
    | "relax_to_feasible"
    | "drop_nonessential"
    | "speed_up_speech"
    | "split_parts"
    | "extend_content"
    | "raise_cap";
  label: string;
  seconds: number | null;
  detail: string;
  requires_user_approval: boolean;
  feasible: boolean;
}

export type DurationStatus = "auto" | "target_met" | "deviated" | "strict_met" | "conflict";

export interface DurationPlan {
  status: DurationStatus;
  deviation_level: "none" | "minor" | "excessive";
  request: DurationRequest;
  fps: number;
  needed: NeededRuntime;
  planned_seconds: number | null;
  planned_frames: number | null;
  reasons: string[];
  warnings: string[];
  alternatives: DurationAlternative[];
}

export interface DurationCheck {
  status: "ok" | "violation";
  total_frames: number;
  total_seconds: number;
  fps: number;
  target_delta_seconds: number | null;
  errors: string[];
  warnings: string[];
}

export interface PlanScene {
  scene_id: string;
  title: string;
  narration: string;
  seconds: number;
  start_time: number;
  end_time: number;
  start_frame: number;
  end_frame: number;
  duration_state: "ok" | "compressed" | "stretched";
  floor: number;
  ideal: number;
  ceiling: number;
  speech_seconds: number;
  info_weight: number;
  essential: boolean;
  narrative_goal: string;
}

export interface MatchGap {
  options: string[];
  priority: string;
  status: string;
  why: string;
  alternatives: string[];
}

export interface MatchConflict {
  a: string;
  b: string;
  kind: string;
  resolution: string;
  rationale: string;
  alternatives: string[];
}

export interface RecipeCandidate {
  recipe_id: string;
  name: string;
  score: number;
  verdict: string;
  disqualified: string | null;
}

export interface MatchResult {
  status: "ready" | "ready_unverified" | "blocked" | "needs_user_decision";
  execution_scope: "studio_runtime" | "lab_manual" | "none";
  primary_recipe: string | null;
  auxiliary_recipes: string[];
  candidates: RecipeCandidate[];
  gaps: MatchGap[];
  conflicts: MatchConflict[];
  dropped: Array<{ entry_id: string; reason: string }>;
  style_resolution_needed: string[];
}

export interface PlanApproval {
  revision: number;
  planned_frames: number;
  planned_seconds: number;
  fps: number;
  approved_at: string;
}

export interface RenderSegment {
  id: string;
  scene_ids: string[];
  start_frame: number;
  end_frame: number;
  seconds: number;
  input_sha256: string;
}

export interface RenderPlan {
  segment_target_seconds: number;
  requires_split: boolean;
  segments: RenderSegment[];
  join: { method: string; inputs: string[] };
  resume: string;
  executed: boolean;
  warnings: string[];
}

export type ProductionState =
  | "not_dispatched"
  | "stale_revision"
  | "project_missing"
  | "awaiting_assets"
  | "ready_to_render"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "drifted";

export interface ProductionJob {
  id: string;
  status: string;
  progress: number | null;
  elapsed_seconds: number | null;
  peak_rss_bytes: number | null;
  error: string | null;
}

/** 승인된 계획이 스튜디오 렌더러 프로젝트로 넘어간 뒤의 실제 상태. 서버가 렌더러 프로젝트를 읽어 계산한다. */
export interface ProductionView {
  plan_id: string;
  plan_revision: number;
  engine: string;
  state: ProductionState;
  dispatchable: boolean;
  reasons: string[];
  project_id: string | null;
  project_url?: string;
  job: ProductionJob | null;
}

export interface CreativePlan {
  id: string;
  revision: number;
  name: string;
  brief: string;
  aspect: "16:9" | "9:16" | "1:1";
  intent_status: "confirmed" | "unconfirmed_hint";
  basis: "info_items" | "template_scaffold" | "user_edited";
  match: MatchResult;
  duration: DurationPlan;
  duration_check: DurationCheck | null;
  scenes: PlanScene[];
  notes: string[];
  approval: PlanApproval | null;
  render_blockers: string[];
  render_gate: boolean;
  /** 이전 서버가 응답하면 없다. 장면에서 계산한 분할·재개 계획이며 실행 증거가 아니다. */
  render_plan?: RenderPlan;
  updated_at: string;
  history: Array<{ revision: number; kind: string; total_seconds: number | null; status: string }>;
}

export interface CreativeIntent {
  schema_version: 1;
  selections: Array<{
    entry_id: string;
    role: "primary" | "secondary";
    strength: "hard" | "soft";
    confidence: number;
    source: "user_explicit" | "llm_inferred" | "lexical_hint" | "default";
    evidence: Array<{ quote: string }>;
  }>;
  constraints: Array<{
    id: string;
    kind: string;
    hard: boolean;
    statement: string;
    source: "user_explicit" | "llm_inferred" | "lexical_hint" | "default";
    evidence: Array<{ quote: string }>;
  }>;
  duration: DurationRequest;
  aspect: "16:9" | "9:16" | "1:1" | null;
  info_items: Array<{ id: string; title: string; narration: string; weight: number; essential: boolean; evidence: Array<{ quote: string }> }>;
  music_seconds: number | null;
  open_questions: string[];
  extraction: { method: "llm" | "user_structured" | "lexical_hint"; model: string | null };
}

export interface IntentRunStart {
  session_id: string;
  run_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  engine: string;
  model: string | null;
  resumed_from?: string;
}

export interface IntentRunResult extends IntentRunStart {
  profile: string | null;
  error: string | null;
  brief?: string;
  intent: CreativeIntent | null;
  validation?: { valid: boolean; needs_confirmation: boolean; errors: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }> };
  selection_labels?: Array<{ entry_id: string; catalog: string; name: string }>;
  review_required?: boolean;
}

export interface CreativeCatalog {
  catalogs: Record<string, { name: string; entries: Array<{ id: string; name: string }> }>;
}

export interface SceneEditBody {
  id: string;
  title: string;
  narration: string;
  seconds: number;
  info_weight?: number;
  essential?: boolean;
}

const root = "/api/creative/v2";

export const planPolicy = () => json<DurationPolicy>(`${root}/duration/policy`);
export const planList = () => json<CreativePlan[]>(`${root}/plans`);
export const planGet = (id: string) => json<CreativePlan>(`${root}/plans/${id}`);
export const planCatalog = () => json<CreativeCatalog>(`${root}/catalog`);
export const planCreate = (body: {
  brief: string;
  name: string;
  duration: DurationRequest;
  aspect: string;
  intent?: CreativeIntent;
}) => json<CreativePlan>(`${root}/plans`, { method: "POST", json: body });
export const intentRunStart = (brief: string, requestKey: string) =>
  json<IntentRunStart>(`${root}/intent/runs`, { method: "POST", headers: { "Idempotency-Key": requestKey }, json: { brief } });
export const intentRunGet = (runId: string) => json<IntentRunResult>(`${root}/intent/runs/${runId}`);
export const intentRunResume = (runId: string, requestKey: string) =>
  json<IntentRunStart>(`${root}/intent/runs/${runId}/resume`, {
    method: "POST",
    headers: { "Idempotency-Key": requestKey },
    json: {},
  });
export const intentValidate = (brief: string, intent: CreativeIntent) =>
  json<IntentRunResult["validation"]>(`${root}/intent/validate`, { method: "POST", json: { brief, intent } });
export const planEdit = (
  id: string,
  body: { revision: number; scenes?: SceneEditBody[]; duration?: DurationRequest },
) => json<CreativePlan>(`${root}/plans/${id}`, { method: "PATCH", json: body });
export const planApprove = (id: string, revision: number) =>
  json<CreativePlan>(`${root}/plans/${id}/approve`, { method: "POST", json: { revision } });
export const productionGet = (id: string) => json<ProductionView>(`${root}/plans/${id}/production`);
export const productionDispatch = (id: string, revision: number) =>
  json<ProductionView>(`${root}/plans/${id}/production`, { method: "POST", json: { revision } });
export const productionRender = (id: string, revision: number) =>
  json<ProductionView>(`${root}/plans/${id}/production/render`, { method: "POST", json: { revision } });
