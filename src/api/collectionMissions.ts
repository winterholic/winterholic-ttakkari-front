import { json } from "./client";

export interface CollectionCoverageEntry {
  topic: string; state: string;
  key?: string; sources?: number; documents?: number; hosts?: number;
}
export interface CollectionPaperLicense {
  id?: string | null; url?: string | null; source?: string; permission?: string; error?: string | null;
}
export interface CollectionPaper {
  kind?: string; identifier: string; canonical_url?: string; title?: string;
  authors?: string[]; year?: number | null; venue?: string | null; doi?: string | null;
  license?: CollectionPaperLicense;
  fulltext?: string; rights_note?: string | null; metadata_source?: string; topics?: string[];
}
export interface CollectionContextRelation {
  claim_id: string; type: string; matched_terms?: string[]; snippet?: string | null;
  target?: { kind?: string; url?: string; title?: string; document_id?: string; identifier?: string };
  verification?: string;
}
export interface CollectionContextLinks {
  claims?: { id: string; text: string }[];
  relations?: CollectionContextRelation[];
  unlinked?: string[];
  provenance?: string; verification?: string; documents?: number; computed_at?: string;
}
export interface CollectionSearchHistoryEntry {
  query: string; status?: string; candidates?: number; new_sources?: number; error?: string | null;
  run_seq?: number; round?: number; topic?: string | null;
}
export interface CollectionPlan {
  title: string; mode: string;
  steps: string[];
  sources: { url: string; adapter: string; provenance: string }[];
  queries: string[];
  coverage: CollectionCoverageEntry[];
  budget: { pages: number; depth: number; searches: number; seconds: number; rounds?: number; papers?: number };
  stop_conditions: string[];
  schedule?: { interval_minutes: number | null; updated_at?: string };
  query_topics?: Record<string, string>;
  search_history?: CollectionSearchHistoryEntry[];
  research?: { run_seq?: number | null; failed?: { index: number; code?: string; retryable?: boolean; attempts?: number }[] };
  papers?: CollectionPaper[];
  context?: { text?: string; provenance?: string; fact_check_status?: string };
  context_links?: CollectionContextLinks;
}
export interface CollectionResearchRound {
  round: number; at?: string; queries?: string[]; reasons?: string[]; new_papers?: number;
  new_documents_since_previous?: number | null; documents?: number; duplicates?: number; stop?: string | null;
}
/** 상세 응답(detailed)에만 있다. 목록 응답과 연구 이전 임무는 null 이거나 없다. */
export interface CollectionResearch {
  coverage?: CollectionCoverageEntry[];
  remaining?: { topic: string; state: string }[];
  round?: number; stop?: string | null;
  searches_used?: number; search_budget?: number | null; model_calls?: number;
  papers?: { resolved?: number; fulltext?: number; metadata_only?: number };
  rounds?: CollectionResearchRound[];
}
export interface CollectionMissionRun {
  run_seq: number;
  trigger: string;
  started_at: string;
  page_budget: number;
  pages_used: number;
  collected: number;
  unchanged: number;
  imported: number;
  in_progress: boolean;
}

export interface CollectionTriageAxis {
  status?: string;
  value?: number | null;
  scale?: string;
  model_id?: string;
  model_revision?: string;
  validation?: string;
  reason?: string;
  evidence?: string[];
  raw?: number;
  probability_uncalibrated?: number;
}
export interface CollectionTriage {
  status?: string;
  scores?: Record<string, number>;
  reasons?: string[];
  mode?: string;
  verified?: boolean;
  axes?: Record<string, CollectionTriageAxis>;
  validation?: { overall?: string; validated_axes?: string[]; axes?: Record<string, string>; note?: string };
  stage2?: { status?: string; reason?: string; effects?: string[] };
  precise_eval?: { state?: string; engine?: string; reason?: string; reasons?: string[]; note?: string };
}
export interface CollectionMissionResult {
  id: string; url: string; title: string; status: string; reasons: string[];
  document_id: string | null; revision_id: string | null; delivery: string | null;
  triage?: CollectionTriage | null;
}

export interface CollectionMission {
  id: string; title: string; goal: string; status: string;
  plan: CollectionPlan;
  run_seq?: number;
  runs?: CollectionMissionRun[];
  counts: Record<string, number>;
  triage?: {
    accepted?: number; review_needed?: number; held?: number; reasons?: Record<string, number>;
    policy?: { mode?: string; model?: string; revision?: string; status?: string; verified?: boolean };
    ml?: { status?: string; [key: string]: unknown };
    precise_eval?: { engine?: string; pending?: number; processing?: number; unresolved?: number; [key: string]: unknown };
  };
  jobs: { job_id: string; status: string; stage: string; run_seq?: number; error: { code?: string; detail?: string } | null }[];
  gaps: { url?: string; reason: string; message: string; identifier?: string; stop?: string; queries?: number; codes?: string[]; topics?: { topic: string; state: string }[] }[];
  research?: CollectionResearch | null;
  results: CollectionMissionResult[];
  knowledge_processing: { storage: string; semantic: string };
  created_at: string; updated_at: string;
}
export interface MissionInput { goal: string; context?: string; urls?: string[]; max_pages?: number; max_depth?: number; request_key?: string }
const base = "/api/assistant/collect/missions";
export const collectionMissions = () => json<{ items: CollectionMission[] }>(base);
export const collectionMission = (id: string) => json<CollectionMission>(`${base}/${encodeURIComponent(id)}`);
export const createCollectionMission = (input: MissionInput) => json<CollectionMission>(base, { method: "POST", json: input });
export const previewCollectionPlan = (input: MissionInput) => json<CollectionPlan>(`${base}/plan`, { method: "POST", json: input });
export const pauseCollectionMission = (id: string) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/pause`, { method: "POST" });
export const resumeCollectionMission = (id: string) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/resume`, { method: "POST" });
export const cancelCollectionMission = (id: string) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const extendCollectionMission = (id: string, addPages: number) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/extend`, { method: "POST", json: { add_pages: addPages } });
export const rerunCollectionMission = (id: string) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/rerun`, { method: "POST" });
export const scheduleCollectionMission = (id: string, intervalMinutes: number | null) =>
  json<CollectionMission>(`${base}/${encodeURIComponent(id)}/schedule`, { method: "POST", json: { interval_minutes: intervalMinutes } });
export interface UnholdMissionItemResult {
  item_id: string;
  status: string;
  message?: string;
  delivery_queued?: boolean;
  reasons?: string[];
  review?: { decision?: string; meaning?: string; factuality?: string };
}
export const unholdCollectionMissionItem = (missionId: string, itemId: string) =>
  json<UnholdMissionItemResult>(`${base}/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}/unhold`, { method: "POST" });
