/** Reverse API types. V2 fields stay optional so old records remain readable. */

export type ReverseStatus = "queued" | "running" | "waiting" | "partial" | "done" | "failed" | "needs_input";
export type ReverseKind = "reconstruction" | "git_url" | "local_path";
export type ReverseTargetType = "auto" | "cli" | "web" | "api" | "source";
export type ReverseMode = "auto" | "analyze" | "reconstruct" | "analyze_reconstruct";
export type ComparisonResult = "match" | "mismatch" | "unverified";

export interface ReverseComparisonSummary {
  status: ComparisonResult;
  count: number;
  matched: number;
  mismatched: number;
  unverified: number;
}

export interface ReverseVisualComparisonSummary extends Omit<ReverseComparisonSummary, "status"> {
  status: ComparisonResult | "not_required";
}

export interface ReverseScreenshotReference {
  path: string;
  sha256?: string;
  size_bytes?: number;
  viewport?: { width: number; height: number; device_scale_factor: number };
  format?: "png" | string;
}

export interface ReverseEvidenceItem {
  kind: string;
  /** Non-web evidence may use a direct path; web_capture uses capture.path. */
  path?: string;
  sha256?: string;
  capture?: { path?: string; sha256?: string; size_bytes?: number };
  integrity?: { status?: string | null; reason?: string | null; reasons?: string[] };
  provenance?: { status?: string | null; reason?: string | null; reasons?: string[] };
}

export interface ReverseStage {
  key: string; label: string; status: "pending" | "running" | "waiting" | "done" | "failed" | "skipped";
  started_at: string | null; finished_at: string | null; evidence: string[]; notes: string[];
}

export interface ReverseRecommendation {
  target_type: ReverseTargetType; mode: ReverseMode; reasons: string[];
}

export interface ReverseCheck {
  command: string;
  exit_code?: number | null;
  expected_exit_code?: number;
  required?: boolean;
  log?: string;
  reason?: string;
}

export interface ReverseReport {
  summary?: string;
  ready?: boolean;
  verdict?: string | null;
  checks?: ReverseCheck[];
  problems?: string[];
}

export interface ReverseComparison {
  id: string; behavior: string; target_type: ReverseTargetType; input: Record<string, unknown>;
  pre_state: Record<string, unknown>;
  original: (Record<string, unknown> & { screenshot?: ReverseScreenshotReference | null }) | null;
  replica: Record<string, unknown> & { screenshot?: ReverseScreenshotReference | null };
  environment: Record<string, unknown>;
  evidence_level: "direct" | "observed" | "inferred" | "unknown";
  evidence: ReverseEvidenceItem[];
  verified_at: string | null; run_id: string; result: ComparisonResult;
  difference: Record<string, unknown> | null;
  functional_result?: ComparisonResult;
  visual_result?: ComparisonResult;
  visual_assessment?: Record<string, unknown> | null;
}

export interface ReverseSnapshot {
  run_id?: string;
  created_at?: string;
  status?: string;
  report?: Record<string, unknown>;
  source?: { status: string; files?: string[] };
  execution?: { status: string; checks?: ReverseCheck[] };
  direct_comparison?: ReverseComparisonSummary;
  visual_comparison?: ReverseVisualComparisonSummary;
  independent_verification?: { status: string; run_id?: string | null; verdict?: string | null };
  comparisons?: ReverseComparison[];
  verification_direct_comparison?: ReverseComparisonSummary;
  verification_visual_comparison?: ReverseVisualComparisonSummary;
  verification_comparisons?: ReverseComparison[];
  verification_report?: ReverseReport;
}

export interface ReverseV2Result {
  schema_version: 2;
  job?: { title?: string; target_type?: ReverseTargetType; mode?: ReverseMode };
  recommendation?: ReverseRecommendation;
  plan?: string[];
  latest?: ReverseSnapshot | null;
  history?: (ReverseSnapshot & { run_id?: string; created_at?: string; status?: string })[];
}

