import { apiUrl, json } from "./client";

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
  characters?: string[];
  environment?: string[];
  camera?: string[];
  motion?: string[];
  audio?: string[];
  required_skills?: string[];
  selected_tools?: string[];
  selected_models?: string[];
  dependencies?: string[];
  output_assets?: string[];
  quality_checks?: string[];
  style_dna?: string | null;
  strategy?: string;
  strategy_rationale?: { reason?: string; source?: string; model?: string | null; scope?: string; feasibility?: string; alternatives?: Array<{ strategy: string; engine?: string; reason?: string; scope?: string }>; cost_latency_quality?: Record<string, unknown> } | null;
  selected_engine?: string | null;
  shots?: Array<{ shot_id: string; index?: number; title?: string; action: string; layers?: string[]; strategy?: string; required_capabilities?: string[]; selected_providers?: string[]; camera?: string[]; motion?: string[]; seconds?: number; start_time?: number; end_time?: number; cost_latency_quality?: Record<string, unknown> }>;
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
  | "awaiting_assets"
  | "ready_to_render"
  | "rendering"
  | "failed"
  | "qa_failed"
  | "succeeded";

export interface ProductionSegment {
  id: string;
  scene_ids: string[];
  seconds: number;
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "stale";
  attempts: number;
  error: string | null;
  project_id: string | null;
  job_id: string | null;
  run_key: string | null;
  output_sha256?: string | null;
  result_id?: string | null;
  metrics: { elapsed_seconds: number | null; peak_rss_bytes: number | null; cached_scenes: number | null } | null;
}

export interface QaCheck {
  id: string;
  passed: boolean;
  detail: string;
  measured: unknown;
}

export interface ProductionFinal {
  status: "qa_passed" | "qa_failed" | "assemble_failed";
  id: string | null;
  sha256: string | null;
  size: number | null;
  name: string | null;
  qa: { passed: boolean; checks: QaCheck[] } | null;
  planned_seconds: number | null;
  duration: {
    requested: { mode: string; seconds: number | null };
    plan_status: string;
    planned_seconds: number;
    measured_seconds: number | null;
  } | null;
  assembled_at: string | null;
  error: string | null;
}

export interface ProductionAssets {
  scenes_total: number;
  scenes_with_asset: number;
  missing_scene_ids: string[];
  music: { id: string; name: string; sha256: string; duration: number | null } | null;
  music_problem: string | null;
  complete: boolean;
}

export interface QualityStage {
  verdict: "pass" | "fail" | "unknown" | string;
  uncertainty?: number;
  reason?: string;
  checks?: Array<{ criterion_id: string; scene_id: string; verdict: string; uncertainty?: number; observations?: Array<Record<string, unknown>> }>;
  evaluators?: Array<{ id: string; version: string; source: string; independent?: boolean }>;
}

export interface QualityDefect {
  scene_id: string;
  shot_id?: string | null;
  code: string;
  layer: string;
  summary?: string;
  evidence?: Array<{ kind?: string; path?: string; sha256?: string; start_time?: number; end_time?: number; detail?: string }>;
  [key: string]: unknown;
}

export interface PartialRepairPlan {
  schema_version: number;
  status: "blocked" | "planned" | "not_needed" | string;
  plan_revision?: number;
  plan_sha256?: string;
  output_sha256?: string | null;
  caption_mode?: "narration" | "title_only" | null;
  proposal_sha256?: string;
  actions: Array<{ scene_id: string; shot_id?: string | null; code: string; layer: string; strategy: string; strategy_switched?: boolean; requires_reevaluation?: string[] }>;
  blocked: Array<{ defect?: QualityDefect; reason: string; action?: Record<string, unknown> }>;
  invalidate: { scene_ids: string[]; shot_ids: string[]; layers: string[]; segment_ids: string[]; final: boolean; quality_evidence: boolean };
  preserve: { scene_ids: string[]; shot_ids: string[]; segment_run_keys: Record<string, string>; asset_groups: string[]; asset_keys: string[] };
  cache_contract?: string;
}

