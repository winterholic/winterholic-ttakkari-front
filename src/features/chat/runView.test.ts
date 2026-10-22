import { describe, expect, it } from "vitest";
import type { RunEvent, RunOut } from "../../api/types";
import { shouldSubmit } from "./Composer";
import { actualEngine, buildRunView, describeTool } from "./runView";

const base: RunOut = {
  id: "r1", session_id: "s1", workspace_id: "w1", prompt: "README 고쳐줘", context_artifact_ids: [], engine: "claude",
  model: null, effort: null, status: "running", exit_code: null, error: null, result_text: null, cost_usd: null,
  usage: {}, checkpoint_ref: null, origin: "user", profile: "claude", last_seq: 0, created_at: "2026-10-09T00:00:00Z", started_at: "2026-10-09T00:00:01Z",
  finished_at: null,
};

let seq = 0;
const ev = <T extends RunEvent["type"]>(type: T, payload: Extract<RunEvent, { type: T }>["payload"]) =>
  ({ seq: ++seq, type, payload, created_at: "2026-10-09T00:00:02Z" }) as RunEvent;

describe("buildRunView", () => {
  it("사용량의 실제 선택 엔진이 오래된 Run 엔진 표기보다 우선한다", () => {
    const staleQwenRun = { ...base, engine: "qwen-local", usage: {
      selected_engine: "codex",
      fallback: { to_engine: "qwen-local", to_model: "Qwen3.8-Flash-Next-Q2_K" },
    } };
    expect(actualEngine(staleQwenRun)).toBe("codex");
  });

  it("도구 호출과 결과를 단계로 짝짓고 진행 중 단계를 doing 으로 보여준다", () => {
    const v = buildRunView(base, [
      ev("run.status", { status: "running" }),
      ev("tool.call", { call_id: "a", name: "Read", input: { file_path: "/x/y/README.md" } }),
      ev("tool.result", { call_id: "a", is_error: false, output: "ok" }),
      ev("tool.call", { call_id: "b", name: "Bash", input: { command: "npm test" } }),
    ]);
    expect(v.steps.map((s) => s.state)).toEqual(["succeeded", "running"]);
    expect(v.doing).toBe("명령 실행 · npm test");
    expect(v.state).toBe("running");
  });

  it("guard 차단은 단계 실패 + 이유로 남고 개수를 센다", () => {
    const v = buildRunView(base, [
      ev("tool.call", { call_id: "c", name: "Bash", input: { command: "cat ~/.ssh/id_rsa" } }),
      ev("tool.result", { call_id: "c", is_error: true, output: "hook error" }),
      ev("guard.blocked", { call_id: "c", reason: "PreToolUse:Bash hook error: [ttakkari-guard] 민감 파일 읽기·반출 차단: ~/.ssh/id_rsa. 이 작업은 금지" }),
    ]);
    expect(v.blockedCount).toBe(1);
    expect(v.steps[0].state).toBe("failed");
    expect(v.steps[0].detail).toContain("민감 파일 읽기·반출 차단");
  });

  it("끝나면 결과 문장·상태를 run.finished 에서 가져오고 남은 단계는 멈춘 것으로 본다", () => {
    const v = buildRunView(base, [
      ev("tool.call", { call_id: "d", name: "Bash", input: { command: "sleep 100" } }),
      ev("run.finished", { status: "cancelled", error: null, result_text: null, cost_usd: 0.01, exit_code: -15 }),
    ]);
    expect(v.state).toBe("cancelled");
    expect(v.steps[0].state).toBe("cancelled");
    expect(v.doing).toBeNull();
    expect(v.costUsd).toBe(0.01);
  });

  it("interrupted 는 취소 모양이지만 상태는 그대로 둔다", () => {
    const v = buildRunView({ ...base, status: "interrupted", result_text: "부분 결과" }, []);
    expect(v.state).toBe("cancelled");
    expect(v.status).toBe("interrupted");
    expect(v.text).toBe("부분 결과");
  });
});

describe("buildRunView 사용량 한도 전환·대기", () => {
  const queued: RunOut = { ...base, status: "queued", started_at: null };

  it("같은 Run 의 계정 전환 이력을 모은다", () => {
    const v = buildRunView(base, [
      ev("account.limited", { account: "claude", engine: "claude", reset_at: "2026-10-12T10:20:00Z", detail: "limit" }),
      ev("engine.fallback", {
        from: "claude", to: "codex", reason: "usage_limit", detail: "limit", reset_at: "2026-10-12T10:20:00Z", mode: "handoff",
      }),
    ]);
    expect(v.switches).toHaveLength(1);
    expect(v.switches[0]).toMatchObject({ from: "claude", to: "codex", reason: "usage_limit", mode: "handoff" });
    expect(v.log.map((l) => l.level)).toEqual(["warn", "warn"]);
    expect(v.state).toBe("running");
  });

  it("모든 계정이 한도면 queued Run 이 waiting 으로 보이고, 재개하면 풀린다", () => {
    const waitingEvent = ev("run.waiting", {
      until: "2026-10-12T10:20:00Z",
      accounts: [{ name: "claude", engine: "claude", resets_at: "2026-10-12T10:20:00Z" }],
    });
    const v = buildRunView(queued, [ev("run.status", { status: "queued" }), waitingEvent]);
    expect(v.state).toBe("waiting");
    expect(v.status).toBe("queued");
    expect(v.waiting?.accounts[0].name).toBe("claude");
    expect(v.doing).toContain("한도");

    const resumed = buildRunView({ ...queued, status: "running" }, [
      waitingEvent,
      ev("run.status", { status: "running" }),
      ev("run.resumed", { account: "claude" }),
    ]);
    expect(resumed.state).toBe("running");
    expect(resumed.waiting).toBeNull();
  });

  it("대기 중 취소하면 대기 표시가 사라진다", () => {
    const v = buildRunView({ ...queued, status: "cancelled" }, [
      ev("run.waiting", { until: "2026-10-12T10:20:00Z", accounts: [] }),
      ev("run.finished", { status: "cancelled", error: null, result_text: null, cost_usd: null, exit_code: null }),
    ]);
    expect(v.state).toBe("cancelled");
    expect(v.waiting).toBeNull();
  });
});

describe("describeTool", () => {
  it("긴 경로는 끝 두 조각만", () => {
    expect(describeTool("Write", { file_path: "/a/b/c/d/e.md" })).toEqual({ name: "파일 쓰기", target: "…/d/e.md" });
  });
});

describe("shouldSubmit", () => {
  const k = (o: Partial<{ key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean; keyCode: number; isComposing: boolean }>) => ({
    key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, keyCode: 13, isComposing: false, ...o,
  });
  it("한글 조합 중 Enter 는 보내지 않는다", () => {
    expect(shouldSubmit(k({ isComposing: true }), false)).toBe(false);
    expect(shouldSubmit(k({ keyCode: 229 }), false)).toBe(false);
  });
  it("정밀 포인터는 Enter 보내기, Shift+Enter 줄바꿈", () => {
    expect(shouldSubmit(k({}), false)).toBe(true);
    expect(shouldSubmit(k({ shiftKey: true }), false)).toBe(false);
  });
  it("터치는 Enter 줄바꿈, ⌘+Enter 는 보내기", () => {
    expect(shouldSubmit(k({}), true)).toBe(false);
    expect(shouldSubmit(k({ metaKey: true }), true)).toBe(true);
  });
});