export interface ReverseSummary {
  id: string; target: string; title?: string | null; target_type?: ReverseTargetType; mode?: ReverseMode;
  recommendation?: ReverseRecommendation; plan?: string[];
  result?: ReverseV2Result | LegacyReverseResult | null;
  /** Current public API returns these alongside result=null on detail responses. */
  latest?: ReverseSnapshot | null;
  history?: (ReverseSnapshot & { run_id?: string; created_at?: string; status?: string })[];
  result_state?: {
    source?: ReverseSnapshot["source"];
    execution?: ReverseSnapshot["execution"];
    direct_comparison?: ReverseSnapshot["direct_comparison"];
    visual_comparison?: ReverseSnapshot["visual_comparison"];
    verification_direct_comparison?: ReverseSnapshot["verification_direct_comparison"];
    verification_visual_comparison?: ReverseSnapshot["verification_visual_comparison"];
    independent_verification?: ReverseSnapshot["independent_verification"];
  };
  independent_verification?: ReverseSnapshot["independent_verification"];
  direct_comparison?: ReverseSnapshot["direct_comparison"];
  kind: ReverseKind; status: ReverseStatus; revision: string | null; stage: string; error: string | null;
  created_at: string; updated_at: string; overview?: string; workspace_id?: string;
  session_id?: string; verifier_session_id?: string | null; output_path?: string;
  progress?: string | null; waiting_reason?: string | null;
}

export interface ReverseArchitecture { title: string; body: string; evidence: string[] }
export interface ReverseModule { path: string; role: string; evidence: string[] }
export interface ReverseFlow { title: string; steps: string[]; evidence: string[] }
export interface ReverseIdea { title: string; body: string; evidence: string[] }
export interface LegacyReverseResult {
  overview: { text: string; evidence: string[] }; architecture: ReverseArchitecture[]; modules: ReverseModule[];
  flows: ReverseFlow[]; ideas: ReverseIdea[]; limitations: string[];
  stats: { files: number; bytes: number; langs: [string, number][]; revision: string | null; files_parsed: number;
    model?: { engine: string; model: string; account?: string; via: string; files_read: number; merged: boolean; masked: number } };
}

export interface ReverseDetail extends ReverseSummary {
  stages: ReverseStage[];
  result: LegacyReverseResult | ReverseV2Result | null;
  reconstruction?: {
    summary: string; source_files: string[]; observations: { finding: string; evidence: string; evidence_level?: "direct" | "document" | "inferred" | "unknown" }[];
    hypotheses?: { finding: string; evidence?: string; evidence_level?: "direct" | "document" | "inferred" | "unknown" }[]; unknowns?: string[];
    source_preview?: { path: string; content: string }[];
    checks: { command: string; exit_code: number; log: string }[]; limitations: string[]; verification: string;
  } | null;
  rounds?: { id: string; session_id: string; status: string; role: string; result_text: string; error: string | null; engine: string; model: string | null }[];
  activity?: { type: string; at: string; text: string }[];
  outputs?: import("./types").ArtifactOut[];
}

export const isReverseV2Result = (result: ReverseDetail["result"]): result is ReverseV2Result =>
  !!result && "schema_version" in result && result.schema_version === 2;

/** Normalize both the intended nested v2 envelope and today's flattened public detail response. */
export function reverseV2FromDetail(detail: ReverseDetail): ReverseV2Result | null {
  const nested = isReverseV2Result(detail.result) ? detail.result : null;
  if (!nested && detail.latest === undefined && detail.history === undefined && detail.result_state === undefined) return null;
  const latest = detail.latest ?? nested?.latest ?? null;
  const state = detail.result_state;
  const mergedLatest = latest || state ? {
    ...(latest ?? {}),
    ...(state?.source && !latest?.source ? { source: state.source } : {}),
    ...(state?.execution && !latest?.execution ? { execution: state.execution } : {}),
    ...(state?.direct_comparison && !latest?.direct_comparison ? { direct_comparison: state.direct_comparison } : {}),
    ...(state?.visual_comparison && !latest?.visual_comparison ? { visual_comparison: state.visual_comparison } : {}),
    ...(state?.verification_direct_comparison && !latest?.verification_direct_comparison
      ? { verification_direct_comparison: state.verification_direct_comparison } : {}),
    ...(state?.verification_visual_comparison && !latest?.verification_visual_comparison
      ? { verification_visual_comparison: state.verification_visual_comparison } : {}),
    ...(state?.independent_verification && !latest?.independent_verification ? { independent_verification: state.independent_verification } : {}),
  } : null;
  return {
    schema_version: 2,
    ...(nested ?? {}),
    recommendation: detail.recommendation ?? nested?.recommendation,
    plan: detail.plan?.length ? detail.plan : nested?.plan ?? detail.plan ?? [],
    latest: mergedLatest,
    history: detail.history?.length ? detail.history : nested?.history ?? detail.history ?? [],
  };
}

export function reverseEvidenceLabel(level?: string | null): string {
  if (level === "direct" || level === "observed") return "직접 관찰 근거";
  if (level === "document") return "문서 근거";
  if (level === "inferred") return "추론 근거";
  return "근거 수준 미상";
}
