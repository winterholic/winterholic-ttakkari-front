import { expect, it } from "vitest";
import { docRow, expansion, graph, hit } from "./kbFixtures";
import { bounds, mergeGraph, neighborsOf, nodeRadius, placeAround, seedStore } from "./graphStore";
import { activeFilterCount, filtersOf, hasClientFilter, matchDocument, matchHit, viewOf } from "./kbState";
import { crumbs, formatDuration, isActiveJob, reasonText, timecode, withinDays } from "./labelsV3";

const NOW = new Date("2026-10-25T00:00:00Z").getTime();

it("절 경로는 배열·문자열 모두 조각으로 바꾸고 시간 표기는 시:분:초로 맞춘다", () => {
  expect(crumbs("Kubernetes > Workloads >  Deployments")).toEqual(["Kubernetes", "Workloads", "Deployments"]);
  expect(crumbs(["A", " B "])).toEqual(["A", "B"]);
  expect(crumbs(null)).toEqual([]);
  expect(timecode(135000)).toBe("2:15");
  expect(timecode(3_725_000)).toBe("1:02:05");
  expect(formatDuration(820)).toBe("820ms");
  expect(formatDuration(2500)).toBe("2.5초");
});

it("보류 사유 코드는 문장으로, 모르는 코드는 코드 그대로 보여 준다", () => {
  expect(reasonText("ocr_required")).toContain("OCR");
  expect(reasonText("something_new")).toBe("something_new");
  expect(reasonText(null)).toBeNull();
  expect(isActiveJob("extracting")).toBe(true);
  expect(["ready", "degraded", "held", "failed"].some(isActiveJob)).toBe(false);
});

it("예전 view 값은 새 탭으로 옮기고 collect 는 별도 이동으로 구분한다", () => {
  expect([null, "search", "add", "zzz"].map(viewOf)).toEqual(["explore", "explore", "explore", "explore"]);
  expect(viewOf("docs")).toBe("docs");
  expect(viewOf("collect")).toBe("legacy-collect");
});

it("서버 필터와 불러온 결과 안 필터를 구분한다", () => {
  const f = filtersOf(new URLSearchParams("domain=ai&type=web&when=7&source=kubernetes.io&concept=e1&cn=Pod&status=failed"));
  expect(activeFilterCount(f, false)).toBe(5);
  expect(activeFilterCount(f, true)).toBe(6);
  expect(hasClientFilter(f)).toBe(true);
  expect(hasClientFilter(filtersOf(new URLSearchParams("domain=ai")))).toBe(false);
  expect(matchDocument(docRow, f, NOW)).toBe(true);
  expect(matchDocument(docRow, { ...f, type: "file" }, NOW)).toBe(false);
  expect(matchDocument(docRow, { ...f, source: "postgresql.org" }, NOW)).toBe(false);
  expect(matchDocument(docRow, { ...f, when: "1" }, NOW)).toBe(true);
  expect(matchDocument(docRow, { ...f, when: "1" }, NOW + 3 * 86_400_000)).toBe(false);
  expect(matchHit(hit, { ...f, when: "7" }, NOW)).toBe(true);
  expect(matchHit(hit, { ...f, type: "upload" }, NOW)).toBe(false);
  expect(withinDays("2026-10-24T12:00:00Z", 1, NOW)).toBe(true);
  expect(withinDays(null, 7, NOW)).toBe(false);
});

it("처음 허브만 배치하고, 펼친 이웃은 기존 노드를 움직이지 않고 빈 자리에 놓는다", () => {
  const first = seedStore(graph);
  expect(first.nodes.size).toBe(3);
  expect(first.expanded.size).toBe(0);
  const before = new Map(first.pos);
  const next = mergeGraph(first, expansion, "e-rs");
  expect(next.nodes.size).toBe(4);
  expect(next.edges.size).toBe(3);
  expect(next.expanded.has("e-rs")).toBe(true);
  for (const [id, p] of before) expect(next.pos.get(id)).toEqual(p);
  // 같은 입력이면 같은 자리(다시 그려도 노드가 뛰지 않는다)
  expect(mergeGraph(first, expansion, "e-rs").pos.get("e-hpa")).toEqual(next.pos.get("e-hpa"));
  const hpa = next.pos.get("e-hpa")!;
  const rs = next.pos.get("e-rs")!;
  expect(Math.hypot(hpa.x - rs.x, hpa.y - rs.y)).toBeGreaterThanOrEqual(150);
  for (const [id, p] of next.pos) if (id !== "e-hpa") expect(Math.hypot(hpa.x - p.x, hpa.y - p.y)).toBeGreaterThan(40);
  expect(next.total).toBe(40);
});

it("이웃 배치는 이미 찬 방향을 피하고 관계는 방향별로 모은다", () => {
  const center = { x: 0, y: 0 };
  const taken = [{ x: 150, y: 0 }, { x: -150, y: 0 }, { x: 0, y: 150 }];
  const p = placeAround(center, taken);
  expect(Math.min(...taken.map((t) => Math.hypot(t.x - p.x, t.y - p.y)))).toBeGreaterThan(100);
  const store = mergeGraph(seedStore(graph), expansion, "e-rs");
  const near = neighborsOf(store, "e-rs");
  expect(near.out.map((x) => x.node.name)).toEqual(["Pod"]);
  expect(near.into.map((x) => x.node.name).sort()).toEqual(["Deployment", "HorizontalPodAutoscaler"]);
  expect(bounds(store.pos).w).toBeGreaterThanOrEqual(300);
  expect(nodeRadius({ ...graph.nodes[0], document_count: 1000, assertion_count: 1000 })).toBeLessThanOrEqual(18);
});
