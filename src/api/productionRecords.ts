import { ApiError, apiUrl, json } from "./client";

// 백엔드 back/src/ttakkari/creative/records.py 의 읽기 모델과 같은 모양이다. 값이 없으면 null 이고 화면은 '미측정'으로 보여 준다.
export type RecordSource = "g0" | "v1" | "lab";
export type RecordKind =
  | "production" | "project" | "motion_graphics" | "music_video" | "cinematic_3d" | "character_video"
  | "audio" | "image" | "video_gen" | "benchmark" | "pipeline" | "design";
export type RecordStatus = "completed" | "partial" | "failed" | "in_progress" | "draft";
export type RecordVerdict = "pass" | "conditional" | "fail" | "unreviewed";
export type Scalar = string | number | boolean | null;

export interface RecordSummary {
  id: string;
  source: RecordSource;
  source_label: string;
  title: string;
  kind: RecordKind;
  summary: string;
  status: RecordStatus;
  verdict: RecordVerdict;
  engines: string[];
  tags: string[];
  duration_seconds: number | null;
  created_at: string;
  shot_count: number;
  media_count: number;
  thumbnail_media_id: string | null;
  thumbnail_url: string | null;
  complete_media: boolean;
}

export interface RecordList {
  items: RecordSummary[];
  total: number;
  counts: Record<RecordSource, number>;
  kinds: RecordKind[];
  engines: string[];
  lab: { configured: boolean; available: boolean; skipped: Array<{ path: string; reason: string }> };
  skipped: Array<{ path: string; reason: string }>;
}

export type MediaRole =
  | "result" | "before" | "after" | "compare" | "keyframe" | "contact_sheet" | "audio" | "lyrics" | "evidence" | "reference" | "document";

export interface RecordMedia {
  id: string;
  kind: "video" | "audio" | "image" | "document";
  role: MediaRole;
  label: string;
  caption: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  available: boolean;
  url: string | null;
}

export interface RecordStage {
  key: string;
  label: string;
  status: "done" | "partial" | "skipped" | "failed" | "not_run";
  summary: string;
  seconds: number | null;
  details: string[];
}

export interface RecordShot {
  id: string;
  label: string;
  engine: string | null;
  model: string | null;
  prompt: string | null;
  seed: number | null;
  seconds: number | null;
  start_seconds: number | null;
  end_seconds: number | null;
  status: "ok" | "failed" | "flagged" | "not_run";
  keyframe_media_id: string | null;
  output_media_id: string | null;
  params: Record<string, Scalar>;
  note: string;
}

export interface RecordTool {
  name: string;
  kind: string;
  version: string | null;
  role: string;
  license: string | null;
}

export interface RecordMetric {
  key: string;
  label: string;
  value: number | string | null;
  unit: string | null;
  source: string | null;
  note: string;
}

export interface RecordTable {
  title: string;
  columns: string[];
  rows: Scalar[][];
  source: string | null;
}

export interface RecordDefect {
  id: string;
  location: string;
  symptom: string;
  fix: string | null;
  status: "fixed" | "open" | "wontfix";
}

export interface RecordRevision {
  label: string;
  summary: string;
  defects: RecordDefect[];
  media_ids: string[];
}

export interface RecordReview {
  verdict: RecordVerdict;
  reviewer: string;
  independent: boolean;
  summary: string;
  criteria: Array<{ name: string; result: "pass" | "fail" | "unknown"; evidence: string }>;
  limitations: string[];
}

export interface ProductionRecord {
  id: string;
  source: RecordSource;
  source_label: string;
  title: string;
  kind: RecordKind;
  summary: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string | null;
  brief: string;
  style: string;
  engines: string[];
  tags: string[];
  duration_seconds: number | null;
  thumbnail_media_id: string | null;
  stages: RecordStage[];
  shots: RecordShot[];
  tools: RecordTool[];
  metrics: RecordMetric[];
  tables: RecordTable[];
  cost: { usd: number | null; paid_services: string[]; note: string } | null;
  media: RecordMedia[];
  revisions: RecordRevision[];
  review: RecordReview;
  warnings: string[];
}

export const listProductionRecords = () => json<RecordList>("/api/creative/records", { query: { limit: 200 } });
export const getProductionRecord = (id: string) => json<ProductionRecord>(`/api/creative/records/${encodeURIComponent(id)}`);

/** 백엔드가 이 API 를 아직 배포하지 않은 경우(라우트 없음). 이때는 오류가 아니라 '배포 대기' 안내를 보여 준다. */
export const isRecordsUnsupported = (e: unknown): boolean =>
  e instanceof ApiError && (e.status === 404 || e.status === 405 || e.status === 501);

export const mediaSrc = (url: string | null): string | undefined => (url ? apiUrl(url) : undefined);
