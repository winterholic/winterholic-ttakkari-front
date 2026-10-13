import { describe, expect, it } from "vitest";
import type { TaskNode } from "../../api/types";
import { branchStatus, buildForest, defaultOpen } from "./buildTree";

let seq = 0;
function node(id: string, parent: string | null, status: TaskNode["status"] = "succeeded"): TaskNode {
  seq += 1;
  return {
    id, parent_id: parent, kind: parent === "desk" ? "orchestrator" : "worker", title: id, pool: "personal",
    created_at: `2026-10-13T00:00:${String(seq).padStart(2, "0")}Z`, updated_at: "2026-10-13T00:00:00Z", archived_at: null,
    status, profile: null, model: null, last_result: null,
  };
}

describe("buildForest", () => {
  const nodes = [
    node("lead", "desk"),
    node("a", "lead"),
    node("a1", "a", "running"),
    node("b", "lead", "failed"),
    node("other", "desk", "succeeded"),
  ];

  it("뿌리 순서를 지키고, 접수를 부모로 둔 뿌리도 뿌리로 본다", () => {
    const f = buildForest(["other", "lead"], nodes);
    expect(f.map((t) => t.node.id)).toEqual(["other", "lead"]);
    expect(f[1].children.map((c) => c.node.id)).toEqual(["a", "b"]);
    expect(f[1].children[0].children[0].depth).toBe(2);
  });

  it("아래에서 도는 일과 크기를 센다", () => {
    const [lead] = buildForest(["lead"], nodes);
    expect(lead.activeBelow).toBe(1);
    expect(lead.size).toBe(3);
    expect(branchStatus(lead)).toBe("running");
    expect(branchStatus(lead.children[1])).toBe("failed");
  });

  it("일이 도는 가지와 지금 보는 세션까지의 길만 펼친다", () => {
    const f = buildForest(["lead", "other"], nodes);
    expect([...defaultOpen(f)].sort()).toEqual(["a", "lead"]);
    expect([...defaultOpen(f, ["other"])].sort()).toEqual(["a", "lead", "other"]);
  });

  it("부모가 목록에 없는 노드와 순환은 버린다", () => {
    const loop = [node("x", "y"), node("y", "x")];
    expect(buildForest(["x"], loop)[0].children[0].children).toEqual([]);
    expect(buildForest(["missing"], nodes)).toEqual([]);
  });
});