export interface QualityReport {
  schema_version: number;
  output_sha256?: string | null;
  rubric?: { sha256?: string; criteria?: Array<{ id: string; stage: string; target?: string; description?: string }>; targets?: Array<{ scene_id: string }> };
  rubric_matches_record?: boolean;
  rubric_timing?: string;
  machine_qa: QualityStage;
  semantic_qa: QualityStage;
  viewing_qa: QualityStage;
  overall_verdict: string;
  defects: QualityDefect[];
  repair_plan: PartialRepairPlan;
}

export interface ProductionRevision {
  plan_id: string;
  revision: number;
  scenes: PlanScene[] | null;
  snapshot_available: boolean;
  producer_style_reviews: Array<Record<string, unknown>>;
  quality_report: QualityReport | null;
  review_execution: { status: string; execution_id?: string; verdict?: string; output_sha256?: string } | null;
  final: { id: string | null; status: string | null; sha256: string | null; name: string | null };
  segments: Array<{ id: string; scene_ids: string[]; run_key: string | null; status: string; sha256: string | null }>;
  repairs: Array<Record<string, unknown>>;
  changes?: Array<{ scene_id: string; shot_id?: string | null; layer: string; field: string; before: string; after: string }>;
}

export interface ProductionResultLink {
  url: string;
  expires_at: string;
  sha256: string;
  revision: number;
  result_id: string;
}

