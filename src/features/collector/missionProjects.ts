import type { CollectionMission, MissionTraceRequirement } from "../../api/collectionMissions";

export type MissionListStatus = "all" | "active" | "attention" | "finished";

export interface MissionListFilter {
  query: string;
  status: MissionListStatus;
}

export interface MissionListNeeds {
  imported: number;
  lastActivity: string;
  latestResult: string;
  issue: string;
  nextAction: string;
}

const ACTIVE = new Set(["queued", "running", "paused", "discovery_pending", "waiting_sources"]);
const ATTENTION = new Set(["partial", "failed"]);
const FINISHED = new Set(["succeeded", "cancelled"]);
const RESULT_STATUS: Record<string, string> = {
  accepted: "수락·적재 확인 중", held: "보류", failed: "실패", blocked: "접근 제한", pending: "처리 대기", review_needed: "추가 확인 필요",
};

export interface CollectionErrorGuide {
  what: string;
  impact: string;
  next: string;
  technical: string;
  policyBlocked: boolean;
}

export function explainCollectionError(error: unknown): CollectionErrorGuide {
  const record = error && typeof error === "object" ? error as { status?: unknown; code?: unknown; message?: unknown; detail?: unknown } : {};
  const status = Number(record.status);
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  const detail = typeof record.detail === "string" ? record.detail : "";
  const policyBlocked = /rights|license|licence|policy|permission|not_permitted|forbidden|blocked/i.test(`${code} ${message}`) || status === 403;
  const technical = [code, detail || message].filter(Boolean).join(" · ");
  if (policyBlocked) return {
    what: "이 출처는 현재 조건으로 가져올 수 없습니다.",
    impact: "해당 출처의 자료는 이번 수집과 도서관 적재에서 제외됩니다.",
    next: "권한이 확인된 공개 자료나 허용된 출처를 계획에 추가해 다시 미리 보세요. 접근 제한을 우회하거나 같은 요청을 반복하지 마세요.",
    technical, policyBlocked: true,
  };
  if (status === 401) return { what: "로그인이 만료되어 요청을 처리하지 못했습니다.", impact: "수집 계획 또는 제어 요청이 반영되지 않았습니다.", next: "다시 로그인한 뒤 현재 상태를 새로 읽고 필요한 작업을 다시 요청하세요.", technical, policyBlocked: false };
  if (status === 429) return { what: "요청 한도에 도달했습니다.", impact: "요청이 대기하거나 거절됐습니다.", next: "안내된 대기 시간이 지난 뒤 상태를 확인하고 다시 시도하세요.", technical, policyBlocked: false };
  if (status >= 500) return { what: "수집 서비스가 요청을 마치지 못했습니다.", impact: "요청 결과가 아직 확인되지 않았을 수 있습니다.", next: "목록을 새로 읽어 반영 여부를 확인하고, 반영되지 않았을 때 다시 시도하세요.", technical, policyBlocked: false };
  return { what: "요청을 처리하지 못했습니다.", impact: "계획이나 제어 변경이 반영됐는지 확인이 필요합니다.", next: "현재 목록과 상태를 다시 읽고, 문제가 계속되면 기술 상세를 운영자에게 전달하세요.", technical, policyBlocked: false };
}

export function missionNeeds(mission: CollectionMission): MissionListNeeds {
  const latest = mission.results[0];
  const failedJob = mission.jobs.find(job => job.status === "failed" || job.error);
  const gap = mission.gaps[0];
  const issue = gap?.message || (failedJob ? "수집 작업에서 문제가 보고됐습니다. 기술 진단은 상세에서 확인하세요." : "");
  let nextAction = "진행 상세 보기";
  if (mission.status === "running") nextAction = "진행 확인 · 필요하면 일시정지";
  else if (["partial", "failed", "succeeded"].includes(mission.status) && issue) nextAction = "부족한 범위와 복구 방법 확인";
  else if (mission.status === "partial") nextAction = "부족한 대상 보충 수집";
  else if (mission.status === "failed") nextAction = "실패 원인 확인 후 이어서 실행";
  else if (mission.status === "paused") nextAction = "수집 재개 또는 중단";
  else if (mission.status === "cancelled") nextAction = "필요하면 다시 실행";

  return {
    // counts.imported is the mission-wide cumulative delivery count. run.imported is a single run.
    imported: mission.counts.imported ?? 0,
    lastActivity: mission.updated_at || mission.created_at,
    latestResult: latest ? `${latest.title || "자료"} · ${latest.delivery === "imported" ? "도서관 적재" : latest.delivery === "exported" ? "원문 보관·미적재" : latest.delivery === "pending" ? "도서관 적재 대기" : RESULT_STATUS[latest.status] ?? "결과 상태 확인 필요"}` : "아직 결과 없음",
    issue,
    nextAction,
  };
}

export function requirementFulfillment(goal: string, requirements: MissionTraceRequirement[]): number | null {
  if (!goal.trim() || requirements.length === 0 || requirements.some(item => !Number.isFinite(item.need) || item.need <= 0)) return null;
  return Math.round((requirements.filter(item => item.status === "met").length / requirements.length) * 100);
}

export function filterAndSortMissions(items: CollectionMission[], filter: MissionListFilter): CollectionMission[] {
  const needle = filter.query.trim().toLocaleLowerCase("ko-KR");
  return items.filter(mission => {
    const matchesStatus = filter.status === "all"
      || (filter.status === "active" && ACTIVE.has(mission.status))
      || (filter.status === "attention" && ATTENTION.has(mission.status))
      || (filter.status === "finished" && FINISHED.has(mission.status));
    const searchable = `${mission.title} ${mission.goal} ${mission.plan.coverage.map(entry => entry.topic).join(" ")}`.toLocaleLowerCase("ko-KR");
    return matchesStatus && (!needle || searchable.includes(needle));
  }).sort((a, b) => missionNeeds(b).lastActivity.localeCompare(missionNeeds(a).lastActivity));
}
