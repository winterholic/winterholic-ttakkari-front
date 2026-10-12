import { describe, expect, it } from "vitest";
import { layoutGraph } from "./forceLayout";
import { markTerms, diagnose } from "./SearchLabTab";
import { ago } from "./shared";
import { inset, squarify, withFloor } from "./treemap";
import type { LibSearchLab } from "../../api/client";

describe("squarify", () => {
  const rect = { x: 0, y: 0, w: 400, h: 200 };
  const items = [50, 30, 10, 6, 4].map((v, i) => ({ value: v, data: i }));

  it("면적이 값에 비례하고 전체를 빈틈없이 채운다", () => {
    const out = squarify(items, rect);
    const total = out.reduce((a, r) => a + r.w * r.h, 0);
    expect(total).toBeCloseTo(400 * 200, 3);
    for (const r of out) expect((r.w * r.h) / total).toBeCloseTo(r.value / 100, 3);
  });

  it("모든 사각형이 바깥 사각형 안에 있고 서로 겹치지 않는다", () => {
    const out = squarify(items, rect);
    for (const r of out) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(400 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(200 + 1e-6);
    }
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(overlapW > 1e-6 && overlapH > 1e-6).toBe(false);
      }
    }
  });

  it("0 이하 값과 빈 입력은 그리지 않는다", () => {
    expect(squarify([], rect)).toEqual([]);
    expect(squarify([{ value: 0, data: 1 }], rect)).toEqual([]);
    expect(squarify(items, { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });

  it("withFloor 는 아주 작은 값만 키우고 키웠는지 알려 준다", () => {
    const r = withFloor([{ value: 1000, data: "a" }, { value: 1, data: "b" }], 0.05);
    expect(r.inflated).toBe(true);
    expect(r.items[0].value).toBe(1000);
    expect(r.items[1].value).toBeCloseTo(50.05, 1);
    expect(withFloor([{ value: 10, data: 1 }, { value: 10, data: 2 }]).inflated).toBe(false);
  });

  it("inset 은 너무 작은 사각형에서 음수 크기를 만들지 않는다", () => {
    expect(inset({ x: 0, y: 0, w: 3, h: 100 }, 4)).toEqual({ x: 1.5, y: 1.5, w: 0, h: 97 });
  });
});

describe("layoutGraph", () => {
  const nodes = ["a", "b", "c", "d", "iso1", "iso2"].map((id) => ({ id }));
  const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "c", target: "d" }];

  it("같은 입력이면 같은 배치다", () => {
    const x = layoutGraph(nodes, edges, { width: 600 });
    const y = layoutGraph(nodes, edges, { width: 600 });
    expect([...x.positions]).toEqual([...y.positions]);
  });

  it("모든 노드가 유한한 좌표로 화면 폭 안에 놓이고 서로 겹치지 않는다", () => {
    const r = layoutGraph(nodes, edges, { width: 600 });
    expect(r.positions.size).toBe(nodes.length);
    const pts = [...r.positions.values()];
    for (const p of pts) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(600);
      expect(p.y).toBeLessThanOrEqual(r.height);
    }
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(10);
    }
  });

  it("관계 없는 노드는 연결된 노드보다 아래 띠에 놓인다", () => {
    const r = layoutGraph(nodes, edges, { width: 600 });
    const lowestLinked = Math.max(...["a", "b", "c", "d"].map((id) => r.positions.get(id)!.y));
    for (const id of ["iso1", "iso2"]) expect(r.positions.get(id)!.y).toBeGreaterThan(lowestLinked);
  });

  it("엔터티가 없거나 관계가 없어도 죽지 않는다", () => {
    expect(layoutGraph([], []).positions.size).toBe(0);
    expect(layoutGraph([{ id: "x" }], []).positions.size).toBe(1);
  });
});

describe("검색 실험실 보조", () => {
  it("질의 단어를 표시하되 정규식 특수문자는 문자 그대로 다룬다", () => {
    expect(markTerms("디자인 시스템 토큰", ["시스템"])).toEqual(["디자인 ", { mark: "시스템" }, " 토큰"]);
    expect(markTerms("a.b a+b", ["a.b"])).toEqual([{ mark: "a.b" }, " a+b"]);
    expect(markTerms("그대로", [])).toEqual(["그대로"]);
    expect(markTerms("Token token", ["token"])).toEqual([{ mark: "Token" }, " ", { mark: "token" }]);
  });

  const hit = (score: number, via: "keyword" | "entity" | "fuzzy" = "keyword") =>
    ({ rank: 1, type: "chunk", id: String(score) + via, score, text: "", matched_terms: [], match_in: [], via, coverage: 0, entities: null }) as LibSearchLab["results"][number];

  it("결과가 비면 의미 검색을 하지 않는다고 알려 준다", () => {
    const notes = diagnose({ query: "q", scope: "all", terms: ["q"], anchors: [], elapsed_ms: 1, results: [] });
    expect(notes.join(" ")).toContain("의미 검색은 하지 않아요");
  });

  it("상위 점수가 같으면 변별이 안 된다고 알려 준다", () => {
    const r: LibSearchLab = { query: "q", scope: "all", terms: ["q"], anchors: [], elapsed_ms: 1, results: [hit(1.48), hit(1.48), hit(1.48), hit(1.1, "fuzzy")] };
    const notes = diagnose(r);
    expect(notes.some((x) => x.includes("점수가 같아요"))).toBe(true);
    expect(notes.some((x) => x.includes("키워드가 아닌 경로"))).toBe(true);
  });
});

describe("ago", () => {
  const now = new Date("2026-10-13T12:00:00Z").getTime();
  it("색인 경과를 사람이 읽는 말로 바꾼다", () => {
    expect(ago(null, now)).toBe("색인 기록 없음");
    expect(ago("2026-10-13T11:59:30Z", now)).toBe("방금");
    expect(ago("2026-10-13T11:15:00Z", now)).toBe("45분 전");
    expect(ago("2026-10-13T06:00:00Z", now)).toBe("6시간 전");
    expect(ago("2026-10-09T12:00:00Z", now)).toBe("4일 전");
  });
});
