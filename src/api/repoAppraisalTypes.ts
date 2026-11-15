// 저장소 평가 API(/api/repo-appraisals) 요청·응답 모양.
// 정본은 백엔드 `src/ttakkari/api/repo_appraisals.py` 와 `repo_appraisal/service.py` 의 `detail_view`(ADR 0073).
// 여기에 없는 필드는 화면에서 쓰지 않는다. 값이 없을 수 있는 필드는 `| null`.

export type AppraisalMode = "quick" | "deep";
export type AppraisalStatus = "queued" | "running" | "done" | "failed";
export type AppraisalStage = "collect" | "score" | "llm";
export type AppraisalAxis = "code_quality" | "architecture" | "maintainability" | "ai_harness" | "originality";
export type AppraisalRepoType = "library" | "app" | "docs" | "experiment" | "unknown";
export type AppraisalItemStatus = "scored" | "unavailable" | "unverified" | "skipped" | "na" | "pending";

export const APPRAISAL_AXES: readonly AppraisalAxis[] = ["code_quality", "architecture", "maintainability", "ai_harness", "originality"];

/** 항목 1건. `item` 은 "축.항목" 키, 점수는 0~5 다. 미채점이면 점수 없이 상태만 온다. */
export interface AppraisalItem {
  item: string;
  score: number | null;
  status: AppraisalItemStatus;
  evidence: Record<string, unknown>;
}

export interface AppraisalWeakness {
  item: string;
  score: number;
  loss: number;
  advice: string;
}

export interface AppraisalResult {
  repo_type: AppraisalRepoType;
  /** 축 점수 0~5. 미채점 축은 null 이고 이유(na·unverified 등)는 `items` 상태에 있다. */
  axes: Record<AppraisalAxis, number | null>;
  items: AppraisalItem[];
  weights: Record<AppraisalAxis, number>;
  contributions: Record<AppraisalAxis, number>;
  weaknesses: AppraisalWeakness[];
  summary: string;
  repo_type_reasons: string[];
  tree_truncated: boolean;
  unavailable: string[];
  requests: number;
}

/** 상세 응답. 실행 중에는 `result` 가 null 이고 `stage` 만 있다. */
export interface AppraisalDetail {
  id: string;
  owner: string;
  repo: string;
  head_sha: string | null;
  mode: AppraisalMode;
  rubric_version: string;
  repo_type: AppraisalRepoType | null;
  status: AppraisalStatus;
  stage?: AppraisalStage | null;
  result: AppraisalResult | null;
  weighted_score: number | null;
  grade: string | null;
  llm_used: boolean;
  llm_model: string | null;
  evidence_chars: number;
  error: string | null;
  /** 직전 완료 평가와의 점수 차이. 첫 평가면 null. */
  delta: number | null;
  created_at: string | null;
  finished_at: string | null;
}

export interface AppraisalHistoryItem {
  id: string;
  owner: string;
  repo: string;
  head_sha: string | null;
  mode: AppraisalMode;
  repo_type: AppraisalRepoType | null;
  status: AppraisalStatus;
  weighted_score: number | null;
  grade: string | null;
  llm_used: boolean;
  delta: number | null;
  created_at: string | null;
  finished_at: string | null;
}

export interface AppraisalHistory {
  items: AppraisalHistoryItem[];
}

export interface AppraisalStartIn {
  /** `owner/repo` 나 github.com 주소. 해석은 서버가 한다. */
  target: string;
  account: string;
  mode: AppraisalMode;
  force: boolean;
}

/** 시작 응답. 캐시 적중(200)이면 `reused` 가 true 고 바로 결과다. */
export interface AppraisalStartOut {
  reused: boolean;
  appraisal: AppraisalDetail;
}
