// 테스트 전용 계약 예시. 실제 백엔드 응답이 아니라 설계 0c9067b §2.6 에서 읽은 모양이다.
import type {
  KbConflict, KbDocumentDetailV3, KbDocumentListV3, KbDocumentRowV3, KbEntityDetail, KbEvidence, KbGraph, KbPipelineJob, KbSearchHitV3, KbSearchResultV3, KbSource, KbSummaryV3,
} from "../../api/kbTypes";

export const source: KbSource = {
  id: "s1", kind: "web", source_key: "k8s:deploy", locator: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/", sha256: "a".repeat(64),
  byte_size: 100, media_type: "text/html", collected_at: "2026-10-24T01:00:00Z",
};

export const summaryV3: KbSummaryV3 = {
  retrieval: { enabled: true, model: "e5", indexed: 80, total: 100, last_error: null, quality_gate: "ok" },
  counts: { sources: 3, documents: 12, revisions: 14, passages: 120, evidence: 9, entities: 40, assertions: 77, relations: 31, open_conflicts: 2, pipeline_running: 1, pipeline_failed: 1 },
  last_collected_at: "2026-10-24T01:00:00Z",
};
export const summaryLegacy: KbSummaryV3 = {
  counts: { sources: 2, documents: 1, revisions: 2, passages: 4, evidence: 0 },
  last_collected_at: "2026-10-23T02:00:00Z",
};

export const docRow: KbDocumentRowV3 = {
  id: "d1", doc_key: "manual:k8s", title: "Kubernetes Deployment 가이드", lang: "ko", created_at: "2026-10-23T01:00:00Z", updated_at: "2026-10-24T02:00:00Z",
  domain: "dev-infra", pipeline_status: "ready", entity_count: 5, assertion_count: 9,
  current_revision: { id: "r2", rev_no: 2, char_count: 3500, passage_count: 6, created_at: "2026-10-24T02:00:00Z", source },
};
export const docList = (items: KbDocumentRowV3[] = [docRow]): KbDocumentListV3 => ({ items, total: items.length, limit: 30, offset: 0 });

export const hit: KbSearchHitV3 = {
  passage_id: "p1", ord: 2, heading: null, snippet: "ReplicaSet 은 지정한 수의 파드 복제본을 유지한다.", highlights: [[0, 10]], score: 0.9,
  char_start: 0, char_end: 40, document: { id: "d1", title: "Kubernetes Deployment 가이드", lang: "ko" },
  revision: { id: "r2", rev_no: 2, current: true, char_count: 3500 }, source,
  section_path: ["Kubernetes", "Workloads", "Deployments"], page_no: 14, slide_no: 5, time_start_ms: 135000, has_conflict: true,
  assertions: [{ id: "a1", text: "Deployment 는 ReplicaSet 을 관리한다.", status: "active" }], match_paths: ["lexical", "hop1"],
};
export const searchResult = (over: Partial<KbSearchResultV3> = {}): KbSearchResultV3 => ({
  query: "디플로이먼트", terms: ["디플로이먼트"], items: [hit], limit: 20, offset: 0, has_more: false,
  coverage: "strong",
  matched_entities: [{
    id: "e-dep", name: "Deployment", entity_kind: "technology", aliases: ["Deployment", "디플로이먼트", "k8s Deployment"], document_count: 3, open_conflict_count: 1,
    canonical: { summary: "파드와 ReplicaSet 의 선언적 업데이트를 담당하는 워크로드 리소스.", key_facts: ["롤링 업데이트를 기본으로 한다."] },
    neighbors: [{ entity_id: "e-rs", name: "ReplicaSet", predicate: "manages", direction: "out" }],
  }],
  ...over,
});

export const evidence: KbEvidence = {
  passage_id: "p1", document: { id: "d1", title: "Kubernetes Deployment 가이드" }, revision: { id: "r2", rev_no: 2, text_sha256: "b".repeat(64) }, source,
  span: { passage_start: 0, passage_end: 40, revision_start: 40, revision_end: 80, line_start: 3, line_end: 3, sha256: "c".repeat(64), hash_verified: true },
  quote: "ReplicaSet 은 지정한 수의 파드 복제본을 유지한다.", before: "앞 문맥\n\n", after: "\n\n뒤 문맥", registered_evidence: [],
};

const stage = (name: KbPipelineJob["stages"][number]["stage"], status: KbPipelineJob["stages"][number]["status"], duration_ms?: number) => ({ stage: name, status, duration_ms });
export const jobRunning: KbPipelineJob = {
  id: "j-run", document_id: "d2", revision_id: "r9", document_title: "방금 올린 PDF", status: "chunking", current_stage: "chunking",
  stages: [stage("parsing", "succeeded", 820), stage("chunking", "running")], metrics: { passage_count: 0 },
};
export const jobFailed: KbPipelineJob = {
  id: "j-fail", document_id: "d3", revision_id: "r10", document_title: "깨진 PDF", status: "failed", current_stage: "extracting", error_code: "l2_timeout", error_detail: "L2 응답 시간 초과",
  stages: [stage("parsing", "succeeded", 100), stage("chunking", "succeeded", 200), { stage: "extracting", status: "failed", error_message: "timeout" }],
};
export const jobHeld: KbPipelineJob = {
  id: "j-held", document_id: "d4", revision_id: "r11", document_title: "스캔본.pdf", status: "held", current_stage: "parsing", hold_reason: "ocr_required",
  stages: [{ stage: "parsing", status: "held" }],
};
export const jobDegraded: KbPipelineJob = {
  id: "j-deg", document_id: "d5", revision_id: "r12", document_title: "LLM 없이 처리된 문서", status: "degraded", current_stage: "extracting",
  stages: [stage("parsing", "succeeded"), stage("chunking", "succeeded"), stage("extracting", "degraded"), stage("linking", "succeeded"), stage("indexing", "succeeded"), stage("canonicalizing", "succeeded")],
  metrics: { passage_count: 8, entity_count: 4, assertion_count: 3 },
};

