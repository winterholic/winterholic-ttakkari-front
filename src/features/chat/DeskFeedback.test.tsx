import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunEvent, RunOut } from "../../api/types";
import { clearToasts, useToasts } from "../../ui/toastStore";
import { DeskFeedback, deskDecision } from "./DeskFeedback";

const putDeskFeedback = vi.fn();
vi.mock("../../api/client", () => ({ putDeskFeedback: (...a: unknown[]) => putDeskFeedback(...a) }));

const run: RunOut = {
  id: "r1", session_id: "desk1", workspace_id: "w1", prompt: "빌드 깨진 거 봐줘", context_artifact_ids: [],
  engine: "codex", model: "gpt-6-luna", effort: null, status: "succeeded", exit_code: null, error: null,
  result_text: "그건 이렇게 하면 돼요", cost_usd: null, usage: {}, checkpoint_ref: null, origin: "user", profile: "codex",
  last_seq: 3, created_at: "2026-10-13T00:00:00Z", started_at: "2026-10-13T00:00:01Z", finished_at: "2026-10-13T00:00:05Z",
};
const route = (action: "answer" | "delegate"): RunEvent =>
  ({ seq: 2, type: "desk.route", payload: { action, account: "codex", engine: "codex", ms: 4000 }, created_at: run.created_at }) as RunEvent;

function Toasts() {
  return (
    <ul>
      {useToasts().map((t) => (
        <li key={t.id}>{t.message}</li>
      ))}
    </ul>
  );
}

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
      <Toasts />
    </QueryClientProvider>,
  );
}

beforeEach(() => putDeskFeedback.mockReset());
afterEach(() => {
  cleanup();
  clearToasts();
});

describe("deskDecision", () => {
  it("판정이 있으면 판정 시점 결정을, 없으면 마지막 desk.route 를 쓴다", () => {
    expect(deskDecision(run, [])).toBeNull();
    expect(deskDecision(run, [route("delegate"), { ...route("answer"), seq: 5 }])).toBe("answer");
    const judged = { ...run, desk_feedback: { verdict: "ok", decided: "delegate", expected: "delegate", note: null, updated_at: run.created_at } } as RunOut;
    expect(deskDecision(judged, [route("answer")])).toBe("delegate");
  });
});

describe("DeskFeedback", () => {
  it("바로 답한 Run 에서 '넘겼어야 해'를 누르면 redo 로 보내고 토스트로 알린다", async () => {
    putDeskFeedback.mockResolvedValue({ lead_id: "lead1" });
    renderWith(<DeskFeedback run={run} decided="answer" />);
    expect(screen.queryByRole("button", { name: "바로 답했어야 해" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "넘겼어야 해" }));
    await waitFor(() => expect(putDeskFeedback).toHaveBeenCalledWith("r1", { verdict: "should_delegate", redo: true }));
    expect(await screen.findByText("기획 세션에 넘겼어요.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "넘겼어야 해" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("넘긴 Run 에는 '바로 답했어야 해'가 나오고 redo 없이 보낸다", async () => {
    putDeskFeedback.mockResolvedValue({ lead_id: null });
    renderWith(<DeskFeedback run={run} decided="delegate" />);
    fireEvent.click(screen.getByRole("button", { name: "바로 답했어야 해" }));
    await waitFor(() => expect(putDeskFeedback).toHaveBeenCalledWith("r1", { verdict: "should_answer", redo: false }));
    await waitFor(() => expect(screen.getByRole("button", { name: "바로 답했어야 해" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.queryByText("기획 세션에 넘겼어요.")).toBeNull();
  });

  it("이미 남긴 판정은 선택 상태로 보이고 다시 눌러도 보내지 않는다", () => {
    const judged = { ...run, desk_feedback: { verdict: "ok", decided: "answer", expected: "answer", note: null, updated_at: run.created_at } } as RunOut;
    renderWith(<DeskFeedback run={judged} decided="answer" />);
    const ok = screen.getByRole("button", { name: "맞아" });
    expect(ok.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "넘겼어야 해" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ok);
    expect(putDeskFeedback).not.toHaveBeenCalled();
  });

  it("실패하면 오류 토스트", async () => {
    putDeskFeedback.mockRejectedValueOnce(new Error("접수 세션의 사용자 메시지에만 판정할 수 있습니다."));
    renderWith(<DeskFeedback run={run} decided="answer" />);
    fireEvent.click(screen.getByRole("button", { name: "맞아" }));
    expect(await screen.findByText(/판정을 남기지 못했어요/)).toBeTruthy();
  });
});
