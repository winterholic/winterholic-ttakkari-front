import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createRun = vi.fn();
vi.mock("../../api/client", async (orig) => ({ ...(await orig<typeof import("../../api/client")>()), createRun: (...a: unknown[]) => createRun(...a) }));

import { FollowupComposer } from "./FollowupComposer";

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FollowupComposer sessionId="s1" artifactId="a1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const box = screen.getByLabelText("이 문서에 대해 지시") as HTMLTextAreaElement;
  return box;
}

beforeEach(() => {
  createRun.mockReset();
  createRun.mockResolvedValue({ id: "r1" });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

describe("FollowupComposer Enter 규칙", () => {
  it("한글 조합 중 Enter 는 보내지 않는다", async () => {
    const box = setup();
    fireEvent.change(box, { target: { value: "3번을 줄여" } });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229, isComposing: true });
    // mutate 는 비동기로 mutationFn 을 부르므로 한 틱 기다린 뒤에도 호출이 없어야 의미가 있다.
    await new Promise((r) => setTimeout(r, 30));
    expect(createRun).not.toHaveBeenCalled();
  });

  it("조합이 끝난 Enter 는 현재 결과물을 문맥으로 붙여 보낸다", async () => {
    const box = setup();
    fireEvent.change(box, { target: { value: "3번을 줄여" } });
    fireEvent.keyDown(box, { key: "Enter", keyCode: 13 });
    await waitFor(() => expect(createRun).toHaveBeenCalledWith("s1", { prompt: "3번을 줄여", context_artifact_ids: ["a1"] }));
  });

  it("빈 입력은 보내지 않는다", () => {
    const box = setup();
    fireEvent.keyDown(box, { key: "Enter", keyCode: 13 });
    expect(createRun).not.toHaveBeenCalled();
  });
});
