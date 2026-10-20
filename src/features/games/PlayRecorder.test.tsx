import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GamePlay } from "../../api/gameTypes";
import { PlayRecorderPanel } from "./PlayRecorder";
import { GamePlayer } from "./GamePlayer";

const play = { url: "https://games.example/p/t#ttk-parent=x", origin: "https://games.example", sandbox: "allow-scripts", build_id: "b1", build_seq: 1, bundle_sha256: "abc" } as unknown as GamePlay;
const JPEG = "data:image/jpeg;base64," + btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9));

beforeEach(() => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:frame"), revokeObjectURL: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** iframe 의 contentWindow 로 오는 메시지를 흉내 낸다. 게임 쪽(bridge)이 하는 일을 테스트가 대신한다. */
function mountPlayer(frames: number, { reason = "stopped", stepMs = 250 }: { reason?: string; stepMs?: number } = {}) {
  const view = render(<GamePlayer play={play} loading={false} error={null} onRestart={() => undefined} onCaptured={() => undefined} buildTitle="v1" />);
  const frame = view.container.querySelector("iframe") as HTMLIFrameElement;
  const win = frame.contentWindow as Window;
  const sent: Array<{ type: string; id: string }> = [];
  vi.spyOn(win, "postMessage").mockImplementation(((m: { type: string; id: string }) => {
    sent.push(m);
    const reply = (data: Record<string, unknown>) =>
      queueMicrotask(() => window.dispatchEvent(Object.assign(new Event("message"), { origin: "null", source: win, data: { id: m.id, ...data } })));
    if (m.type === "ttakkari:record-start") reply({ type: "ttakkari:record:started", supported: true, active: true });
    if (m.type === "ttakkari:record-stop") {
      reply({
        type: "ttakkari:record:result", supported: true, width: 390, height: 844, fps: 4, durationMs: frames * stepMs, reason,
        frames: Array.from({ length: frames }, (_, i) => ({ tMs: i * stepMs, dataUrl: JPEG })),
      });
    }
  }) as typeof win.postMessage);
  return { sent };
}

async function recordThenReview(frames: number, opts?: { reason?: string; stepMs?: number }) {
  const { sent } = mountPlayer(frames, opts);
  fireEvent.click(screen.getByRole("button", { name: "플레이 녹화" }));
  fireEvent.click(await screen.findByRole("button", { name: /녹화 시작/ }));
  fireEvent.click(await screen.findByRole("button", { name: /녹화 끝내기/ }));
  await screen.findByLabelText("구간 시작");
  return { sent };
}

describe("플레이 녹화 패널", () => {
  it("녹화 시작·끝내기 요청을 게임에 보내고 구간 선택 화면을 보인다. 서버로는 아무것도 보내지 않는다", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { sent } = await recordThenReview(12);
    expect(sent.map((m) => m.type)).toEqual(["ttakkari:record-start", "ttakkari:record-stop"]);
    expect(screen.getByText(/아직 이 기기에만 있어요/)).toBeTruthy();
    expect(screen.getByText(/선택한 구간 2\.8초 · 대표 화면 8장/)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(8); // 대표 프레임 최대 8장
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("구간을 좁히면 선택한 구간의 대표 화면만 남고, 시작이 끝을 넘으면 끝이 따라온다", async () => {
    await recordThenReview(12);
    const start = screen.getByLabelText("구간 시작") as HTMLInputElement;
    const end = screen.getByLabelText("구간 끝") as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2" } });
    fireEvent.change(end, { target: { value: "4" } });
    expect(screen.getByText(/선택한 구간 0\.5초 · 대표 화면 3장/)).toBeTruthy();
    fireEvent.change(start, { target: { value: "9" } });
    expect(Number((screen.getByLabelText("구간 끝") as HTMLInputElement).value)).toBe(9);
    expect(screen.getByText("시작과 끝을 다르게 골라 주세요.")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("15초를 넘는 구간은 막고 이유를 보인다", async () => {
    await recordThenReview(40, { stepMs: 500 }); // 0 ~ 19.5초
    expect((screen.getByRole("alert")).textContent).toContain("구간이 너무 길어요(19.5초). 최대 15초까지");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("구간 끝"), { target: { value: "30" } }); // 15.0초
    expect(screen.getByText(/선택한 구간 15\.0초/)).toBeTruthy();
  });

  it("게임이 한도로 멈췄으면 사유를 알려 준다", async () => {
    await recordThenReview(6, { reason: "limit_duration" });
    expect(screen.getByText("녹화가 최대 시간(30초)에서 멈췄어요.")).toBeTruthy();
  });

  it("버리면 처음 상태로 돌아가고 프레임은 사라진다", async () => {
    await recordThenReview(6);
    fireEvent.click(screen.getByRole("button", { name: "버리기" }));
    expect(await screen.findByRole("button", { name: /녹화 시작/ })).toBeTruthy();
    expect(screen.queryByLabelText("구간 시작")).toBeNull();
  });

  it("녹화된 화면이 없으면 오류로 안내한다", async () => {
    mountPlayer(0);
    fireEvent.click(screen.getByRole("button", { name: "플레이 녹화" }));
    fireEvent.click(await screen.findByRole("button", { name: /녹화 시작/ }));
    fireEvent.click(await screen.findByRole("button", { name: /녹화 끝내기/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("녹화된 화면이 없어요");
  });

  it("이전 템플릿 빌드(응답 없음)는 지원하지 않는다고 안내한다", async () => {
    vi.useFakeTimers();
    const view = render(<GamePlayer play={play} loading={false} error={null} onRestart={() => undefined} onCaptured={() => undefined} buildTitle="v1" />);
    expect(view.container.querySelector("iframe")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "플레이 녹화" }));
    fireEvent.click(screen.getByRole("button", { name: /녹화 시작/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("alert").textContent).toContain("녹화를 지원하지 않아요");
  });
});

it("대표 화면을 제외하고 명시적으로 담을 때만 선택 결과를 넘긴다", () => {
  const onUse = vi.fn();
  const recorder = { state: { status: "review" as const, recording: { frames: [0, 500, 1000].map(tMs => ({ tMs, dataUrl: JPEG })), width: 390, height: 844, fps: 2, durationMs: 1000, reason: "stopped" as const } }, start: vi.fn(), stop: vi.fn(), reset: vi.fn() };
  render(<PlayRecorderPanel recorder={recorder} onUse={onUse} />);
  expect(onUse).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("0.5초 화면 포함"));
  fireEvent.click(screen.getByRole("button", { name: "이 구간을 수정 요청에 담기" }));
  expect(onUse).toHaveBeenCalledWith({ startMs: 0, endMs: 1000, frames: [{ tMs: 0, dataUrl: JPEG }, { tMs: 1000, dataUrl: JPEG }] });
});
