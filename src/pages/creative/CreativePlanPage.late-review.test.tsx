import { cleanup, fireEvent, render, screen, waitFor, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { CreativePlanNewPage } from "./CreativePlanPage";

vi.mock("../../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/creative/plan"]}><CreativePlanNewPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

test("a delayed storyboard start preserves the submitted draft and leaves it unconfirmed", async () => {
  let finish!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => { finish = resolve; });
  let startReceived = false;
  let submittedBody: unknown;

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/storyboard/runs") && init?.method === "POST") {
      startReceived = true;
      submittedBody = JSON.parse(String(init.body));
      return pending;
    }
    if (url.endsWith("/storyboard/runs/run-1")) return ok({ run_id: "run-1", status: "queued", phase: "queued", engine: "codex" });
    if (url.endsWith("/creative/projects")) return ok([]);
    if (url.endsWith("/plans")) return ok([]);
    throw new Error(`unexpected request ${url}`);
  }));

  mount();
  const brief = "기술 설명 영상";
  const qualityGoal = "초보자도 핵심 기능을 바로 이해하도록 구성";
  const storyboard = document.querySelector(".storyboard-create");
  expect(storyboard).not.toBeNull();
  const storyboardForm = within(storyboard as HTMLElement);
  fireEvent.change(storyboardForm.getByRole("textbox", { name: "만들고 싶은 콘텐츠" }), { target: { value: brief } });
  fireEvent.change(storyboardForm.getByRole("textbox", { name: "품질 목표 (선택)" }), { target: { value: qualityGoal } });
  fireEvent.click(screen.getByRole("button", { name: "AI 장면 구성 만들기" }));
  await waitFor(() => expect(startReceived).toBe(true));

  const currentBrief = storyboardForm.getByRole("textbox", { name: "만들고 싶은 콘텐츠" }) as HTMLTextAreaElement;
  const currentGoal = storyboardForm.getByRole("textbox", { name: "품질 목표 (선택)" }) as HTMLTextAreaElement;
  expect(currentBrief).toHaveProperty("value", brief);
  expect(currentGoal).toHaveProperty("value", qualityGoal);
  expect(currentBrief.disabled).toBe(true);
  expect(currentGoal.disabled).toBe(true);
  expect(submittedBody).toEqual({
    brief: `사용자 요청:\n${brief}\n\n사용자 품질 목표 (보장 아님):\n${qualityGoal}`,
    sources: [{
      id: "brief",
      locator: "사용자 요청",
      text: `사용자 요청:\n${brief}\n\n사용자 품질 목표 (보장 아님):\n${qualityGoal}`,
    }],
    engine: "codex",
  });

  await act(async () => {
    finish(ok({ run_id: "run-1", status: "queued", engine: "codex" }));
    await pending;
  });

  await screen.findByText("실행 상태 · 대기 중");
  expect(currentBrief).toHaveProperty("value", brief);
  expect(currentGoal).toHaveProperty("value", qualityGoal);
  expect(storyboardForm.queryByRole("button", { name: "이 출력으로 미승인 계획 만들기" })).toBeNull();
  expect(storyboardForm.queryByText("검증을 통과했고 사용자가 확인했습니다.")).toBeNull();
});
