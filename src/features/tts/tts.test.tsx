import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { TTS_AVAILABILITY_KEY, probeTts } from "./useTtsAvailability";
import { SpeakButton } from "./SpeakButton";
import { TtsSection } from "./TtsSection";
import { TTS_PREFS_KEY, resetTtsPrefsCache, setTtsPrefs } from "./ttsPrefs";
import { ttsPlayer } from "./ttsPlayer";

const api = vi.hoisted(() => ({ status: vi.fn(), voices: vi.fn(), speak: vi.fn(), createJob: vi.fn(), getJob: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getTtsStatus: api.status,
  listTtsVoices: api.voices,
  speakTts: api.speak,
  createTtsJob: api.createJob,
  getTtsJob: api.getJob,
}));
import { ApiError } from "../../api/client";

const VOICES = [{ id: "f1", name: "여성 1", lang: "ko", gender: "female" }, { id: "m1", name: "남성 1", lang: "ko", gender: "male" }];
const READY = { enabled: true, ready: true, reason: null, engine: "supertonic-3", model: "supertonic-3", voice_count: 2 };
const missing = () => new ApiError(404, { code: "not_found", message: "Not Found" });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  resetTtsPrefsCache();
  api.status.mockResolvedValue(READY);
  api.voices.mockResolvedValue(VOICES);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  ttsPlayer.stop();
});

describe("probeTts: 백엔드가 아직 없을 때", () => {
  it("상태 엔드포인트가 404 면 준비 전(unavailable)", async () => {
    api.status.mockRejectedValue(missing());
    await expect(probeTts()).resolves.toEqual({ state: "unavailable", reason: "not_deployed" });
    expect(api.voices).not.toHaveBeenCalled();
  });
  it("음성 목록 엔드포인트가 404 여도 준비 전(unavailable)", async () => {
    api.voices.mockRejectedValue(missing());
    await expect(probeTts()).resolves.toEqual({ state: "unavailable", reason: "not_deployed" });
  });
  it("405·501 도 기능이 없는 것으로 읽는다", async () => {
    api.status.mockRejectedValue(new ApiError(405, { code: "http_405", message: "x" }));
    expect((await probeTts()).state).toBe("unavailable");
    api.status.mockRejectedValue(new ApiError(501, { code: "http_501", message: "x" }));
    expect((await probeTts()).state).toBe("unavailable");
  });
  it("서버에서 꺼져 있으면 unavailable(disabled)", async () => {
    api.status.mockResolvedValue({ ...READY, enabled: false });
    await expect(probeTts()).resolves.toEqual({ state: "unavailable", reason: "disabled" });
  });
  it("엔진이 준비되지 않았거나 음성이 0개면 preparing", async () => {
    api.status.mockResolvedValue({ ...READY, ready: false, reason: "model_missing" });
    expect(await probeTts()).toMatchObject({ state: "preparing", reason: "model_missing" });
    api.status.mockResolvedValue(READY);
    api.voices.mockResolvedValue([]);
    expect((await probeTts()).state).toBe("preparing");
  });
  it("준비되면 음성 목록과 함께 ready", async () => {
    expect(await probeTts()).toMatchObject({ state: "ready", voices: VOICES });
  });
  it("404 가 아닌 오류(500·네트워크)는 숨김이 아니라 오류로 던진다", async () => {
    api.status.mockRejectedValue(new ApiError(500, { code: "internal", message: "boom" }));
    await expect(probeTts()).rejects.toThrow("boom");
    api.status.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(probeTts()).rejects.toThrow();
  });
});

