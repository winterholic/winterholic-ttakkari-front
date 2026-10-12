import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RunEvent, RunOut } from "../../api/types";
import { buildRunView } from "./runView";
import { RunCard } from "./RunCard";

const run: RunOut = {
  id: "r1", session_id: "s1", workspace_id: "w1", prompt: "작업해줘", context_artifact_ids: [],
  engine: "auto", model: null, effort: null, status: "failed", exit_code: 1,
  error: "You've hit your session limit · resets 7:20pm (Asia/Seoul)", result_text: null,
  cost_usd: null, usage: {}, checkpoint_ref: null, origin: "user", profile: "Codex 업무",
  last_seq: 0, created_at: "2026-10-12T00:00:00Z", started_at: "2026-10-12T00:00:01Z",
  finished_at: "2026-10-12T00:00:04Z",
};

afterEach(cleanup);

describe("RunCard 한도 대기·전환", () => {
  let seq = 0;
  const ev = <T extends RunEvent["type"]>(type: T, payload: Extract<RunEvent, { type: T }>["payload"]) =>
    ({ seq: ++seq, type, payload, created_at: "2026-10-12T00:00:02Z" }) as RunEvent;

  it("대기 중이면 한도 대기 배지와 재개 시각, 멈추기 버튼을 보여 준다", () => {
    const queued: RunOut = { ...run, status: "queued", error: null, finished_at: null };
    const view = buildRunView(queued, [
      ev("run.waiting", {
        until: "2099-01-01T05:20:00Z",
        accounts: [{ name: "claude", engine: "claude", resets_at: "2099-01-01T05:20:00Z" }],
      }),
    ]);
    render(<RunCard run={queued} view={view} onStop={() => undefined} />);
    expect(screen.getByText("한도 대기")).toBeTruthy();
    expect(screen.getByText(/모든 계정이 사용량 한도예요/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "멈추기" })).toBeTruthy();
  });

  it("계정 전환 이력을 카드에 보여 준다", () => {
    const view = buildRunView({ ...run, status: "succeeded", error: null }, [
      ev("engine.fallback", { from: "claude", to: "codex", reason: "usage_limit", detail: "limit", reset_at: null, mode: "handoff" }),
    ]);
    render(<RunCard run={{ ...run, status: "succeeded", error: null }} view={view} />);
    expect(screen.getByText("계정 전환 1번")).toBeTruthy();
    expect(screen.getByText(/claude → codex \(사용량 한도 · 대화·진행 요약 전달\)/)).toBeTruthy();
  });
});

describe("RunCard", () => {
  it("shows which account handled a run that ended on a session limit", () => {
    render(<RunCard run={run} view={buildRunView(run, [])} />);
    expect(screen.getByText("사용 계정: Codex 업무")).toBeTruthy();
  });
});
