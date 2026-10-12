import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RunOut } from "../../api/types";
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

describe("RunCard", () => {
  it("shows which account handled a run that ended on a session limit", () => {
    render(<RunCard run={run} view={buildRunView(run, [])} />);
    expect(screen.getByText("사용 계정: Codex 업무")).toBeTruthy();
  });
});
