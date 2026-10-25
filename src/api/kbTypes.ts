// 지식 도서관(kb) 조회·등록. 백엔드 ADR 0063. 개인 맥락 도서관(ctx_*)과 별개의 테이블이다.
export interface KbSource {
  id: string;
  kind: string;
  source_key: string;
  locator: string | null;
  sha256: string;
  byte_size: number;
  media_type: string | null;
  collected_at: string;
}

export interface KbSummary {
  retrieval?: { enabled: boolean; model: string; indexed: number; total: number; failed?: number; last_error: string | null; quality_gate: string };
  counts: { sources: number; documents: number; revisions: number; passages: number; evidence: number };
  last_collected_at: string | null;
}

export interface KbDocumentRow {
  id: string;
  doc_key: string;
  title: string;
  lang: string | null;
  created_at: string;
  updated_at: string;
  current_revision: {
    id: string;
    rev_no: number;
    char_count: number;
    passage_count: number;
    created_at: string;
    source: KbSource | null;
  } | null;
}

export interface KbDocumentList {
  items: KbDocumentRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface KbRevision {
  id: string;
  rev_no: number;
  parser_version: string;
  char_count: number;
  text_sha256: string;
  passage_count: number;
  current: boolean;
  supersedes_id: string | null;
  created_at: string;
  source: KbSource | null;
}

export interface KbPassage {
  id: string;
  ord: number;
  heading: string | null;
  body: string;
  char_start: number;
  char_end: number;
  sha256: string;
}

export interface KbDocumentDetail {
  id: string;
  doc_key: string;
  title: string;
  lang: string | null;
  created_at: string;
  updated_at: string;
  revisions: KbRevision[];
  selected_revision_id: string;
  passages: { items: KbPassage[]; total: number; limit: number; offset: number };
}

export interface KbSearchHit {
  passage_id: string;
  ord: number;
  heading: string | null;
  snippet: string;
  /** 발췌 안의 [start, end) 강조 구간 */
  highlights: [number, number][];
  score: number;
  char_start: number;
  char_end: number;
  document: { id: string; title: string; lang: string | null };
  revision: { id: string; rev_no: number; current: boolean; char_count: number };
  source: KbSource | null;
}

export interface KbSearchResult {
  query: string;
  terms: string[];
  items: KbSearchHit[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface KbEvidence {
  passage_id: string;
  document: { id: string; title: string };
  revision: { id: string; rev_no: number; text_sha256: string };
  source: KbSource | null;
  span: {
    passage_start: number;
    passage_end: number;
    revision_start: number;
    revision_end: number;
    line_start: number;
    line_end: number;
    sha256: string;
    hash_verified: boolean;
  };
  quote: string;
  before: string;
  after: string;
  registered_evidence: { id: string; span_start: number; span_end: number; sha256: string; note: string | null }[];
}

export interface KbRegisterIn {
  scope?: "personal" | "work";
  title: string;
  text: string;
  source_key?: string;
  lang?: string;
}

export interface KbRegisterOut {
  document_id: string;
  revision_id: string;
  rev_no: number;
  created: boolean;
  passage_count: number;
}

// ---- 지식 도서관 v3. 백엔드 back-kb-v3-api 27ea2f4 의 api/kb_library.py, kb_v3_views.py, kb_v3_ontology_views.py, kb_ingest.py, kb_jobs.py 를 읽고 맞춘 타입이다.
// 소스를 읽어 맞춘 것이지 실서버 호출로 확인한 것은 아니다(확인 범위는 docs/work-history/2026-10-25-kb-v3-live-contract.md). 서버가 항상 주는 필드는 필수, 없을 수 있는 필드만 optional/null 이다.

/** 파이프라인 6단계(§2.3). 순서가 곧 진행 순서다. */
export const KB_PIPELINE_STAGES = ["parsing", "chunking", "extracting", "linking", "indexing", "canonicalizing"] as const;
export type KbPipelineStage = (typeof KB_PIPELINE_STAGES)[number];
export type KbJobStatus = "registered" | KbPipelineStage | "ready" | "degraded" | "held" | "failed";
export type KbStageStatus = "pending" | "running" | "succeeded" | "degraded" | "held" | "failed" | "skipped";

export interface KbStageRow {
  stage: KbPipelineStage;
  status: KbStageStatus;
  duration_ms?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
  attempt_count?: number;
  processor_version?: string | null;
  /** 단계마다 모양이 다르다. 저하·보류 사유(degradation_reason, reason, missing_capability)만 읽는다. */
  detail?: Record<string, unknown>;
}

export interface KbJobMetrics {
  passage_count?: number;
  entity_count?: number;
  assertion_count?: number;
  relation_count?: number;
  relation_candidate_count?: number;
  conflict_count?: number;
  l2_calls?: number;
}

export interface KbPipelineJob {
  id: string;
  document_id: string;
  revision_id: string;
  document_title?: string | null;
  rev_no?: number | null;
  status: KbJobStatus;
  current_stage: KbPipelineStage;
  hold_reason?: string | null;
  error_code?: string | null;
  error_detail?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  pipeline_version?: string | null;
  metrics?: KbJobMetrics;
  stages: KbStageRow[];
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface KbJobList { items: KbPipelineJob[]; total: number; limit?: number; offset?: number }
export interface KbJobsQuery { status?: string; document_id?: string; limit?: number; offset?: number }
export interface KbRetryOut extends KbPipelineJob {
  retry: { requeued: boolean; from_stage: string | null; reason: string | null; reset_stages: string[] };
}

export interface KbIngestInput {
  files: File[];
  urls: string[];
  text?: string;
  title?: string;
  domain?: string;
  source_kind?: string;
}
/** registered 만 새로 처리 대기에 들어간 것이다. held 는 원본만 보관했고 지식화하지 않았다. failed 는 문서가 만들어지지 않았다. */
export type KbIngestStatus = "registered" | "duplicate" | "held" | "failed";
export interface KbIngestItem {
  name: string;
  status: KbIngestStatus | (string & {});
  /** failed 항목은 세 id 가 모두 null 이다. */
  document_id: string | null;
  revision_id: string | null;
  job_id: string | null;
  detected_type?: string | null;
  created?: boolean;
  hold_reason?: string | null;
  hold_message?: string | null;
  error?: string | null;
  detail?: string | null;
}
export interface KbIngestOut { batch_id: string; items: KbIngestItem[] }

export interface KbCountsV3 {
  sources: number;
  documents: number;
  revisions: number;
  passages: number;
  evidence: number;
  entities?: number;
  assertions?: number;
  relations?: number;
  open_conflicts?: number;
  pipeline_running?: number;
  pipeline_failed?: number;
}
export interface KbPipelineSummary {
  registered: number; running: number; ready: number; degraded: number; held: number; failed: number;
  by_status?: Record<string, number>;
}
export interface KbV3Metrics {
  relations_active: number;
  relations_candidate: number;
  /** 1200자를 넘는 문서가 패시지 하나로만 들어간 수(목표 0). */
  single_passage_documents: number;
  documents_without_pipeline_job: number;
  embedding_coverage: { indexed: number; total: number; ratio: number | null };
}
export interface KbSummaryV3 {
  retrieval?: KbSummary["retrieval"];
  counts: KbCountsV3;
  last_collected_at: string | null;
  pipeline?: KbPipelineSummary;
  v3?: KbV3Metrics;
  access?: { view: string; visibilities: string[]; caller_role?: string };
}

export type KbCoverage = "strong" | "weak" | "none";
export type KbMatchPath = "lexical" | "vector" | "canonical" | "hop1";

export interface KbCanonical {
  summary: string;
  key_facts: string[];
  updated_at?: string | null;
  version_no?: number | null;
}
export interface KbNeighbor {
  entity_id: string;
  name: string;
  predicate: string;
  direction?: "out" | "in";
  status?: string;
  candidate?: boolean;
}
export interface KbMatchedEntity {
  id: string;
  name: string;
  entity_kind?: string;
  aliases?: string[];
  /** 근거 있는 정본이 아직 없으면 null. */
  canonical?: KbCanonical | null;
  neighbors?: KbNeighbor[];
  open_conflict_count?: number;
  document_count?: number | null;
}
export interface KbAssertionRef { id: string; text: string; status?: string }
export interface KbCanonicalFact { entity_id: string; entity: string; predicate: string; value: string }

export interface KbSearchHitV3 extends KbSearchHit {
  section_path?: string | string[] | null;
  page_no?: number | null;
  slide_no?: number | null;
  time_start_ms?: number | null;
  assertions?: KbAssertionRef[];
  has_conflict?: boolean;
  match_paths?: KbMatchPath[];
  conflict_warning?: boolean;
  canonical_facts?: KbCanonicalFact[];
}
/** mode=lexical 에 다른 조건이 없으면 서버가 단어 검색 결과만 준다. 이때 matched_entities·coverage 는 없다. */
export interface KbSearchResultV3 extends Omit<KbSearchResult, "items"> {
  items: KbSearchHitV3[];
  matched_entities?: KbMatchedEntity[];
  coverage?: KbCoverage;
}
export interface KbSearchQuery {
  q: string;
  mode?: "hybrid" | "lexical" | "vector";
  domain?: string;
  entity_id?: string;
  offset?: number;
  limit?: number;
}

export interface KbDocumentRowV3 extends KbDocumentRow {
  domain?: string | null;
  /** user: 등록 때 고른 값, entities: 추출된 개념에서 자동 분류한 값 */
  domain_source?: "user" | "entities" | null;
  source_kind?: string | null;
  pipeline_status?: KbJobStatus | null;
  pipeline_job_id?: string | null;
  hold_reason?: string | null;
  entity_count?: number;
  assertion_count?: number;
}
export interface KbDocumentListV3 { items: KbDocumentRowV3[]; total: number; limit: number; offset: number }
export interface KbDocumentsQuery { q?: string; domain?: string; pipeline_status?: string; limit?: number; offset?: number }

export interface KbEvidenceRef {
  evidence_id?: string;
  passage_id: string;
  quote: string;
  start_offset?: number;
  end_offset?: number;
  document_id?: string;
  document_title?: string;
  revision_id?: string;
  rev_no?: number;
  page_no?: number | null;
  slide_no?: number | null;
  section_path?: string[];
  relation?: string;
}
export interface KbAssertion {
  id: string;
  text: string;
  subject?: string | null;
  predicate?: string;
  object?: string;
  status?: string;
  polarity?: string;
  modality?: string;
  is_canonical?: boolean;
  entity_id?: string | null;
  evidence?: KbEvidenceRef[];
}
export interface KbDocEntity {
  id: string;
  name: string;
  entity_kind?: string;
  domain?: string | null;
  salience?: number;
  mention_count?: number;
  defined_here?: boolean;
}
/** 문서 상세의 충돌 요약. 열린 충돌만이 아니라 해결된 것도 오고, 누가 어떻게 닫았는지(resolved_by)는 오지 않는다. */
export interface KbConflictRef { id: string; kind: KbConflictKind; status: string; entity_name?: string | null }
export interface KbDocRelation {
  id: string;
  predicate: string;
  source: { id: string; name: string };
  target: { id: string; name: string };
  status: string;
  candidate: boolean;
  evidence_count: number;
  evidence: KbEvidenceRef[];
}
export interface KbDocHistoryRow {
  job_id: string;
  revision_id: string;
  rev_no: number | null;
  status: KbJobStatus;
  current_stage: KbPipelineStage;
  hold_reason: string | null;
  metrics: KbJobMetrics;
  created_at: string | null;
  completed_at: string | null;
}
export interface KbPassageV3 extends KbPassage {
  section_path?: string | string[] | null;
  page_no?: number | null;
  slide_no?: number | null;
  time_start_ms?: number | null;
  time_end_ms?: number | null;
  chunk_kind?: string | null;
  token_estimate?: number | null;
}
export interface KbRevisionV3 extends KbRevision {
  pipeline_status?: KbJobStatus | null;
  published_at?: string | null;
}
export interface KbDocumentDetailV3 extends Omit<KbDocumentDetail, "passages" | "revisions"> {
  passages: { items: KbPassageV3[]; total: number; limit: number; offset: number };
  revisions: KbRevisionV3[];
  /** 모델이 쓴 요약이 아니다. canonical_definition 이면 정본 정의, extractive_first_passage 이면 본문 첫 문단 앞부분이다. */
  summary?: string | null;
  summary_source?: "canonical_definition" | "extractive_first_passage" | null;
  domain?: string | null;
  domain_source?: "user" | "entities" | null;
  source_kind?: string | null;
  pipeline_status?: KbJobStatus | null;
  source?: KbSource | null;
  entities?: KbDocEntity[];
  assertions?: KbAssertion[];
  relations?: KbDocRelation[];
  conflicts?: KbConflictRef[];
  /** 선택한 리비전의 처리 작업. 처리 기록이 없으면 null. */
  pipeline?: KbPipelineJob | null;
  history?: KbDocHistoryRow[];
}

export interface KbGraphNode {
  id: string;
  name: string;
  entity_kind: string;
  domain?: string | null;
  document_count: number;
  mention_count?: number;
  assertion_count: number;
  has_open_conflict?: boolean;
  summary?: string;
  is_center?: boolean;
}
export interface KbGraphEdge {
  id?: string;
  source: string;
  target: string;
  predicate: string;
  weight?: number;
  status?: string;
  /** 근거는 있지만 아직 확정되지 않은 관계. 요청에서 include_candidates 를 켰을 때만 온다. */
  candidate?: boolean;
  evidence_count?: number;
  evidence?: KbEvidenceRef[];
}
export interface KbGraph {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
  center_entity_id: string | null;
  total_entities: number;
  mode?: "hubs" | "search" | "neighbors";
  /** 이웃 확장(neighbors)에서 아직 못 가져온 이웃이 있는가. */
  has_more?: boolean;
  total_neighbors?: number;
  offset?: number;
  limit?: number;
  hops?: number;
  hops_requested?: number;
  include_candidates?: boolean;
}
export interface KbGraphQuery { center_entity_id?: string; q?: string; domain?: string; hops?: number; limit?: number; offset?: number; include_candidates?: boolean }

export interface KbAlias { alias: string; lang?: string | null; kind?: string | null; source?: string | null }
export interface KbRelation {
  id?: string;
  predicate: string;
  direction?: "out" | "in";
  entity_id: string;
  name: string;
  status?: string;
  candidate?: boolean;
  evidence_count?: number;
}
export interface KbEntityDocument { id: string; title: string; rev_no?: number }
export interface KbEntityDetail {
  id: string;
  name: string;
  entity_kind?: string;
  domain?: string | null;
  summary?: string | null;
  document_count?: number;
  mention_count?: number;
  confidence?: number | null;
  aliases: KbAlias[];
  canonical?: KbCanonical | null;
  assertions: KbAssertion[];
  relations: KbRelation[];
  documents: KbEntityDocument[];
  conflicts: KbConflict[];
  include_candidates?: boolean;
}
export interface KbAliasOut { alias: KbAlias; relinked_count?: number; created?: boolean }

export type KbConflictKind = "value_contradiction" | "polarity_contradiction" | "version_divergence" | "ambiguous_entity";
export type KbConflictStatus = "open" | "resolved_a" | "resolved_b" | "resolved_both_valid" | "merged" | "kept_separate";
export type KbResolution = Exclude<KbConflictStatus, "open">;
export interface KbConflictClaim {
  assertion_id: string;
  text: string | null;
  quote: string | null;
  document_id: string;
  document_title: string | null;
  revision_id?: string;
  rev_no?: number | null;
  published_at?: string | null;
  passage_id?: string | null;
  status?: string;
  polarity?: string;
}
export interface KbConflictEntity { id: string; name: string; entity_kind?: string; document_count?: number; domain?: string | null }
export interface KbConflict {
  id: string;
  kind: KbConflictKind;
  status: KbConflictStatus | (string & {});
  entity_id?: string | null;
  entity_name?: string | null;
  predicate?: string | null;
  /** 상충 주장은 A/B 두 개. 한쪽을 읽을 수 없으면 null 이다. */
  claim_a?: KbConflictClaim | null;
  claim_b?: KbConflictClaim | null;
  /** 모호 엔터티 후보 쌍. */
  entity_a?: KbConflictEntity | null;
  entity_b?: KbConflictEntity | null;
  created_at?: string;
  note?: string | null;
  /** user, 또는 system:revision_supersession 처럼 시스템이 자동으로 닫은 경우 */
  resolved_by?: string | null;
  resolved_at?: string | null;
}
export interface KbConflictList { items: KbConflict[]; total: number; limit?: number; offset?: number }
export interface KbConflictsQuery { status?: string; kind?: string; limit?: number; offset?: number }
export interface KbResolveOut {
  status: string;
  conflict?: KbConflict;
  canonical?: (KbCanonical & { has_open_conflict?: boolean }) | null;
}
