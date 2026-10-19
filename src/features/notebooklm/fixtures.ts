import type { NlmAuthStatus, NlmJob, NlmNotebookDetail, NlmQueryResult } from "../../api/notebooklmTypes";

/** 테스트와 화면 확인용 합성 데이터. 실제 Google 데이터가 아니다. */
export const OFF_REASON = "상류 공개 API에는 있으나 이번 단계 범위 밖이라 연결하지 않았습니다.";

export function authStatus(over: Partial<NlmAuthStatus> = {}): NlmAuthStatus {
  return {
    account_id: "primary",
    state: "login_required",
    message: "로그인한 적이 없습니다. 로그인 창을 열어 한 번 로그인해 주세요.",
    logged_in: false,
    reauth_required: false,
    cooldown_until: null,
    retry_after: null,
    last_ok_at: null,
    last_checked_at: null,
    last_error_code: null,
    session: { stored: false, cookie_names: [], permissions_ok: null, encrypted: false, protection: "소유자 전용 파일 권한(0600/0700)만 사용합니다. 암호화하지 않습니다." },
    login: { state: "idle", message: null, active: false, started_at: null, finished_at: null },
    browser_available: true,
    backend: "notebooklm-py",
    capabilities: [
      { name: "notebooks", available: true, reason: null },
      { name: "sources.url", available: true, reason: null },
      { name: "sources.youtube", available: true, reason: null },
      { name: "sources.text", available: true, reason: null },
      { name: "sources.file", available: true, reason: null },
      { name: "query.citations", available: true, reason: null },
      { name: "audio_overview", available: false, reason: OFF_REASON },
      { name: "video_overview", available: false, reason: OFF_REASON },
      { name: "research", available: false, reason: OFF_REASON },
      { name: "drive_sources", available: false, reason: OFF_REASON },
      { name: "sharing", available: false, reason: OFF_REASON },
    ],
    limits: { concurrency: 2, read_retry_max: 2, request_timeout_seconds: 60, query_timeout_seconds: 180 },
    metrics: { counters: {}, latency: {}, scope: "process" },
    ...over,
  };
}

export const NOTEBOOK: NlmNotebookDetail = {
  id: "nb1",
  title: "AI 논문 리서치",
  source_count: 3,
  created_at: "2026-10-18T01:00:00Z",
  updated_at: "2026-10-19T01:00:00Z",
  is_owner: true,
  sources: [
    { id: "s1", title: "Attention Is All You Need", kind: "pdf", url: null, status: "ready", created_at: null, word_count: 8200 },
    { id: "s2", title: "트랜스포머 해설 영상", kind: "youtube", url: "https://www.youtube.com/watch?v=abc", status: "processing", created_at: null, word_count: null },
    { id: "s3", title: "메모", kind: "pasted_text", url: null, status: "error", created_at: null, word_count: 120 },
  ],
};

export function job(over: Partial<NlmJob> = {}): NlmJob {
  return {
    id: "j1", kind: "source_add_url", notebook_id: "nb1", status: "running",
    params: { url: "https://example.com/post", kind: "url" }, result: null, error_code: null, error: null,
    cancel_requested: false, created_at: "2026-10-19T01:00:00Z", started_at: "2026-10-19T01:00:01Z", finished_at: null,
    ...over,
  };
}

export const QUERY_RESULT: NlmQueryResult = {
  notebook_id: "nb1",
  query: "핵심 주장은?",
  answer: "셀프 어텐션만으로 번역 품질을 높였다[1]. 병렬화가 쉽다[2].",
  conversation_id: "c1",
  turn_number: 1,
  citations: [
    { number: 1, source_id: "s1", quoted_text: "We propose a new simple network architecture, the Transformer.", source_span: { start: 120, end: 190 }, answer_span: { start: 0, end: 20 }, chunk_id: "k1", score: 0.9 },
    { number: 2, source_id: "s2", quoted_text: null, source_span: null, answer_span: null, chunk_id: null, score: null },
  ],
  sources: [
    { id: "s1", title: "Attention Is All You Need", url: null, kind: "pdf", citation_numbers: [1] },
    { id: "s2", title: "트랜스포머 해설 영상", url: "https://www.youtube.com/watch?v=abc", kind: "youtube", citation_numbers: [2] },
  ],
  created_at: "2026-10-19T02:00:00Z",
};
