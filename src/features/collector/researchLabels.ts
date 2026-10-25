import type { CollectionMission, CollectionPaper, CollectionPlan } from "../../api/collectionMissions";

/** 조사 하위 주제 상태. 백엔드 research.compute_coverage 의 판정과 같은 뜻으로 옮긴다. */
export const COVERAGE_STATE: Record<string, { label: string; hint: string }> = {
  unexplored: { label: "미조사", hint: "아직 이 주제로 실행된 검색이 없습니다." },
  no_candidates: { label: "후보 없음", hint: "검색은 성공했지만 수집할 출처를 찾지 못했습니다." },
  sources_found: { label: "출처 발견", hint: "출처 주소는 찾았고 아직 수집된 자료가 없습니다." },
  unavailable: { label: "수집 못함", hint: "찾은 출처를 모두 수집하지 못했습니다(보류·실패·접근 제한)." },
  thin: { label: "자료 부족", hint: "수집한 자료가 있지만 서로 다른 출처 2곳 기준에 못 미칩니다." },
  covered: { label: "충분히 확보", hint: "서로 다른 출처 2곳 이상에서 자료를 확보했습니다." },
};
export const COVERED_RULE = "‘충분히 확보’는 서로 다른 출처 2곳 이상(자료 2건 이상) 기준입니다. 수집 건수와 출처 수만 본 것이며 내용이 정확하다는 뜻은 아닙니다.";

export function coverageLabel(state: string | undefined): string {
  return COVERAGE_STATE[state ?? ""]?.label ?? "상태 확인 필요";
}

const STOP_TEXT: Record<string, string> = {
  coverage_satisfied: "모든 하위 주제를 충분히 확보해 조사를 마쳤습니다.",
  time_budget: "시간 예산을 모두 써서 조사를 마쳤습니다.",
  search_budget: "검색 예산을 모두 써서 조사를 마쳤습니다.",
  query_budget: "준비한 검색어를 모두 실행해 검색을 마쳤습니다.",
  no_novel_queries: "더 시도할 새 검색어가 없어 조사를 마쳤습니다.",
  diminishing_returns: "새 검색어로도 새 자료가 늘지 않아(추가 효용 감소) 조사를 마쳤습니다.",
  provider_failed: "검색 공급자 호출이 실패해 조사를 이어가지 못했습니다. 결과가 없었다는 뜻이 아니라 검색을 마치지 못했다는 뜻입니다.",
  round_job_failed: "후속 라운드 작업이 끝나지 못해 더 진행하지 않았습니다.",
};

export function stopText(stop: string | null | undefined, roundLimit?: number): string {
  if (stop === "round_limit") return `후속 조사 라운드 상한${roundLimit ? `(${roundLimit}회)` : ""}에 도달해 조사를 마쳤습니다.`;
  if (!stop) return "아직 종료 사유가 기록되지 않았습니다. 조사가 진행 중일 수 있습니다.";
  return STOP_TEXT[stop] ?? "종료 사유 확인 필요";
}

/** 후속 검색어를 고른 근거(백엔드 research.followups 의 reason). */
export const ROUND_REASON: Record<string, string> = {
  deferred_topic: "미뤄 둔 하위 주제",
  new_keyword: "수집 자료에서 찾은 새 용어",
  learned_translation: "자료에서 익힌 번역어",
  weak_topic_alt: "부족한 주제를 다른 표현으로",
};

const SEARCH_ERROR: Record<string, string> = {
  timeout: "응답 시간 초과",
  search_provider_challenge: "검색 공급자가 자동 접근 확인을 요구함",
  provider_response_unparseable: "검색 응답을 해석하지 못함",
  search_url_rejected: "허용되지 않은 검색 주소",
};

export function searchErrorLabels(codes: string[] | undefined): string[] {
  return [...new Set((codes ?? []).map(code => SEARCH_ERROR[code]).filter((label): label is string => Boolean(label)))];
}

export interface SearchStats { failedByTopic: Record<string, number>; failed: number; emptyOk: number; ranOk: number }

/** 해결되지 않은 검색 실패와 '성공했지만 결과 없음'을 따로 센다. 실패는 결과 없음이 아니다. */
export function searchStats(plan: CollectionPlan, runSeq: number): SearchStats {
  const failedByTopic: Record<string, number> = {};
  const current = plan.research?.run_seq == null || plan.research.run_seq === runSeq;
  const unresolved = current ? plan.research?.failed ?? [] : [];
  for (const entry of unresolved) {
    const topic = plan.query_topics?.[(plan.queries ?? [])[entry.index] ?? ""];
    if (topic) failedByTopic[topic] = (failedByTopic[topic] ?? 0) + 1;
  }
  const history = (plan.search_history ?? []).filter(entry => (entry.run_seq ?? 1) === runSeq && entry.status !== "failed");
  return { failedByTopic, failed: unresolved.length, emptyOk: history.filter(entry => (entry.candidates ?? 0) === 0).length, ranOk: history.length };
}

export const RELATION_LABEL: Record<string, string> = { user_cited: "사용자가 직접 인용", lexical_overlap: "내용 유사(단서)" };
export const TARGET_KIND: Record<string, string> = { kb_document: "도서관 문서", collected_document: "수집 문서", paper: "논문" };

export interface PaperRights { summary: string; detail: string; fulltext: boolean }

/** 제공처가 보고한 라이선스만 근거로 쓴다. 보고가 없거나 조회에 실패하면 권리를 모르는 것으로 둔다. */
export function paperRights(paper: CollectionPaper): PaperRights {
  const license = paper.license;
  if (paper.fulltext === "allowed") {
    return { fulltext: true, summary: "전문 수집 가능",
      detail: `제공처가 ${license?.id ?? "공개"} 라이선스로 보고함 · 출처와 라이선스 표기를 유지해야 함` };
  }
  if (license?.permission === "allowed") {
    return { fulltext: false, summary: "서지 정보만", detail: "공개 라이선스로 보고됐지만 전문 파일 주소가 없어 서지 정보만 기록함" };
  }
  if (license?.error) return { fulltext: false, summary: "서지 정보만", detail: "권리 조회에 실패해 전문 보관 권한을 확인하지 못함" };
  if (license?.id) return { fulltext: false, summary: "서지 정보만", detail: `제공처 보고 라이선스 ${license.id}: 전문 수집 대상이 아님` };
  return { fulltext: false, summary: "서지 정보만", detail: "전문 보관 권한을 확인하지 못함" };
}

export function paperSource(paper: CollectionPaper): string {
  const kind = paper.kind === "arxiv" ? "arXiv" : paper.kind === "doi" ? "DOI" : "논문 출처";
  return [paper.venue && paper.venue !== kind ? paper.venue : null, paper.year ? `${paper.year}년` : null, `${kind} ${paper.identifier}`]
    .filter(Boolean).join(" · ");
}

export const safeHttp = (url: string | undefined): string | null => (url && /^https?:\/\//i.test(url) ? url : null);

export function hasResearch(mission: CollectionMission): boolean {
  const plan = mission.plan;
  return Boolean(mission.research || plan.papers?.length || plan.context_links || plan.context?.text?.trim());
}
