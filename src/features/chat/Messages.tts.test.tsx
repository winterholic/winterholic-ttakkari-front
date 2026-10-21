import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { RunOut } from "../../api/types";
import { resetTtsPrefsCache, setTtsPrefs } from "../tts/ttsPrefs";
import { AgentMessage } from "./Messages";
import type { RunView } from "./runView";

const api = vi.hoisted(() => ({ status: vi.fn(), voices: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<typeof import("../../api/client")>()), getTtsStatus: api.status, listTtsVoices: api.voices }));
vi.mock("../markdown/AppMarkdown", () => ({ AppMarkdown: ({ children }: { children: string }) => <p>{children}</p> }));
vi.mock("./RunCard", () => ({ RunCard: () => null, StateBadge: () => null }));

const run = { id: "run-1", session_id: "s", workspace_id: "w", created_at: "2026-10-21T01:00:00Z", started_at: null, finished_at: "2026-10-21T01:00:05Z" } as unknown as RunOut;
const view = (over: Partial<RunView> = {}) =>
  ({ status: "succeeded", state: "succeeded", text: "안녕하세요. 답입니다.", doing: null, artifacts: [], steps: [], log: [], ...over }) as unknown as RunView;

function show(v: RunView) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AgentMessage run={run} view={v} onOpen={() => undefined} hideCard /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  resetTtsPrefsCache();
  api.status.mockResolvedValue({ enabled: true, ready: true });
  api.voices.mockResolvedValue([{ id: "f1", name: "여성 1" }]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("기본은 텍스트만: 복사 버튼만 있고 재생 버튼은 없으며 음성 서버도 묻지 않는다", () => {
  show(view());
  expect(screen.getByRole("button", { name: "응답 복사" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /음성/ })).toBeNull();
  expect(api.status).not.toHaveBeenCalled();
});

it("설정에서 음성 출력을 켜면 복사 버튼 옆에 재생 버튼이 생긴다", async () => {
  setTtsPrefs({ voiceOutput: true });
  show(view());
  const play = await screen.findByRole("button", { name: "응답 음성으로 듣기" });
  const copy = screen.getByRole("button", { name: "응답 복사" });
  expect(play.parentElement).toBe(copy.parentElement);
});

it("켰어도 응답이 아직 스트리밍 중이면 재생 버튼이 없다", async () => {
  setTtsPrefs({ voiceOutput: true });
  show(view({ state: "running", status: "running" }));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByRole("button", { name: /음성/ })).toBeNull();
});

it("켰어도 서버에 TTS 가 없으면 복사 버튼만 남고 깨지지 않는다", async () => {
  setTtsPrefs({ voiceOutput: true });
  const { ApiError } = await import("../../api/client");
  api.status.mockRejectedValue(new ApiError(404, { code: "not_found", message: "Not Found" }));
  show(view());
  await waitFor(() => expect(api.status).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.getByRole("button", { name: "응답 복사" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /음성/ })).toBeNull();
});
