import { describe, expect, it } from "vitest";
import type { TaskNode } from "../../api/types";
import { buildForest } from "../tasks/buildTree";
import { DESK_ID, NODE_H, NODE_W, elbow, layoutForest } from "./layout";

let seq = 0;
const n = (id: string, parent: string | null, status: TaskNode["status"] = "succeeded"): TaskNode => {
  seq += 1;
  return {
    id, parent_id: parent, kind: "worker", title: id, pool: "personal", created_at: `2026-10-13T00:00:${String(seq).padStart(2, "0")}Z`,
    updated_at: "2026-10-13T00:00:00Z", archived_at: null, status, profile: null, model: null, last_result: null,
  };
};

describe("layoutForest", () => {
  const nodes = [n("A", "desk"), n("A1", "A"), n("A2", "A", "running"), n("B", "desk")];
  const forest = buildForest(["A", "B"], nodes);

  it("따까리를 맨 위 가운데에, 뿌리와 자식을 깊이별 줄에 둔다", () => {
    const l = layoutForest(forest, new Set());
    const at = (id: string) => l.nodes.find((p) => p.id === id)!;
    expect(at(DESK_ID).y).toBe(0);
    expect(at("A").depth).toBe(1);
    expect(at("A1").y).toBe(at("A2").y);
    expect(at("A1").y).toBeGreaterThan(at("A").y + NODE_H);
    // 부모는 자식들 가운데 위
    expect(at("A").x + NODE_W / 2).toBeCloseTo((at("A1").x + at("A2").x + NODE_W) / 2);
    // 따까리는 전체 가운데
    expect(at(DESK_ID).x + NODE_W / 2).toBeCloseTo(l.width / 2);
    // 겹치지 않는다
    const row = l.nodes.filter((p) => p.depth === 2).sort((a, b) => a.x - b.x);
    expect(row[1].x - row[0].x).toBeGreaterThanOrEqual(NODE_W);
  });

  it("일이 도는 가지로 가는 선만 살아 있다", () => {
    const l = layoutForest(forest, new Set());
    const live = l.edges.filter((e) => e.live).map((e) => `${e.from}>${e.to}`).sort();
    expect(live).toEqual([`${DESK_ID}>A`, "A>A2"].sort());
  });

  it("접힌 노드는 자식을 배치하지 않고 숨은 수를 센다", () => {
    const l = layoutForest(forest, new Set(["A"]));
    expect(l.nodes.map((p) => p.id).sort()).toEqual([DESK_ID, "A", "B"].sort());
    expect(l.nodes.find((p) => p.id === "A")!.hidden).toBe(2);
  });

  it("빈 숲이면 따까리 하나만 둔다", () => {
    const l = layoutForest([], new Set());
    expect(l.nodes.map((p) => p.id)).toEqual([DESK_ID]);
    expect(l.edges).toEqual([]);
  });
});

describe("elbow", () => {
  it("같은 x 면 곧은 선, 다르면 둥근 꺾은선", () => {
    expect(elbow(10, 0, 10, 50)).toBe("M10,0 V50");
    expect(elbow(0, 0, 100, 60)).toContain("Q");
  });
});
