// NotebookLM 연동(백엔드 ADR 0045). 필드·상태값은 back/src/ttakkari/notebooklm/ports.py 와 service.py 기준이다.

export type NlmState = "login_required" | "session_saved" | "ready" | "reauth_required" | "cooldown" | "blocked" | "disabled";
export type NlmLoginState = "idle" | "starting" | "waiting" | "protection" | "saving" | "done" | "timeout" | "cancelled" | "failed";

export interface NlmLogin {
  state: NlmLoginState;
  message: string | null;
  active: boolean;
  started_at: string | null;
  finished_at: string | null;
}

export interface NlmCapability {
  name: string;
  available: boolean;
  reason: string | null;
}

export interface NlmMetrics {
  counters: Record<string, number>;
  latency: Record<string, { count: number; avg_ms: number; max_ms: number }>;
  scope: string;
}

export interface NlmAuthStatus {
  account_id: string;
  state: NlmState;
  message: string | null;
  logged_in: boolean | null;
  reauth_required: boolean;
  cooldown_until: string | null;
  retry_after: number | null;
  last_ok_at: string | null;
  last_checked_at: string | null;
  last_error_code: string | null;
  /** 이 프로세스가 본 마지막 실패의 사람용 요약. 성공하면 비워진다. */
  last_error?: { code: string; message: string; detail: string | null; at: string } | null;
  session: {
    stored: boolean;
    cookie_names: string[];
    permissions_ok: boolean | null;
    encrypted: boolean;
    protection: string;
  };
  login: NlmLogin;
  browser_available: boolean;
  backend: string;
  capabilities: NlmCapability[];
  limits: {
    concurrency: number;
    read_retry_max: number;
    request_timeout_seconds: number;
    query_timeout_seconds: number;
  };
  metrics: NlmMetrics;
}

export type NlmSourceKind = "web_page" | "youtube" | "pasted_text" | "pdf" | "document" | "media" | "other";
export type NlmSourceStatus = "processing" | "ready" | "error" | "unknown";

export interface NlmSource {
  id: string;
  title: string | null;
  kind: NlmSourceKind;
  url: string | null;
  status: NlmSourceStatus;
  created_at: string | null;
  word_count: number | null;
}

export interface NlmNotebook {
  id: string;
  title: string;
  source_count: number;
  created_at: string | null;
  updated_at: string | null;
  is_owner: boolean;
}

export interface NlmNotebookDetail extends NlmNotebook {
  sources: NlmSource[];
}

export type NlmJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";

export interface NlmJob {
  id: string;
  kind: string;
  notebook_id: string | null;
  status: NlmJobStatus;
  /** url 작업: {url, kind}, 텍스트: {title, chars}, 파일: {file_name, sha256}, 질의: {question_preview, conversation_id?, source_ids?} */
  params: Record<string, unknown> | null;
  /** 소스 성공: {source, ready, note?}, 질의 성공: {query, ledger_export?}, 결과 불명: {outcome_unknown: true} */
  result: { source?: NlmSource; ready?: boolean; note?: string; outcome_unknown?: boolean; query?: NlmQueryResult } | null;
  error_code: string | null;
  error: string | null;
  cancel_requested: boolean;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** 이미 등록된 소스(200)에서는 id·title·kind 만 온다. kind 는 등록 시점 구분(url·youtube·text·file)이라 NlmSourceKind 와 다를 수 있다. */
export interface NlmDuplicateSource {
  id: string | null;
  title: string | null;
  kind: string;
}

export type NlmAddSourceResult =
  | { duplicate: false; job: NlmJob; source: null }
  | { duplicate: true; job: null; source: NlmDuplicateSource };

export interface NlmSpan {
  start: number;
  end: number;
}

export interface NlmCitation {
  number: number | null;
  source_id: string;
  quoted_text: string | null;
  source_span: NlmSpan | null;
  answer_span: NlmSpan | null;
  chunk_id: string | null;
  score: number | null;
}

export interface NlmSourceRef {
  id: string;
  title: string | null;
  url: string | null;
  kind: NlmSourceKind;
  citation_numbers: number[];
}

export interface NlmQueryResult {
  notebook_id: string;
  query: string;
  answer: string;
  conversation_id: string | null;
  turn_number: number | null;
  citations: NlmCitation[];
  sources: NlmSourceRef[];
  created_at: string;
}

export interface NlmQueryIn {
  question: string;
  conversation_id?: string | null;
  source_ids?: string[] | null;
  export_for_ledger?: boolean;
}

/** 비동기 질의 시작(202) 응답. 결과는 job 조회로 받는다. */
export interface NlmStartQueryResult {
  job: NlmJob;
}
