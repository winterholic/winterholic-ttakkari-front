import { describe, expect, it } from "vitest";
import type { CollectionMission, MissionTraceRequirement } from "../../api/collectionMissions";
import { explainCollectionError, filterAndSortMissions, missionNeeds, requirementFulfillment } from "./missionProjects";

function mission(overrides: Partial<CollectionMission> = {}): CollectionMission {
  return {
    id: "one", title: "같은 제목", goal: "주제: 해양 데이터\n분야: 운임", status: "partial",
    plan: { title: "같은 제목", mode: "guided", steps: [], sources: [], queries: [], coverage: [], budget: { pages: 20, depth: 2, searches: 3, seconds: 60 }, stop_conditions: [] },
    counts: { imported: 8, collected: 12 }, jobs: [], gaps: [{ reason: "blocked", message: "로그인 필요" }], results: [],
    knowledge_processing: { storage: "stored", semantic: "pending" }, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-05T00:00:00Z",
    ...overrides,
  };
}

describe("collection project list model", () => {
  it("검색·상태 필터 후 최근 활동순으로 정렬하며 같은 제목의 별도 미션은 합치지 않는다", () => {
    const sameTitle = mission({ id: "same-title", updated_at: "2026-11-05T00:00:00Z" });
    const older = mission({ id: "older", updated_at: "2026-11-02T00:00:00Z" });
    const newer = mission({ id: "newer", title: "선박 운임 자료", goal: "운임 자료", status: "running", updated_at: "2026-11-06T00:00:00Z" });

    expect(filterAndSortMissions([sameTitle, older, newer], { query: "같은 제목", status: "all" }).map(item => item.id)).toEqual(["same-title", "older"]);
    expect(filterAndSortMissions([older, newer], { query: "운임", status: "active" }).map(item => item.id)).toEqual(["newer"]);
  });

  it("누적 적재는 mission counts에서만 읽고 마지막 결과와 다음 행동용 문제를 만든다", () => {
    const project = mission({
      runs: [{ run_seq: 2, trigger: "supplement", started_at: "2026-11-05T00:00:00Z", page_budget: 20, pages_used: 4, collected: 2, unchanged: 0, imported: 1, in_progress: false }],
      results: [{ id: "r1", url: "https://example.org/a", title: "대표 자료", status: "accepted", reasons: [], document_id: "d1", revision_id: null, delivery: "imported" }],
    });
    const needs = missionNeeds(project);

    expect(needs.imported).toBe(8);
    expect(needs.latestResult).toContain("대표 자료");
    expect(needs.issue).toContain("로그인 필요");
  });

  it("권리·정책 차단은 재시도 대신 허용된 출처를 안내하고 코드는 기술 상세에만 둔다", () => {
    const guide = explainCollectionError(Object.assign(new Error("store_not_permitted"), { status: 403, code: "store_not_permitted" }));
    expect(guide.policyBlocked).toBe(true);
    expect(guide.next).toContain("우회");
    expect(guide.what).not.toContain("store_not_permitted");
    expect(guide.technical).toContain("store_not_permitted");
  });

  it("조사 목적과 양의 목표량이 모두 있을 때만 요구 항목 비율을 계산한다", () => {
    const requirements: MissionTraceRequirement[] = [
      { group: "target", key: "a", label: "A", status: "met", documents: 2, sources: 1, need: 2 },
      { group: "topic", key: "b", label: "B", status: "partial", documents: 1, sources: 1, need: 3 },
    ];
    expect(requirementFulfillment("조사 목적", requirements)).toBe(50);
    expect(requirementFulfillment("", requirements)).toBeNull();
    expect(requirementFulfillment("조사 목적", [{ ...requirements[0], need: 0 }])).toBeNull();
  });
});
