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
