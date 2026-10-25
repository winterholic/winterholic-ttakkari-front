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
export interface CollectionMission {
  id: string; title: string; goal: string; status: string;
  plan: CollectionPlan;
  counts: Record<string, number>;
  jobs: { job_id: string; status: string; stage: string; error: { code?: string; detail?: string } | null }[];
  gaps: { url?: string; reason: string; message: string }[];
  results: { id: string; url: string; title: string; status: string; reasons: string[]; document_id: string | null; revision_id: string | null; delivery: string | null }[];
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
