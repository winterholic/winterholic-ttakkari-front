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
  retrieval?: { enabled: boolean; model: string; indexed: number; total: number; last_error: string | null; quality_gate: string };
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

// ---- 지식 도서관 v3 (백엔드 설계 0c9067b §2.6). 백엔드가 아직 구현되지 않은 상태에서 계약 문서만 보고 만든 타입이다.
// 계약에 모양이 적혀 있지 않은 필드는 optional 로 두었고, 실제 백엔드와 달라지면 src/features/kb/KB_V3_CONTRACT_NOTES.md 의 표를 보고 고친다.

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
}

export interface KbJobMetrics {
  passage_count?: number;
  entity_count?: number;
  assertion_count?: number;
  conflict_count?: number;
  l2_calls?: number;
}

export interface KbPipelineJob {
  id: string;
  document_id: string;
  revision_id: string;
  /** 계약에 없음. 있으면 목록에 제목을 보여 준다. */
  document_title?: string | null;
  status: KbJobStatus;
  current_stage: KbPipelineStage;
  hold_reason?: string | null;
  error_code?: string | null;
  error_detail?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  metrics?: KbJobMetrics;
  stages: KbStageRow[];
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface KbJobList { items: KbPipelineJob[]; total?: number }
export interface KbJobsQuery { status?: string; document_id?: string; limit?: number }

export interface KbIngestInput {
  files: File[];
  urls: string[];
  text?: string;
  title?: string;
  domain?: string;
  source_kind?: string;
}
export interface KbIngestItem {
  document_id: string;
  revision_id: string;
  job_id: string;
  status: string;
  /** 계약에 없음. 항목별 실패를 알릴 수 있는지 확인이 필요하다. */
  name?: string | null;
  error?: string | null;
}
export interface KbIngestOut { batch_id: string; items: KbIngestItem[] }

/** v3 summary 확장 필드는 counts 안에 온다고 가정했다(계약 문서는 위치를 적지 않았다). 없으면 v3 백엔드가 아니다. */
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
export interface KbSummaryV3 {
  retrieval?: KbSummary["retrieval"];
  counts: KbCountsV3;
  last_collected_at: string | null;
}

export type KbCoverage = "strong" | "weak" | "none";
export type KbMatchPath = "lexical" | "vector" | "canonical" | "hop1";

export interface KbCanonical {
  summary: string;
  key_facts: string[];
  updated_at?: string | null;
}
export interface KbNeighbor {
  entity_id: string;
  name: string;
  predicate: string;
  direction?: "out" | "in";
}
export interface KbMatchedEntity {
  id: string;
  name: string;
  entity_kind?: string;
  aliases?: string[];
  canonical?: KbCanonical | null;
  neighbors?: KbNeighbor[];
  open_conflict_count?: number;
  document_count?: number;
}
export interface KbAssertionRef { id: string; text: string; status?: string }

export interface KbSearchHitV3 extends KbSearchHit {
  /** 배열인지 "A > B" 문자열인지 계약에 없다. 둘 다 받는다. */
  section_path?: string | string[] | null;
  page_no?: number | null;
  slide_no?: number | null;
  time_start_ms?: number | null;
  assertions?: KbAssertionRef[];
  has_conflict?: boolean;
  /** 계약에 없음. 있으면 매칭 경로 배지를 보여 준다. */
  match_paths?: KbMatchPath[];
}
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
  source_kind?: string | null;
  pipeline_status?: KbJobStatus | null;
  entity_count?: number;
  assertion_count?: number;
}
export interface KbDocumentListV3 { items: KbDocumentRowV3[]; total: number; limit: number; offset: number }
export interface KbDocumentsQuery { q?: string; domain?: string; pipeline_status?: string; limit?: number; offset?: number }

