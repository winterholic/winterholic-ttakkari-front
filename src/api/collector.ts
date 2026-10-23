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
export const collectSources = (scope: KbScope) => json<{ items: CollectSource[]; runtime_enabled: boolean; daily_page_cap: number }>(`${base}/sources`, { query: { scope } });
export const createCollectSource = (scope: KbScope, body: Record<string, unknown>) => json<CollectSource>(`${base}/sources`, { method: "POST", query: { scope }, json: body });
export const updateCollectSource = (id: string, scope: KbScope, enabled: boolean, version: number) => json<CollectSource>(`${base}/sources/${encodeURIComponent(id)}`, { method: "PATCH", query: { scope }, json: { enabled, expected_version: version } });
export const runCollectSource = (id: string, scope: KbScope) => json<CollectJob>(`${base}/sources/${encodeURIComponent(id)}/run`, { method: "POST", query: { scope } });
export const collectJobs = (scope: KbScope, cursor?: string) => json<{ jobs: CollectJob[]; next_cursor: string | null }>(`${base}/jobs`, { query: { scope, cursor, limit: 20 } });
export const collectItems = (id: string, scope: KbScope, offset = 0) => json<{ items: CollectItem[]; total: number; limit: number; offset: number }>(`${base}/jobs/${encodeURIComponent(id)}/items`, { query: { scope, offset } });
export const retryCollectJob = (id: string, scope: KbScope) => json<CollectJob>(`${base}/jobs/${encodeURIComponent(id)}/retry`, { method: "POST", query: { scope } });
export const cancelCollectJob = (id: string, scope: KbScope) => json(`${base}/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST", query: { scope } });
export const collectQuality = (scope: KbScope) => json<QualityStatus>(`${base}/quality`, { query: { scope } });
export const trainCollectQuality = (scope: KbScope) => json(`${base}/quality/train`, { method: "POST", query: { scope } });
export const reviewCollectItem = (id: string, scope: KbScope, decision: "accept" | "reject" | "hold", reason: string) => json(`${base}/items/${encodeURIComponent(id)}/reviews`, { method: "POST", query: { scope }, json: { decision, reason } });
export const importCollectItem = (id: string, scope: KbScope) => json(`${base}/items/${encodeURIComponent(id)}/import`, { method: "POST", query: { scope } });

export const editCollectSource = (id: string, scope: KbScope, body: Record<string, unknown>) => json<CollectSource>(`${base}/sources/${encodeURIComponent(id)}`, { method: "PATCH", query: { scope }, json: body });
