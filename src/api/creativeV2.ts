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
  info_items: Array<{ id: string; title: string; narration: string; weight: number; essential: boolean }>;
  music_seconds: number | null;
  open_questions: string[];
  extraction: { method: "llm" | "user_structured" | "lexical_hint"; model: string | null };
}

export interface IntentExtractionResult {
  intent: CreativeIntent;
  validation: { valid: boolean; needs_confirmation: boolean; errors: Array<{ code: string; message: string }>; warnings: Array<{ code: string; message: string }> };
  selection_labels: Array<{ entry_id: string; catalog: string; name: string }>;
  review_required: boolean;
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
export const planCreate = (body: {
  brief: string;
  name: string;
  duration: DurationRequest;
  aspect: string;
  intent?: CreativeIntent;
}) => json<CreativePlan>(`${root}/plans`, { method: "POST", json: body });
export const intentExtract = (brief: string) =>
  json<IntentExtractionResult>(`${root}/intent/extract`, { method: "POST", json: { brief } });
export const planEdit = (
  id: string,
  body: { revision: number; scenes?: SceneEditBody[]; duration?: DurationRequest },
) => json<CreativePlan>(`${root}/plans/${id}`, { method: "PATCH", json: body });
export const planApprove = (id: string, revision: number) =>
  json<CreativePlan>(`${root}/plans/${id}/approve`, { method: "POST", json: { revision } });