export const detail: KbDocumentDetailV3 = {
  id: "d1", doc_key: "manual:k8s", title: "Kubernetes Deployment 가이드", lang: "ko", created_at: "2026-10-23T01:00:00Z", updated_at: "2026-10-24T02:00:00Z", domain: "dev-infra",
  revisions: [
    { id: "r2", rev_no: 2, parser_version: "kb-v3-chunker", char_count: 3500, text_sha256: "b".repeat(64), passage_count: 6, current: true, supersedes_id: "r1", created_at: "2026-10-24T02:00:00Z", source },
    { id: "r1", rev_no: 1, parser_version: "raw-v1", char_count: 3400, text_sha256: "d".repeat(64), passage_count: 1, current: false, supersedes_id: null, created_at: "2026-10-23T01:00:00Z", source },
  ],
  selected_revision_id: "r2",
  passages: { items: [
    { id: "p1", ord: 0, heading: null, body: "첫째 패시지 본문", char_start: 0, char_end: 9, sha256: "e".repeat(64), section_path: "Kubernetes > Workloads", page_no: 3 },
    { id: "p2", ord: 1, heading: null, body: "둘째 패시지 본문", char_start: 10, char_end: 19, sha256: "f".repeat(64), section_path: "Kubernetes > Services" },
  ], total: 2, limit: 50, offset: 0 },
  summary: "Deployment 로 파드를 선언적으로 배포하는 방법을 설명한다.",
  entities: [{ id: "e-dep", name: "Deployment", entity_kind: "technology" }],
  assertions: [{ id: "a1", text: "Deployment 는 ReplicaSet 을 관리한다.", is_canonical: true, evidence: [{ passage_id: "p1", quote: "Deployment 는 ReplicaSet 을 관리한다." }] }],
  conflicts: [{ id: "c1", kind: "value_contradiction", status: "open", entity_name: "Valkey" }],
  pipeline: jobDegraded,
};

export const graph: KbGraph = {
  nodes: [
    { id: "e-dep", name: "Deployment", entity_kind: "technology", document_count: 3, assertion_count: 9, has_open_conflict: true },
    { id: "e-rs", name: "ReplicaSet", entity_kind: "technology", document_count: 2, assertion_count: 4 },
    { id: "e-pod", name: "Pod", entity_kind: "concept", document_count: 5, assertion_count: 7 },
  ],
  edges: [
    { source: "e-dep", target: "e-rs", predicate: "manages" },
    { source: "e-rs", target: "e-pod", predicate: "manages" },
  ],
  center_entity_id: null, total_entities: 40,
};
export const expansion: KbGraph = {
  nodes: [
    { id: "e-rs", name: "ReplicaSet", entity_kind: "technology", document_count: 2, assertion_count: 4 },
    { id: "e-hpa", name: "HorizontalPodAutoscaler", entity_kind: "api", document_count: 1, assertion_count: 2 },
  ],
  edges: [{ source: "e-hpa", target: "e-rs", predicate: "scales" }],
  center_entity_id: "e-rs", total_entities: 40,
};

export const entity: KbEntityDetail = {
  id: "e-dep", name: "Deployment", entity_kind: "technology",
  aliases: [{ alias: "디플로이먼트", lang: "ko" }, { alias: "k8s Deployment", lang: "en" }],
  canonical: { summary: "파드와 ReplicaSet 의 선언적 업데이트를 담당하는 워크로드 리소스.", key_facts: ["롤링 업데이트를 기본으로 한다."] },
  assertions: [{ id: "a1", text: "Deployment 는 ReplicaSet 을 관리한다.", is_canonical: true, evidence: [{ passage_id: "p1", quote: "Deployment 는 ReplicaSet 을 관리한다." }] }],
  relations: [{ predicate: "manages", direction: "out", entity_id: "e-rs", name: "ReplicaSet" }],
  documents: [{ id: "d1", title: "Kubernetes Deployment 가이드" }],
  conflicts: [],
};

export const claimConflict: KbConflict = {
  id: "c1", kind: "value_contradiction", status: "open", entity_id: "e-valkey", entity_name: "Valkey 기본 포트",
  claim_a: { assertion_id: "a1", text: "Valkey 기본 포트는 6379이다.", quote: "기본 포트는 6379", document_id: "d7", document_title: "Valkey 2025 가이드", rev_no: 1, published_at: "2025-03-01T00:00:00Z" },
  claim_b: { assertion_id: "a2", text: "Valkey 기본 포트는 6380이다.", quote: "기본 포트는 6380", document_id: "d8", document_title: "Valkey 2026 변경점", rev_no: 3, published_at: "2026-05-01T00:00:00Z" },
};
export const entityConflict: KbConflict = {
  id: "c2", kind: "ambiguous_entity", status: "open", entity_name: "Service",
  entity_a: { id: "e-svc1", name: "Service (Kubernetes)", entity_kind: "technology", document_count: 3 },
  entity_b: { id: "e-svc2", name: "Service (고객 응대)", entity_kind: "concept", document_count: 1 },
};
