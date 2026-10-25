import { json } from "./client";

export interface CollectionPlan {
  title: string; mode: string;
  steps: string[];
  sources: { url: string; adapter: string; provenance: string }[];
  queries: string[];
  coverage: { topic: string; state: string }[];
  budget: { pages: number; depth: number; searches: number; seconds: number };
  stop_conditions: string[];
  schedule?: { interval_minutes: number | null; updated_at?: string };
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
    precise_eval?: { engine?: string; [key: string]: unknown };
  };
  jobs: { job_id: string; status: string; stage: string; run_seq?: number; error: { code?: string; detail?: string } | null }[];
  gaps: { url?: string; reason: string; message: string }[];
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
  delivery_queued?: boolean;
  reasons?: string[];
  review?: { decision?: string; meaning?: string; factuality?: string };
}
export const unholdCollectionMissionItem = (missionId: string, itemId: string) =>
  json<UnholdMissionItemResult>(`${base}/${encodeURIComponent(missionId)}/items/${encodeURIComponent(itemId)}/unhold`, { method: "POST" });