/** 승인된 계획의 제작 상태. 서버가 엔진 프로젝트의 실제 작업 상태를 읽어 계산한다. */
export interface ProductionView {
  plan_id: string;
  plan_revision: number;
  caption_mode?: "narration" | "title_only" | null;
  state: ProductionState;
  dispatchable: boolean;
  reasons: string[];
  assets: ProductionAssets;
  asset_generation_blockers?: string[];
  quality_report?: QualityReport | null;
  repair_plan?: PartialRepairPlan | null;
  review_execution?: { status: string; execution_id?: string; verdict?: string; output_sha256?: string } | null;
  history?: Array<{ revision: number; dispatched_at: string; final: string | null; final_sha256: string | null; snapshot_available: boolean }>;
  asset_generation: {
    id: string;
    plan_revision: number;
    recipe_id: string;
    status: "running" | "succeeded" | "failed";
    engine: { id: string; version: string };
    assets: {
      scenes: Record<string, { id: string; sha256: string }>;
      voices: Record<string, { id: string; sha256: string }>;
      music: { id: string; sha256: string };
    };
    receipt: Record<string, unknown> | null;
    error: string | null;
  } | null;
  engine: { adapter: string; version: string | null; mode?: string; producers?: string[] } | null;
  style?: { style_dna: string | null; applied: Record<string, string>; ignored: string[] };
  outdated_segments: string[];
  segments: ProductionSegment[];
  final: ProductionFinal | null;
  log: Array<{ at: string; event: string; segment?: string; error?: string | null }>;
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
  /** 게이트가 닫힌 이유. 열려 있으면 빈 배열이다. 서버 판정과 같은 조건이다. */
  render_gate_reasons?: string[];
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

export interface StoryboardRequest {
  brief: string;
  sources: Array<{ id: string; locator: string; text: string }>;
  engine: "qwen-local" | "codex";
  model?: string;
}
export interface StoryboardDraft {
  summary: string;
  catalog_ids: string[];
  knowledge: Array<{ source_id: string; quote: string; application: string }>;
  scenes: Array<{
    scene_id: string; title: string; narration: string; seconds: number; strategy: string;
    preset: string | null; rationale: string; source_ids: string[];
    alternatives: Array<{ strategy: string; rationale: string }>;
    shots: Array<{ shot_id: string; action: string; layers: string[]; required_capabilities: string[] }>;
  }>;
}
export interface StoryboardRunStart {
  run_id: string; session_id: string; engine: string; model: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  resumed_from?: string;
}
export interface StoryboardRunResult extends Omit<StoryboardRunStart, "resumed_from"> {
  phase: string;
  error: string | null;
  review_required: boolean;
  storyboard: StoryboardDraft | null;
  sources: StoryboardRequest["sources"];
  output_sha256?: string;
  resumed_from?: string | null;
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
export const storyboardRunStart = (body: StoryboardRequest, requestKey: string) =>
  json<StoryboardRunStart>(`${root}/storyboard/runs`, { method: "POST", headers: { "Idempotency-Key": requestKey }, json: body });
export const storyboardRunGet = (runId: string) => json<StoryboardRunResult>(`${root}/storyboard/runs/${runId}`);
export const storyboardRunResume = (runId: string, requestKey: string) =>
  json<StoryboardRunStart>(`${root}/storyboard/runs/${runId}/resume`, { method: "POST", headers: { "Idempotency-Key": requestKey }, json: {} });
export const storyboardRunCancel = (runId: string) => json<{ status: string }>(`${root}/storyboard/runs/${runId}/cancel`, { method: "POST" });
export const storyboardRunAccept = (runId: string, outputSha256: string) =>
  json<CreativePlan>(`${root}/storyboard/runs/${runId}/accept`, { method: "POST", json: { reviewed_output_sha256: outputSha256 } });
export const intentValidate = (brief: string, intent: CreativeIntent) =>
  json<IntentRunResult["validation"]>(`${root}/intent/validate`, { method: "POST", json: { brief, intent } });
export const planEdit = (
  id: string,
  body: { revision: number; scenes?: SceneEditBody[]; duration?: DurationRequest },
) => json<CreativePlan>(`${root}/plans/${id}`, { method: "PATCH", json: body });
export const planApprove = (id: string, revision: number) =>
  json<CreativePlan>(`${root}/plans/${id}/approve`, { method: "POST", json: { revision } });
export const productionGet = (id: string) => json<ProductionView>(`${root}/plans/${id}/production`);
export const productionDispatch = (id: string, revision: number, captionMode: "narration" | "title_only" = "narration") =>
  json<ProductionView>(`${root}/plans/${id}/production?caption_mode=${captionMode}`, { method: "POST", json: { revision } });
export const productionRender = (id: string, revision: number) =>
  json<ProductionView>(`${root}/plans/${id}/production/render`, { method: "POST", json: { revision } });
export const productionGenerateAssets = (id: string, revision: number) =>
  json<{ plan_id: string; plan_revision: number; status: "queued" | "running" }>(
    `${root}/plans/${id}/production/generate-assets`, { method: "POST", json: { revision } },
  );
export const productionUpload = (id: string, kind: "scene" | "music", file: File, sceneId?: string) => {
  const form = new FormData();
  form.append("kind", kind);
  if (sceneId) form.append("scene_id", sceneId);
  form.append("file", file);
  return json<{ id: string; sha256: string; name: string }>(`${root}/plans/${id}/production/assets`, { method: "POST", form });
};
export const productionMediaUrl = async (id: string, mediaId: string) => {
  const link = await json<{ url: string }>(`${root}/plans/${id}/production/media-link`, { method: "POST", json: { id: mediaId } });
  return apiUrl(link.url);
};

export const productionReview = (id: string, revision: number) =>
  json<{ status: string; execution_id?: string; verdict?: string; output_sha256?: string }>(`${root}/plans/${id}/production/review`, { method: "POST", json: { revision } });
export const productionRepairPlan = (id: string, revision: number, defects: QualityDefect[]) =>
  json<PartialRepairPlan>(`${root}/plans/${id}/production/repair-plan`, { method: "POST", json: { revision, defects } });
export const productionRepairApply = (id: string, revision: number, proposalSha256: string, updates: Array<{ scene_id: string; shot_id?: string | null; layer: "captions"; field: "title" | "narration"; text: string }>) =>
  json<{ status: "applied_needs_approval" | "blocked"; source_revision?: number; revision?: number; changes?: Array<{ scene_id: string; shot_id?: string | null; layer: string; field: string; before: string; after: string }>; preserve?: PartialRepairPlan["preserve"]; quality_state?: string }>(`${root}/plans/${id}/production/repair`, { method: "POST", json: { revision, proposal_sha256: proposalSha256, updates } });
export const productionRevision = (id: string, revision: number) =>
  json<ProductionRevision>(`${root}/plans/${id}/production/revisions/${revision}`);
export const productionResultUrl = async (id: string, revision: number, resultId = "final"): Promise<ProductionResultLink> => {
  const link = await json<ProductionResultLink>(`${root}/plans/${id}/production/result-link`, { method: "POST", json: { revision, result_id: resultId } });
  return { ...link, url: apiUrl(link.url) };
};
