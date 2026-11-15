import type {
  AppraisalDetail, AppraisalHistoryItem, AppraisalItem, AppraisalResult,
} from "../../api/repoAppraisalTypes";

// 화면 테스트용 샘플. 모양은 백엔드 `detail_view`·`listing` 응답 그대로다.
// 긴 이름·긴 줄 같은 모바일 스트레스 값만 더했다. 실제 계정·저장소 이름은 쓰지 않는다.

const items = (over: Partial<AppraisalItem> = {}): AppraisalItem => ({
  item: "code_quality.tests", score: 4, status: "scored", evidence: { test_files: 12, source_files: 30, ratio: 0.4 }, ...over,
});

export const RESULT: AppraisalResult = {
  repo_type: "library",
  axes: { code_quality: 3.8, architecture: 4.2, maintainability: 3.5, ai_harness: null, originality: 2.0 },
  items: [
    items(),
    items({ item: "code_quality.lint_config", score: 3, evidence: { categories: ["lint", "format"] } }),
    items({ item: "code_quality.file_size", score: 5, evidence: { oversize: 0, source_files: 30 } }),
    items({ item: "architecture.structure", score: 4, evidence: { root_sources: 3 } }),
    items({ item: "architecture.layering", score: 4, evidence: { citations: ["src/index.ts"], confidence: "medium" } }),
    items({ item: "maintainability.ci", score: 2, evidence: { workflows: [] } }),
    items({ item: "ai_harness.presence", score: null, status: "na", evidence: { reason: "하네스 파일 없음" } }),
    items({ item: "ai_harness.coherence", score: null, status: "na", evidence: { reason: "하네스 파일 없음" } }),
    items({ item: "originality.verdict", score: 2, evidence: { citations: ["README.md"], confidence: "low", low_reliability: true } }),
  ],
  weights: { code_quality: 0.3, architecture: 0.2, maintainability: 0.25, ai_harness: 0.15, originality: 0.1 },
  contributions: { code_quality: 22.8, architecture: 16.8, maintainability: 17.5, ai_harness: 0, originality: 4 },
  weaknesses: [
    { item: "maintainability.ci", score: 2, loss: 6.0, advice: ".github/workflows 에 검사·빌드 워크플로를 추가하세요." },
    { item: "originality.verdict", score: 2, loss: 4.0, advice: "README 에 기존 도구와의 차이를 구체적으로 적으세요." },
    { item: "code_quality.lint_config", score: 3, loss: 3.2, advice: "린터·포매터·타입 검사 설정을 모두 두고 CI 에서 검사하세요." },
  ],
  summary: "구조는 탄탄하지만 CI 와 차별점 설명이 아쉬운 소규모 라이브러리예요.",
  repo_type_reasons: ["선언 파일 package.json"],
  tree_truncated: false,
  unavailable: [],
  requests: 15,
};

const base = (over: Partial<AppraisalDetail> = {}): AppraisalDetail => ({
  id: "11111111-1111-1111-1111-111111111111",
  owner: "acme", repo: "widgets", head_sha: "a".repeat(40), mode: "quick",
  rubric_version: "1", repo_type: "library", status: "done",
  result: RESULT, weighted_score: 82.4, grade: "B+",
  llm_used: true, llm_model: "codex:mock-model", evidence_chars: 32100,
  error: null, delta: 2.3,
  created_at: "2026-11-15T10:00:00+00:00", finished_at: "2026-11-15T10:01:20+00:00",
  ...over,
});

export const DONE = base();
export const DONE_CACHED = base({ id: "22222222-2222-2222-2222-222222222222", delta: -1.1 });
export const DONE_DETERMINISTIC = base({
  id: "33333333-3333-3333-3333-333333333333",
  llm_used: false, llm_model: null,
  result: {
    ...RESULT,
    items: RESULT.items.map((i) => (i.item === "originality.verdict"
      ? { ...i, score: null, status: "unavailable" as const, evidence: { reason: "LLM 미사용" } }
      : i)),
    axes: { ...RESULT.axes, originality: null },
    summary: "",
  },
});
export const RUNNING = base({
  id: "44444444-4444-4444-4444-444444444444",
  status: "running", stage: "score", repo_type: null, result: null,
  weighted_score: null, grade: null, llm_used: false, llm_model: null,
  evidence_chars: 0, delta: null, finished_at: null,
});
export const QUEUED = { ...RUNNING, id: "55555555-5555-5555-5555-555555555555", status: "queued" as const, stage: "collect" as const };
export const FAILED = base({
  id: "66666666-6666-6666-6666-666666666666",
  status: "failed", repo_type: null, result: null, weighted_score: null, grade: null,
  llm_used: false, llm_model: null, evidence_chars: 0,
  error: "gh_not_found: 없거나 이 계정에 권한이 없습니다.", delta: null,
  finished_at: "2026-11-15T10:00:40+00:00",
});

const hist = (over: Partial<AppraisalHistoryItem> = {}): AppraisalHistoryItem => ({
  id: DONE.id, owner: "acme", repo: "widgets", head_sha: "a".repeat(40), mode: "quick",
  repo_type: "library", status: "done", weighted_score: 82.4, grade: "B+",
  llm_used: true, delta: 2.3,
  created_at: "2026-11-15T10:00:00+00:00", finished_at: "2026-11-15T10:01:20+00:00",
  ...over,
});

export const HISTORY: AppraisalHistoryItem[] = [
  hist(),
  hist({ id: DONE_CACHED.id, weighted_score: 80.1, grade: "B+", delta: 5.2, created_at: "2026-11-14T10:00:00+00:00", finished_at: "2026-11-14T10:01:00+00:00" }),
  hist({ id: "77777777-7777-7777-7777-777777777777", weighted_score: 74.9, grade: "B", delta: null, created_at: "2026-11-13T10:00:00+00:00", finished_at: "2026-11-13T10:01:00+00:00" }),
];
