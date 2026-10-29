// 테스트 전용 목업. 실제 백엔드 응답이 아니다. 모양은 back-kb-v3-api 27ea2f4 의 뷰 모듈을 읽고 맞췄고, 실제 응답 기록은 liveFixtures/recorded.json 이다(kbLive.test.tsx).
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
  pipeline: { registered: 0, running: 1, ready: 8, degraded: 1, held: 1, failed: 1, by_status: {} },
  v3: { relations_active: 31, relations_candidate: 6, single_passage_documents: 0, documents_without_pipeline_job: 3, embedding_coverage: { indexed: 80, total: 100, ratio: 0.8 } },
  access: { view: "unified", visibilities: ["global"], caller_role: "owner" },
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
  id: "j-run", document_id: "d2", revision_id: "r9", document_title: "방금 올린 PDF", rev_no: 1, status: "chunking", current_stage: "chunking",
  stages: [stage("parsing", "succeeded", 820), stage("chunking", "running")], metrics: { passage_count: 0 },
};
export const jobFailed: KbPipelineJob = {
  id: "j-fail", document_id: "d3", revision_id: "r10", document_title: "깨진 PDF", status: "failed", current_stage: "extracting", error_code: "l2_timeout", error_detail: "L2 응답 시간 초과",
  stages: [stage("parsing", "succeeded", 100), stage("chunking", "succeeded", 200), { stage: "extracting", status: "failed", error_message: "timeout" }],
};
export const jobHeld: KbPipelineJob = {
  id: "j-held", document_id: "d4", revision_id: "r11", document_title: "스캔본.pdf", status: "held", current_stage: "parsing", hold_reason: "ocr_required",
  stages: [{ stage: "parsing", status: "held", error_message: "스캔 이미지라 글자를 읽으려면 OCR이 필요한데 아직 지원하지 않아요" }],
};
/** 재시도해 볼 만한 보류(영구 사유가 아닌 것). 실서버에서는 collector_html_structure_revision_required 가 이런 사례다. */
export const jobHeldRetriable: KbPipelineJob = {
  id: "j-held2", document_id: "d6", revision_id: "r13", document_title: "구조 갱신이 필요한 수집 문서", status: "held", current_stage: "parsing",
  hold_reason: "collector_html_structure_revision_required", stages: [{ stage: "parsing", status: "held" }],
};
export const jobList = (items: KbPipelineJob[], total = items.length) => ({ items, total, limit: 30, offset: 0 });
export const jobDegraded: KbPipelineJob = {
  id: "j-deg", document_id: "d5", revision_id: "r12", document_title: "LLM 없이 처리된 문서", status: "degraded", current_stage: "extracting", hold_reason: "l2_disabled",
  stages: [stage("parsing", "succeeded"), stage("chunking", "succeeded"), { stage: "extracting" as const, status: "degraded" as const, error_message: "l2_disabled" }, stage("linking", "succeeded"), stage("indexing", "succeeded"), stage("canonicalizing", "succeeded")],
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
  relations: [{
    id: "rel1", predicate: "manages", source: { id: "e-dep", name: "Deployment" }, target: { id: "e-rs", name: "ReplicaSet" }, status: "active", candidate: false, evidence_count: 1,
    evidence: [{ passage_id: "p1", quote: "Deployment 는 ReplicaSet 을 관리한다.", document_id: "d1", document_title: "Kubernetes Deployment 가이드", rev_no: 2 }],
  }, {
    id: "rel2", predicate: "part_of", source: { id: "e-pod", name: "Pod" }, target: { id: "e-dep", name: "Deployment" }, status: "candidate", candidate: true, evidence_count: 1,
    evidence: [{ passage_id: "p2", quote: "Pod 절", document_id: "d1" }],
  }],
  pipeline: jobDegraded,
  summary_source: "canonical_definition",
  history: [{ job_id: "j-deg", revision_id: "r2", rev_no: 2, status: "degraded", current_stage: "canonicalizing", hold_reason: "l2_disabled", metrics: { passage_count: 8, entity_count: 4, assertion_count: 3, relation_count: 1 }, created_at: "2026-10-24T02:00:00Z", completed_at: "2026-10-24T02:01:00Z" },
    { job_id: "j-old", revision_id: "r1", rev_no: 1, status: "ready", current_stage: "canonicalizing", hold_reason: null, metrics: {}, created_at: "2026-10-23T01:00:00Z", completed_at: "2026-10-23T01:01:00Z" }],
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
  center_entity_id: null, total_entities: 40, mode: "hubs", has_more: false,
};
export const expansion: KbGraph = {
  nodes: [
    { id: "e-rs", name: "ReplicaSet", entity_kind: "technology", document_count: 2, assertion_count: 4 },
    { id: "e-hpa", name: "HorizontalPodAutoscaler", entity_kind: "api", document_count: 1, assertion_count: 2 },
  ],
  edges: [{ source: "e-hpa", target: "e-rs", predicate: "scales", candidate: true, evidence_count: 1, evidence: [{ passage_id: "p9", quote: "HPA 는 ReplicaSet 수를 조정한다.", document_id: "d1" }] }],
  center_entity_id: "e-rs", total_entities: 40, mode: "neighbors", has_more: false, total_neighbors: 2, offset: 0, limit: 30,
};

