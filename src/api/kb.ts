// 지식 도서관 v3 API 클라이언트(설계 0c9067b §2.6). 백엔드 v3 는 아직 없으므로 이 파일은 계약 문서 기준이고, 실제 연결 검증이 끝나기 전까지는 review 상태다.
// scope 는 보내지 않는다. 계약상 생략 시 통합 도서관 전체를 돌려줘야 하고, v3 가 아닌 서버는 개인 범위만 돌려줄 수 있다(isKbV3Summary 로 구분한다).
import { ApiError, json } from "./client";
import type {
  KbAliasOut, KbConflictList, KbConflictsQuery, KbDocumentDetailV3, KbDocumentListV3, KbDocumentsQuery, KbEntityDetail, KbEvidence,
  KbGraph, KbGraphQuery, KbIngestInput, KbIngestOut, KbJobList, KbJobsQuery, KbPipelineJob, KbResolution, KbResolveOut,
  KbSearchQuery, KbSearchResultV3, KbSummaryV3,
} from "./kbTypes";

const BASE = "/api/assistant/kb";

/** 서버가 계약과 다른 모양을 돌려줬을 때. 빈 성공으로 넘기지 않고 화면에 오류로 드러낸다. */
export class KbContractError extends Error {
  readonly endpoint: string;
  readonly field: string;
  constructor(endpoint: string, field: string) {
    super(`서버 응답이 도서관 v3 계약과 달라요(${endpoint}: ${field}).`);
    this.name = "KbContractError";
    this.endpoint = endpoint;
    this.field = field;
  }
}

function need<T>(endpoint: string, field: string, ok: boolean, value: T): T {
  if (!ok) throw new KbContractError(endpoint, field);
  return value;
}
const isList = (v: unknown): v is { items: unknown[] } => typeof v === "object" && v !== null && Array.isArray((v as { items?: unknown }).items);

/** 라우트가 없는 서버(v3 이전 백엔드)의 404·405·501. 앱이 직접 만든 kb_*_not_found 404 와 구분한다. */
export function isKbUnsupported(e: unknown): boolean {
  return e instanceof ApiError && [404, 405, 501].includes(e.status) && e.code.startsWith("http_");
}

/** summary 에 v3 전용 숫자가 있으면 v3 서버다. 없으면 목록이 개인 범위만일 수 있어 "통합"이라고 말하지 않는다. */
export function isKbV3Summary(s: KbSummaryV3 | undefined): boolean {
  return typeof s?.counts.entities === "number";
}

export const kbSummaryV3 = async (): Promise<KbSummaryV3> => {
  const out = await json<KbSummaryV3>(`${BASE}/summary`);
  return need("summary", "counts", typeof out?.counts === "object" && out.counts !== null, out);
};

export const kbIngest = async (input: KbIngestInput): Promise<KbIngestOut> => {
  const form = new FormData();
  for (const f of input.files) form.append("files[]", f, f.name);
  for (const u of input.urls) form.append("urls[]", u);
  if (input.text?.trim()) form.append("text", input.text);
  if (input.title?.trim()) form.append("title", input.title.trim());
  if (input.domain) form.append("domain", input.domain);
  if (input.source_kind) form.append("source_kind", input.source_kind);
  const out = await json<KbIngestOut>(`${BASE}/ingest`, { method: "POST", form });
  return need("ingest", "items", isList(out), out);
};

export const kbJobs = async (q: KbJobsQuery = {}): Promise<KbJobList> => {
  const out = await json<KbJobList>(`${BASE}/jobs`, { query: { status: q.status, document_id: q.document_id, limit: q.limit ?? 50 } });
  return need("jobs", "items", isList(out), out);
};
export const kbRetryJob = (jobId: string, fromStage: string | null): Promise<KbPipelineJob> =>
  json(`${BASE}/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", json: { from_stage: fromStage } });

export const kbSearchV3 = async (p: KbSearchQuery): Promise<KbSearchResultV3> => {
  const out = await json<KbSearchResultV3>(`${BASE}/search`, {
    query: { q: p.q, mode: p.mode ?? "hybrid", domain: p.domain, entity_id: p.entity_id, limit: p.limit ?? 20, offset: p.offset ?? 0 },
  });
  return need("search", "items", isList(out), out);
};

export const kbDocumentsV3 = async (p: KbDocumentsQuery = {}): Promise<KbDocumentListV3> => {
  const out = await json<KbDocumentListV3>(`${BASE}/documents`, {
    query: { q: p.q || undefined, domain: p.domain, pipeline_status: p.pipeline_status, limit: p.limit ?? 30, offset: p.offset ?? 0 },
  });
  return need("documents", "items", isList(out), out);
};
export const kbDocumentV3 = async (id: string, p: { revision_id?: string; passage_offset?: number } = {}): Promise<KbDocumentDetailV3> => {
  const out = await json<KbDocumentDetailV3>(`${BASE}/documents/${encodeURIComponent(id)}`, {
    query: { revision_id: p.revision_id, passage_offset: p.passage_offset ?? 0, passage_limit: 50 },
  });
  return need("documents/{id}", "passages", Array.isArray(out?.passages?.items) && Array.isArray(out?.revisions), out);
};
export const kbEvidenceV3 = (passageId: string): Promise<KbEvidence> => json(`${BASE}/passages/${encodeURIComponent(passageId)}/evidence`);

export const kbGraph = async (p: KbGraphQuery = {}): Promise<KbGraph> => {
  const out = await json<KbGraph>(`${BASE}/ontology/graph`, {
    query: { center_entity_id: p.center_entity_id, q: p.q || undefined, domain: p.domain, hops: p.hops ?? 1, limit: p.limit ?? 60 },
  });
  return need("ontology/graph", "nodes", Array.isArray(out?.nodes) && Array.isArray(out?.edges), out);
};
export const kbEntity = async (id: string): Promise<KbEntityDetail> => {
  const out = await json<KbEntityDetail>(`${BASE}/ontology/entities/${encodeURIComponent(id)}`);
  return need("ontology/entities/{id}", "aliases", Array.isArray(out?.aliases), out);
};
export const kbAddAlias = (entityId: string, alias: string, lang?: string): Promise<KbAliasOut> =>
  json(`${BASE}/ontology/entities/${encodeURIComponent(entityId)}/aliases`, { method: "POST", json: { alias, lang } });

export const kbConflicts = async (q: KbConflictsQuery = {}): Promise<KbConflictList> => {
  const out = await json<KbConflictList>(`${BASE}/conflicts`, { query: { status: q.status ?? "open", kind: q.kind, limit: q.limit ?? 50 } });
  return need("conflicts", "items", isList(out), out);
};
export const kbResolveConflict = (id: string, resolution: KbResolution, note?: string): Promise<KbResolveOut> =>
  json(`${BASE}/conflicts/${encodeURIComponent(id)}/resolve`, { method: "POST", json: { resolution, note: note?.trim() || undefined } });
