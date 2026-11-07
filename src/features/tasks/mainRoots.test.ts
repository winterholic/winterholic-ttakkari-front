import { describe, expect, it } from "vitest";
import type { TaskRoot } from "../../api/types";
import { isMainRoot } from "./mainRoots";

const root = (over: Partial<TaskRoot>): TaskRoot => ({
  id: "r", parent_id: null, kind: "task", title: "t", pool: "personal",
  created_at: "2026-11-07T00:00:00Z", updated_at: "2026-11-07T00:00:00Z", archived_at: null,
  status: null, profile: null, model: null, last_result: null,
  descendants: 0, active: 0, failed: 0, ...over,
} as TaskRoot);

describe("isMainRoot", () => {
  it("하위를 거느린 뿌리만 메인 작업이다", () => {
    expect(isMainRoot(root({ descendants: 3 }))).toBe(true);
    expect(isMainRoot(root({ descendants: 0 }))).toBe(false);
  });
  it("접수 대화는 하위 수와 상관없이 제외한다", () => {
    expect(isMainRoot(root({ kind: "desk", descendants: 5 }))).toBe(false);
  });
});