export interface KbConflictRef { id: string; kind: KbConflictKind; status: string; entity_name?: string | null }
export interface KbDocEntity { id: string; name: string; entity_kind?: string; salience?: number }
export interface KbEvidenceRef {
  passage_id: string;
  quote: string;
  document_id?: string;
  document_title?: string;
  rev_no?: number;
  page_no?: number | null;
}
export interface KbAssertion {
  id: string;
  text: string;
  status?: string;
  is_canonical?: boolean;
  entity_id?: string | null;
  evidence?: KbEvidenceRef[];
}
export interface KbPassageV3 extends KbPassage {
  section_path?: string | string[] | null;
  page_no?: number | null;
  slide_no?: number | null;
  time_start_ms?: number | null;
  chunk_kind?: string | null;
}
export interface KbDocumentDetailV3 extends Omit<KbDocumentDetail, "passages"> {
  passages: { items: KbPassageV3[]; total: number; limit: number; offset: number };
  /** 아래 네 필드는 "문서 상세 + 엔터티·주장·충돌 + 리비전 이력"이라는 문장만 있고 이름이 없다. */
  summary?: string | null;
  domain?: string | null;
  entities?: KbDocEntity[];
  assertions?: KbAssertion[];
  conflicts?: KbConflictRef[];
  pipeline?: KbPipelineJob | null;
}

export interface KbGraphNode {
  id: string;
  name: string;
  entity_kind: string;
  document_count: number;
  assertion_count: number;
  has_open_conflict?: boolean;
}
export interface KbGraphEdge {
  /** 계약에 없음. 없으면 source|predicate|target 으로 만든다. */
  id?: string;
  source: string;
  target: string;
  predicate: string;
  weight?: number;
}
export interface KbGraph {
  nodes: KbGraphNode[];
  edges: KbGraphEdge[];
  center_entity_id: string | null;
  total_entities: number;
}
export interface KbGraphQuery { center_entity_id?: string; q?: string; domain?: string; hops?: number; limit?: number }

export interface KbAlias { alias: string; lang?: string | null }
export interface KbRelation { id?: string; predicate: string; direction?: "out" | "in"; entity_id: string; name: string }
export interface KbEntityDocument { id: string; title: string; rev_no?: number }
export interface KbEntityDetail {
  id: string;
  name: string;
  entity_kind?: string;
  aliases: KbAlias[];
  canonical?: KbCanonical | null;
  assertions: KbAssertion[];
  relations: KbRelation[];
  documents: KbEntityDocument[];
  conflicts: KbConflict[];
}
export interface KbAliasOut { alias: KbAlias; relinked_count?: number }

export type KbConflictKind = "value_contradiction" | "polarity_contradiction" | "ambiguous_entity";
export type KbResolution = "resolved_a" | "resolved_b" | "resolved_both_valid" | "merged" | "kept_separate";
export interface KbConflictClaim {
  assertion_id: string;
  text: string;
  quote: string;
  document_id: string;
  document_title: string;
  revision_id?: string;
  rev_no?: number;
  published_at?: string | null;
  passage_id?: string | null;
}
export interface KbConflictEntity { id: string; name: string; entity_kind?: string; document_count?: number; domain?: string | null }
export interface KbConflict {
  id: string;
  kind: KbConflictKind;
  status: string;
  entity_id?: string | null;
  entity_name?: string | null;
  /** 상충 주장은 A/B 두 개. 필드 이름은 계약에 없고 비교 카드 설명(A/B)에서 따왔다. */
  claim_a?: KbConflictClaim;
  claim_b?: KbConflictClaim;
  /** 모호 엔터티 후보 쌍. */
  entity_a?: KbConflictEntity;
  entity_b?: KbConflictEntity;
  created_at?: string;
  note?: string | null;
}
export interface KbConflictList { items: KbConflict[]; total?: number }
export interface KbConflictsQuery { status?: string; kind?: string; limit?: number }
export interface KbResolveOut { status: string; canonical?: KbCanonical | null }