describe("채팅 재생 버튼(SpeakButton)", () => {
  it("기본값(음성 출력 꺼짐)에서는 버튼도 서버 확인도 없다", () => {
    wrap(<SpeakButton ownerId="r1" text="안녕하세요" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(api.status).not.toHaveBeenCalled();
  });

  it("켰어도 서버에 TTS 가 없으면(404) 버튼이 숨는다", async () => {
    setTtsPrefs({ voiceOutput: true });
    api.status.mockRejectedValue(missing());
    wrap(<SpeakButton ownerId="r1" text="안녕하세요" />);
    await waitFor(() => expect(api.status).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("켰고 준비됐을 때만 재생 버튼이 보인다", async () => {
    setTtsPrefs({ voiceOutput: true });
    wrap(<SpeakButton ownerId="r1" text="안녕하세요" />);
    expect(await screen.findByRole("button", { name: "응답 음성으로 듣기" })).toBeTruthy();
  });

  it("준비 중(preparing)이면 숨긴다", async () => {
    setTtsPrefs({ voiceOutput: true });
    api.status.mockResolvedValue({ ...READY, ready: false, reason: "loading" });
    wrap(<SpeakButton ownerId="r1" text="안녕하세요" />);
    await waitFor(() => expect(api.voices).toHaveBeenCalled());
    await act(async () => undefined);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("클릭하면 비동기 작업 전에 unlock 을 부르고, 설정의 음성·속도로 /speak 를 요청한다", async () => {
    setTtsPrefs({ voiceOutput: true, voice: "m1", speed: 1.2 });
    const order: string[] = [];
    vi.spyOn(ttsPlayer, "unlock").mockImplementation(() => void order.push("unlock"));
    const play = vi.spyOn(ttsPlayer, "play").mockImplementation(async () => void order.push("play"));
    api.speak.mockResolvedValue(new Blob(["x"], { type: "audio/wav" }));
    wrap(<SpeakButton ownerId="r1" text={"안녕하세요."} />);
    fireEvent.click(await screen.findByRole("button", { name: "응답 음성으로 듣기" }));
    expect(order).toEqual(["unlock", "play"]);
    const req = play.mock.calls[0][0];
    expect(req.ownerId).toBe("r1");
    const sources = await req.prepare(new AbortController().signal);
    expect(sources).toHaveLength(1);
    expect(api.speak).toHaveBeenCalledWith({ text: "안녕하세요.", voice: "m1", speed: 1.2 }, expect.any(AbortSignal));
  });

  it("목록에 없는 저장 음성은 요청에서 빠져 서버 기본 음성이 쓰인다", async () => {
    setTtsPrefs({ voiceOutput: true, voice: "gone" });
    vi.spyOn(ttsPlayer, "unlock").mockImplementation(() => undefined);
    const play = vi.spyOn(ttsPlayer, "play").mockResolvedValue(undefined);
    api.speak.mockResolvedValue(new Blob(["x"]));
    wrap(<SpeakButton ownerId="r1" text="가나다" />);
    fireEvent.click(await screen.findByRole("button", { name: "응답 음성으로 듣기" }));
    await play.mock.calls[0][0].prepare(new AbortController().signal);
    expect(api.speak.mock.calls[0][0]).toEqual({ text: "가나다", voice: undefined, speed: 1 });
  });

  it("500자를 넘는 답은 /speak 가 아니라 job 으로 만들어 문장별 소리를 이어 붙인다", async () => {
    setTtsPrefs({ voiceOutput: true });
    vi.spyOn(ttsPlayer, "unlock").mockImplementation(() => undefined);
    const play = vi.spyOn(ttsPlayer, "play").mockResolvedValue(undefined);
    api.createJob.mockResolvedValue({ job_id: "j1", chunks: 2, cached_chunks: 0 });
    api.getJob.mockResolvedValue({ status: "succeeded", chunks: [{ index: 1, audio_url: "/api/tts/a/2" }, { index: 0, audio_url: "/api/tts/a/1" }] });
    wrap(<SpeakButton ownerId="r1" text={"가".repeat(501)} />);
    fireEvent.click(await screen.findByRole("button", { name: "응답 음성으로 듣기" }));
    const sources = await play.mock.calls[0][0].prepare(new AbortController().signal);
    expect(api.speak).not.toHaveBeenCalled();
    expect(api.createJob).toHaveBeenCalledWith(expect.objectContaining({ text: "가".repeat(501) }), expect.any(AbortSignal));
    expect(sources).toHaveLength(2);
  });

  it("재생 상태에 따라 버튼 이름이 바뀌고 재생 중에는 일시정지를 부른다", async () => {
    setTtsPrefs({ voiceOutput: true });
    const pause = vi.spyOn(ttsPlayer, "pause").mockImplementation(() => undefined);
    const resume = vi.spyOn(ttsPlayer, "resume").mockImplementation(() => undefined);
    const state = vi.spyOn(ttsPlayer, "getState");
    const mine = (phase: "playing" | "paused" | "blocked") => ({ phase, ownerId: "r1", index: 1, total: 3, message: null });

    state.mockReturnValue(mine("playing"));
    wrap(<SpeakButton ownerId="r1" text="가나다" />);
    fireEvent.click(await screen.findByRole("button", { name: "응답 음성 일시정지" }));
    expect(pause).toHaveBeenCalledTimes(1);
    cleanup();

    state.mockReturnValue(mine("paused"));
    wrap(<SpeakButton ownerId="r1" text="가나다" />);
    fireEvent.click(await screen.findByRole("button", { name: "응답 음성 이어서 듣기" }));
    expect(resume).toHaveBeenCalledTimes(1);
    cleanup();

    // 자동 재생이 막히면 다음 문장을 한 번 눌러 이어 듣는 복구 버튼이 뜬다.
    state.mockReturnValue(mine("blocked"));
    wrap(<SpeakButton ownerId="r1" text="가나다" />);
    fireEvent.click(await screen.findByRole("button", { name: "다음 문장 듣기 (터치)" }));
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("다른 메시지가 소리를 쥐고 있으면 이 버튼은 idle 로 보인다", async () => {
    setTtsPrefs({ voiceOutput: true });
    vi.spyOn(ttsPlayer, "getState").mockReturnValue({ phase: "playing", ownerId: "other", index: 0, total: 1, message: null });
    wrap(<SpeakButton ownerId="r1" text="가나다" />);
    expect(await screen.findByRole("button", { name: "응답 음성으로 듣기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "응답 음성 중지" })).toBeNull();
  });
});

describe("설정의 음성 출력 토글(TtsSection)", () => {
  const toggle = () => screen.findByRole("switch", { name: "채팅 응답 음성 재생" }) as Promise<HTMLInputElement>;

  it("기본은 꺼져 있고, 준비되면 켤 수 있으며 이 기기에 저장된다", async () => {
    wrap(<TtsSection />);
    const t = await toggle();
    await waitFor(() => expect(t.disabled).toBe(false));
    expect(t.checked).toBe(false);
    expect(localStorage.getItem(TTS_PREFS_KEY)).toBeNull();
    fireEvent.click(t);
    expect(t.checked).toBe(true);
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY) ?? "{}")).toMatchObject({ voiceOutput: true });
    fireEvent.click(t);
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY) ?? "{}")).toMatchObject({ voiceOutput: false });
  });

  it("서버에 TTS 가 없으면(404) 켤 수 없고 '준비 중'으로 보인다", async () => {
    api.status.mockRejectedValue(missing());
    wrap(<TtsSection />);
    const t = await toggle();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("준비 중"));
    // 브라우저는 disabled 컨트롤에 click 을 보내지 않는다(jsdom 의 합성 click 은 그렇지 않아 클릭 대신 속성을 본다).
    expect(t.disabled).toBe(true);
    expect(t.checked).toBe(false);
    expect(localStorage.getItem(TTS_PREFS_KEY)).toBeNull();
    expect(screen.queryByText("음성")).toBeNull();
  });

  it("이미 켜 둔 상태에서 서버가 준비 중이 되어도 끌 수는 있다", async () => {
    setTtsPrefs({ voiceOutput: true });
    api.status.mockRejectedValue(missing());
    wrap(<TtsSection />);
    const t = await toggle();
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("준비 중"));
    expect(t.disabled).toBe(false);
    fireEvent.click(t);
    expect(t.checked).toBe(false);
  });

  it("음성과 속도 선택이 저장되고 TTS 페이지와 같은 저장값을 쓴다", async () => {
    wrap(<TtsSection />);
    await waitFor(async () => expect((await toggle()).disabled).toBe(false));
    fireEvent.click(screen.getByRole("radio", { name: "1.2배" }));
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY) ?? "{}")).toMatchObject({ speed: 1.2 });
  });

  it("준비 전에도 다시 확인 버튼으로 재조회한다", async () => {
    api.status.mockRejectedValue(missing());
    wrap(<TtsSection />);
    await screen.findByRole("button", { name: "다시 확인" });
    api.status.mockResolvedValue(READY);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    await waitFor(async () => expect((await toggle()).disabled).toBe(false));
  });
});

it("availability 쿼리 키는 한 곳(TTS_AVAILABILITY_KEY)에서만 정해진다", () => {
  expect(TTS_AVAILABILITY_KEY).toEqual(["tts", "availability"]);
});
