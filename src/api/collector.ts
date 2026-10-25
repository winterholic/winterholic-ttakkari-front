import { json } from "./client";
export type KbScope = "personal" | "work";
export interface CollectSource {
  id: string; title: string; source_key: string; scope: KbScope; seeds: string[];
  enabled: boolean; auto_import: boolean; interval_minutes: number | null;
  next_run_at: string | null; last_job_id: string | null; version: number;
  request: { profile: string; max_pages: number; max_depth: number };
  policy?: { license_id: string | null; policy_url: string | null; basis: string; checked_at: string; permissions: Record<string,string> };
  last_error?: string | null;
}
export interface CollectJob {
  job_id: string; source_key: string; status: string; stage: string; created_at: string;
  attempts: number; cancel_requested: boolean; last_error: { code?: string; detail?: string } | null;
  cursor: { counts?: Record<string, number>; processed?: number } | null;
}
export interface CollectItem {
  id: string; url: string; status: string; reason_codes: string[]; text_chars: number | null;
  preview: string; language: string | null; delivery: { outcome: string; revision_id: string | null } | null;
}
export interface QualityStatus {
  reviewed_items: number; accepted: number; rejected: number; factuality: string; teacher_enabled: boolean;
  model: { digest: string; status: string; quality_gate: string;
    metrics: { train_count: number; validation_count: number; model: { precision: number; recall: number }; majority_baseline: { precision: number; recall: number } } } | null;
}
const base = "/api/assistant/collect";
const scopeQuery = (scope?: KbScope) => (scope ? { scope } : {});
export const collectSources = (scope?: KbScope) => json<{ items: CollectSource[]; runtime_enabled: boolean; daily_page_cap: number }>(`${base}/sources`, { query: scopeQuery(scope) });
export const createCollectSource = (scope: KbScope | undefined, body: Record<string, unknown>) => json<CollectSource>(`${base}/sources`, { method: "POST", query: scopeQuery(scope), json: body });
export const updateCollectSource = (id: string, scope: KbScope | undefined, enabled: boolean, version: number) => json<CollectSource>(`${base}/sources/${encodeURIComponent(id)}`, { method: "PATCH", query: scopeQuery(scope), json: { enabled, expected_version: version } });
export const runCollectSource = (id: string, scope?: KbScope) => json<CollectJob>(`${base}/sources/${encodeURIComponent(id)}/run`, { method: "POST", query: scopeQuery(scope) });
export const collectJobs = (scope?: KbScope, cursor?: string) => json<{ jobs: CollectJob[]; next_cursor: string | null }>(`${base}/jobs`, { query: { ...scopeQuery(scope), cursor, limit: 20 } });
export const collectItems = (id: string, scope?: KbScope, offset = 0) => json<{ items: CollectItem[]; total: number; limit: number; offset: number }>(`${base}/jobs/${encodeURIComponent(id)}/items`, { query: { ...scopeQuery(scope), offset } });
export const retryCollectJob = (id: string, scope?: KbScope) => json<CollectJob>(`${base}/jobs/${encodeURIComponent(id)}/retry`, { method: "POST", query: scopeQuery(scope) });
export const cancelCollectJob = (id: string, scope?: KbScope) => json(`${base}/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", query: scopeQuery(scope) });
export const collectQuality = (scope?: KbScope) => json<QualityStatus>(`${base}/quality`, { query: scopeQuery(scope) });
export const trainCollectQuality = (scope?: KbScope) => json(`${base}/quality/train`, { method: "POST", query: scopeQuery(scope) });
export const reviewCollectItem = (id: string, scope: KbScope | undefined, decision: "accept" | "reject" | "hold", reason: string) => json(`${base}/items/${encodeURIComponent(id)}/reviews`, { method: "POST", query: scopeQuery(scope), json: { decision, reason } });
export const importCollectItem = (id: string, scope?: KbScope) => json(`${base}/items/${encodeURIComponent(id)}/import`, { method: "POST", query: scopeQuery(scope) });

export const editCollectSource = (id: string, scope: KbScope | undefined, body: Record<string, unknown>) => json<CollectSource>(`${base}/sources/${encodeURIComponent(id)}`, { method: "PATCH", query: scopeQuery(scope), json: body });

export interface CollectSummary {
  funnel: { discovered: number; fetched: number; extracted: number; accepted: number; held: number; blocked: number; failed: number;
    not_modified: number; delivered: number; awaiting_delivery: number; awaiting_review: number };
  jobs: Record<string, number>; outbox: Record<string, number>;
  waiting: { job_id: string; status: string; source_key: string; not_before: string | null; reason: string | null }[];
  runtime: { loop_available: boolean; paused: boolean; reason: string | null; since: string | null };
  budget: CollectBudget; daily_page_cap: number;
}
export interface CollectBudget {
  day: string; timezone: string; teacher_enabled: boolean; unsettled: number;
  tokens: { limit: number; used: number; remaining: number }; calls: { limit: number; used: number; remaining: number };
  micro_usd: { limit: number; used: number; remaining: number };
  per_job: { tokens: number; calls: number; micro_usd: number };
  pages?: { limit: number; reserved: number };
}
export interface ReviewItem {
  id: string; url: string; source_key: string; status: string; reason_codes: string[]; language: string | null;
  text_chars: number | null; preview: string; signals: Record<string, unknown>; can_reprocess: boolean;
}
export interface CollectItemDetail {
  id: string; url: string; final_url: string | null; status: string; stage: string; http_status: number | null;
  language: string | null; text_chars: number | null; reason_codes: string[]; preview: string;
  decision: { state: string; reason_codes: string[] } | null;
  quality: Record<string, { score: number | null; status?: string }> | null;
  versions: { parser: string | null; normalizer: string | null };
  hashes: { raw_sha256: string | null; text_sha256: string | null; payload: string | null };
  rights: { permission?: string; purposes?: string[]; license_id?: string | null; policy_url?: string | null };
  reviews: { decision: string; reason: string; at: string; current: boolean }[];
  deliveries: { outbox_id: string; sink: string; status: string; attempts: number; last_error: string | null; outcome: string | null }[];
}
export interface CollectDelivery {
  outbox_id: string; job_id: string; sink: string; status: string; attempts: number; not_before: string | null;
  last_error: string | null; created_at: string; delivered_at: string | null; outcome: string | null;
}
export interface CollectRuntime {
  loop_available: boolean; general_consume_enabled: boolean; paused: boolean; reason: string | null; since: string | null;
  pilot: { seeded: string[]; rights_checked_at: string } | null; pilot_enabled: boolean; ml_spending_enabled: boolean;
}
export const collectSummary = (scope?: KbScope) => json<CollectSummary>(`${base}/summary`, { query: scopeQuery(scope) });
export const collectBudgets = (scope?: KbScope) => json<CollectBudget>(`${base}/budgets`, { query: scopeQuery(scope) });
export const collectReviewQueue = (scope?: KbScope, offset = 0) => json<{ items: ReviewItem[]; total: number; limit: number; offset: number }>(`${base}/review`, { query: { ...scopeQuery(scope), offset } });
export const collectItemDetail = (id: string, scope?: KbScope) => json<CollectItemDetail>(`${base}/items/${encodeURIComponent(id)}`, { query: scopeQuery(scope) });
export const reprocessCollectItem = (id: string, scope?: KbScope) => json<{ job_id: string; status: string }>(`${base}/items/${encodeURIComponent(id)}/reprocess`, { method: "POST", query: scopeQuery(scope) });
export const collectDeliveries = (scope?: KbScope, status?: string, offset = 0) => json<{ items: CollectDelivery[]; total: number; limit: number; offset: number }>(`${base}/deliveries`, { query: { ...scopeQuery(scope), status, offset } });
export const reconcileCollectDelivery = (id: string, scope?: KbScope) => json<{ state: string; status: string }>(`${base}/deliveries/${encodeURIComponent(id)}/reconcile`, { method: "POST", query: scopeQuery(scope) });
export const collectRuntime = (scope?: KbScope) => json<CollectRuntime>(`${base}/runtime`, { query: scopeQuery(scope) });
export const setCollectRuntime = (scope: KbScope | undefined, paused: boolean, reason: string) => json<{ paused: boolean }>(`${base}/runtime`, { method: "PUT", query: scopeQuery(scope), json: { paused, reason } });
export const registerCollectPilot = (scope?: KbScope) => json<{ created: string[]; available: string[] }>(`${base}/pilot`, { method: "POST", query: scopeQuery(scope) });
export interface HoldAudit { day: string; per_group: number; groups: { source_key: string; reason: string; held: number; sampled: number }[]; items: ReviewItem[] }
export const collectHoldAudit = (scope?: KbScope) => json<HoldAudit>(`${base}/review/audit`, { query: { ...scopeQuery(scope), per_group: 2 } });