export const entity: KbEntityDetail = {
  id: "e-dep", name: "Deployment", entity_kind: "technology",
  aliases: [{ alias: "디플로이먼트", lang: "ko" }, { alias: "k8s Deployment", lang: "en" }],
  canonical: { summary: "파드와 ReplicaSet 의 선언적 업데이트를 담당하는 워크로드 리소스.", key_facts: ["롤링 업데이트를 기본으로 한다."] },
  assertions: [{ id: "a1", text: "Deployment 는 ReplicaSet 을 관리한다.", is_canonical: true, evidence: [{ passage_id: "p1", quote: "Deployment 는 ReplicaSet 을 관리한다." }] }],
  relations: [{ id: "rel1", predicate: "manages", direction: "out", entity_id: "e-rs", name: "ReplicaSet", status: "active", candidate: false, evidence_count: 1 }],
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

// ---- 해결된 충돌. kept_separate 는 상충 주장에서 "양쪽이 옳다"는 뜻이 아니다(시스템이 새 버전으로 양쪽을 대체해 닫은 경우 포함).
export const supersededBothConflict: KbConflict = {
  ...claimConflict, id: "c3", status: "kept_separate", resolved_by: "system:revision_supersession", resolved_at: "2026-10-25T01:00:00Z", note: "both_parties_superseded_by_newer_revision",
};
export const supersededOneSideConflict: KbConflict = {
  ...claimConflict, id: "c4", status: "resolved_b", resolved_by: "system:revision_supersession", resolved_at: "2026-10-25T01:00:00Z", note: "party_a_superseded_by_newer_revision",
};
export const userBothValidConflict: KbConflict = {
  ...claimConflict, id: "c5", status: "resolved_both_valid", resolved_by: "user", resolved_at: "2026-10-25T02:00:00Z", note: "버전별로 다름",
};
export const userKeptSeparateEntity: KbConflict = { ...entityConflict, id: "c6", status: "kept_separate", resolved_by: "user", resolved_at: "2026-10-25T02:00:00Z" };

// ---- ingest 응답: 실서버가 주는 네 가지 항목 상태. failed 는 id 가 모두 null 이다.
export const ingestMixed = {
  batch_id: "b-mixed",
  items: [
    { name: "a.md", status: "registered", document_id: "d9", revision_id: "r9", job_id: "j9", detected_type: "md", created: true },
    { name: "same.md", status: "duplicate", document_id: "d1", revision_id: "r2", job_id: "j1", detected_type: "md", created: false },
    { name: "legacy.hwp", status: "held", document_id: "d10", revision_id: "r10", job_id: "j10", detected_type: "hwp", hold_reason: "unsupported_legacy_office", hold_message: "구형 Office 형식(.doc/.ppt/.xls/.hwp)은 아직 지원하지 않아요", created: true },
    { name: "http://127.0.0.1:9/none", status: "failed", document_id: null, revision_id: null, job_id: null, detected_type: "url", error: "url_rejected:port_not_allowed" },
  ],
};
