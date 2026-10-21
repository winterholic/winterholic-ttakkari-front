import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { TtsPage } from "./TtsPage";
import { pollTiming } from "../features/tts/ttsJob";
import { TTS_PREFS_KEY, resetTtsPrefsCache, setTtsPrefs } from "../features/tts/ttsPrefs";
import { RECENT_KEY, resetRecentCache } from "../features/tts/ttsRecent";
import { ttsPlayer } from "../features/tts/ttsPlayer";

const api = vi.hoisted(() => ({
  status: vi.fn(), voices: vi.fn(), createJob: vi.fn(), getJob: vi.fn(), cancelJob: vi.fn(), fetchAudio: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getTtsStatus: api.status,
  listTtsVoices: api.voices,
  createTtsJob: api.createJob,
  getTtsJob: api.getJob,
  cancelTtsJob: api.cancelJob,
  fetchTtsAudio: api.fetchAudio,
}));
import { ApiError } from "../api/client";

/**
 * 실제 플레이어가 쓰는 엘리먼트 대역. jsdom 의 HTMLMediaElement 는 재생을 구현하지 않는다.
 * 플레이어 싱글턴은 첫 엘리먼트를 계속 쓰므로 인스턴스는 테스트마다 새로 생기지 않는다. 상태는 reset() 으로 비운다.
 */
class FakeAudio {
  static instance: FakeAudio | null = null;
  static plays: ("ok" | "blocked")[] = [];
  static playCount = 0;
  static reset() {
    FakeAudio.plays = [];
    FakeAudio.playCount = 0;
    if (FakeAudio.instance) FakeAudio.instance.ended = false;
  }
  src = "";
  ended = false;
  handlers = new Map<string, (() => void)[]>();
  constructor() {
    FakeAudio.instance = this;
  }
  play() {
    FakeAudio.playCount += 1;
    this.ended = false;
    return FakeAudio.plays.shift() === "blocked" ? Promise.reject(new DOMException("x", "NotAllowedError")) : Promise.resolve();
  }
  pause() {}
  addEventListener(t: string, f: () => void) {
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), f]);
  }
  emit(t: string) {
    if (t === "ended") this.ended = true;
    this.handlers.get(t)?.forEach((f) => f());
  }
}

const VOICES = [{ id: "f1", name: "여성 1", lang: ["ko"], gender: "female" }, { id: "m1", name: "남성 1", lang: ["ko"], gender: "male" }];
const READY = { enabled: true, ready: true, engine: "supertonic-3", voice_count: 2 };
const missing = () => new ApiError(404, { code: "not_found", message: "Not Found" });
const done = (over = {}) => ({
  status: "succeeded",
  progress: { done: 2, total: 2 },
  chunks: [{ index: 0, audio_url: "/api/tts/a/0" }, { index: 1, audio_url: "/api/tts/a/1" }],
  audio_full_url: "/api/tts/a/full",
  ...over,
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><TtsPage /></MemoryRouter></QueryClientProvider>);
}
const textbox = () => screen.findByRole("textbox", { name: "읽을 글" }) as Promise<HTMLTextAreaElement>;
async function type(text: string) {
  fireEvent.change(await textbox(), { target: { value: text } });
}
const make = () => fireEvent.click(screen.getByRole("button", { name: "음성 만들기" }));

beforeEach(() => {
  localStorage.clear();
  resetTtsPrefsCache();
  resetRecentCache();
  pollTiming.ms = 5;
  FakeAudio.reset();
  vi.stubGlobal("Audio", FakeAudio);
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  api.status.mockResolvedValue(READY);
  api.voices.mockResolvedValue(VOICES);
  api.fetchAudio.mockImplementation(async () => new Blob(["x"], { type: "audio/wav" }));
  api.cancelJob.mockResolvedValue({ status: "cancelled" });
});
afterEach(() => {
  ttsPlayer.stop();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  pollTiming.ms = 1000;
});

describe("서버에 TTS 가 아직 없을 때", () => {
  it("404 면 입력 칸 없이 '준비 중' 안내만 보이고, 서버가 올라오면 다시 확인으로 열린다", async () => {
    api.status.mockRejectedValue(missing());
    show();
    expect(await screen.findByText("음성 기능을 준비하고 있어요")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "음성 만들기" })).toBeNull();
    api.status.mockResolvedValue(READY);
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await textbox()).toBeTruthy();
  });

  it("음성 목록만 404 여도 같은 안내다", async () => {
    api.voices.mockRejectedValue(missing());
    show();
    expect(await screen.findByText("음성 기능을 준비하고 있어요")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("엔진이 준비 중이면 이유를 알려 준다", async () => {
    api.status.mockResolvedValue({ ...READY, ready: false, reason: "model_missing" });
    show();
    expect(await screen.findByText("음성 모델이 아직 준비되지 않았어요.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("서버 오류(500)는 숨기지 않고 다시 시도 가능한 오류로 보인다", async () => {
    api.status.mockRejectedValue(new ApiError(500, { code: "internal", message: "서버 오류" }));
    show();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 시도/ })).toBeTruthy();
  });
});

describe("생성 흐름", () => {
  it("글자 수 한도를 보이고 빈 글은 요청하지 않는다", async () => {
    show();
    const box = await textbox();
    expect(box.maxLength).toBe(5000);
    expect(screen.getByText("0 / 5,000자")).toBeTruthy();
    make();
    expect(api.createJob).not.toHaveBeenCalled();
    await type("  ");
    make();
    expect(api.createJob).not.toHaveBeenCalled();
  });

  it("눌렀을 때 먼저 unlock 하고, 설정의 음성·속도로 요청하며, 끝나면 자동 재생하고 최근 생성에 남긴다", async () => {
    setTtsPrefs({ voice: "m1", speed: 1.2 });
    const order: string[] = [];
    const unlock = vi.spyOn(ttsPlayer, "unlock").mockImplementation(() => void order.push("unlock"));
    api.createJob.mockImplementation(async () => (order.push("create"), { job_id: "j1", chunks: 2, cached_chunks: 0 }));
    api.getJob.mockResolvedValueOnce({ status: "running", progress: { done: 1, total: 2 } }).mockResolvedValue(done());
    show();
    await type("첫 문장입니다. 둘째 문장입니다.");
    make();
    expect(order).toEqual(["unlock", "create"]);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(api.createJob).toHaveBeenCalledWith({ text: "첫 문장입니다. 둘째 문장입니다.", voice: "m1", speed: 1.2 });
    expect(await screen.findByRole("progressbar", { name: "음성 생성 진행" })).toBeTruthy();
    // 재생은 실제 플레이어가 하고, 두 문장을 같은 엘리먼트로 이어 붙인다.
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    await waitFor(() => expect(FakeAudio.playCount).toBeGreaterThan(0));
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")[0]).toMatchObject({ jobId: "j1", voice: "m1", speed: 1.2, chunks: 2 });
    expect(screen.getByRole("list", { name: "최근 생성 목록" })).toBeTruthy();
  });

  it("전부 캐시에 있으면 진행 대기 없이 바로 끝난다", async () => {
    api.createJob.mockResolvedValue({ job_id: "j2", chunks: 2, cached_chunks: 2 });
    api.getJob.mockResolvedValue(done());
    show();
    await type("캐시된 글");
    make();
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(api.getJob).toHaveBeenCalledTimes(1);
  });

  it("진행 중에는 입력이 잠기고 취소하면 서버 job 도 취소한다", async () => {
    api.createJob.mockResolvedValue({ job_id: "j3", chunks: 4, cached_chunks: 1 });
    api.getJob.mockResolvedValue({ status: "running", progress: { done: 2, total: 4 } });
    show();
    await type("오래 걸리는 글");
    make();
    await screen.findByRole("progressbar", { name: "음성 생성 진행" });
    expect((await textbox()).disabled).toBe(true);
    expect(screen.getByText(/문장 2 \/ 4 만드는 중/).textContent).toContain("캐시 1문장");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(api.cancelJob).toHaveBeenCalledWith("j3"));
    expect(await screen.findByText(/취소했어요/)).toBeTruthy();
    expect((await textbox()).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
    const calls = api.getJob.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(api.getJob.mock.calls.length).toBe(calls);
  });

  it("retryable 실패는 '다시 요청'으로 같은 글을 다시 보낸다", async () => {
    api.createJob.mockResolvedValue({ job_id: "j4", chunks: 1, cached_chunks: 0 });
    api.getJob.mockResolvedValueOnce({ status: "failed", error_code: "owner_gone", retryable: true }).mockResolvedValue(done());
    show();
    await type("다시 요청할 글");
    make();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("작업을 맡은 서버 프로세스가 사라졌어요.");
    expect(alert.textContent).toContain("owner_gone");
    fireEvent.click(within(alert).getByRole("button", { name: /다시 요청/ }));
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(api.createJob).toHaveBeenCalledTimes(2);
    expect(api.createJob.mock.calls[1][0].text).toBe("다시 요청할 글");
  });

  it("retryable 이 아닌 실패(worker_failed)에는 다시 요청 버튼이 없다", async () => {
    api.createJob.mockResolvedValue({ job_id: "j5", chunks: 1, cached_chunks: 0 });
    api.getJob.mockResolvedValue({ status: "failed", error_code: "worker_failed", retryable: false });
    show();
    await type("글");
    make();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("worker_failed");
    expect(within(alert).queryByRole("button", { name: /다시 요청/ })).toBeNull();
  });

  it("서버가 retryable 값을 안 주면 코드로 추정한다(worker_timeout 은 재시도 가능)", async () => {
    api.createJob.mockResolvedValue({ job_id: "j6", chunks: 1, cached_chunks: 0 });
    api.getJob.mockResolvedValue({ status: "failed", error_code: "worker_timeout" });
    show();
    await type("글");
    make();
    expect(within(await screen.findByRole("alert")).getByRole("button", { name: /다시 요청/ })).toBeTruthy();
  });

  it("배포 중(503)으로 접수가 거절되면 안내하고 다시 요청할 수 있다", async () => {
    api.createJob.mockRejectedValueOnce(new ApiError(503, { code: "generation_not_active", message: "x" }, 5));
    api.createJob.mockResolvedValue({ job_id: "j7", chunks: 1, cached_chunks: 1 });
    api.getJob.mockResolvedValue(done());
    show();
    await type("글");
    make();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("서버가 새 버전으로 바뀌는 중이에요.");
    fireEvent.click(within(alert).getByRole("button", { name: /다시 요청/ }));
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
  });

  it("입력이 잘못돼 거절되면(422) 재요청 버튼 없이 서버 메시지를 보인다", async () => {
    api.createJob.mockRejectedValue(new ApiError(422, { code: "text_too_long", message: "글이 너무 길어요" }));
    show();
    await type("글");
    make();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("글이 너무 길어요");
    expect(within(alert).queryByRole("button", { name: /다시 요청/ })).toBeNull();
  });

  it("조회가 연달아 실패하면 연결 끊김으로 보고 재시도를 권한다", async () => {
    api.createJob.mockResolvedValue({ job_id: "j8", chunks: 1, cached_chunks: 0 });
    api.getJob.mockRejectedValue(new TypeError("Failed to fetch"));
    show();
    await type("글");
    make();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("서버와 연결하지 못했어요.");
    expect(within(alert).getByRole("button", { name: /다시 요청/ })).toBeTruthy();
    expect(api.getJob.mock.calls.length).toBe(4);
  });
});

describe("재생 제어", () => {
  async function generated() {
    api.createJob.mockResolvedValue({ job_id: "jp", chunks: 2, cached_chunks: 2 });
    api.getJob.mockResolvedValue(done());
    show();
    await type("두 문장입니다. 끝입니다.");
    make();
    await screen.findByRole("button", { name: "일시정지" });
  }

  it("일시정지·이어서 듣기·중지", async () => {
    await generated();
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    fireEvent.click(await screen.findByRole("button", { name: "이어서 듣기" }));
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "중지" }));
    expect(await screen.findByRole("button", { name: "처음부터 듣기" })).toBeTruthy();
  });

  it("문장이 끝나면 같은 엘리먼트로 다음 문장을 이어 재생하고 위치를 보인다", async () => {
    await generated();
    expect(screen.getByRole("progressbar", { name: "재생 위치" }).getAttribute("aria-valuenow")).toBe("1");
    FakeAudio.instance?.emit("ended");
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "재생 위치" }).getAttribute("aria-valuenow")).toBe("2"));
    expect(screen.getByText("문장 2 / 2")).toBeTruthy();
  });

  it("다음 문장의 자동 재생이 막히면 '다음 문장 듣기' 버튼으로 한 번에 이어 간다", async () => {
    await generated();
    FakeAudio.plays = ["blocked"];
    FakeAudio.instance?.emit("ended");
    const retap = await screen.findByRole("button", { name: "다음 문장 듣기 (터치)" });
    expect(screen.getByText(/한 번 누르면 이어서 들려요/)).toBeTruthy();
    fireEvent.click(retap);
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(screen.getByText("문장 2 / 2")).toBeTruthy();
  });

  it("문장 소리를 받지 못하면 오류와 '다시 듣기'를 보인다", async () => {
    api.createJob.mockResolvedValue({ job_id: "je", chunks: 1, cached_chunks: 1 });
    api.getJob.mockResolvedValue(done({ chunks: [{ index: 0, audio_url: "/api/tts/a/0" }] }));
    api.fetchAudio.mockRejectedValue(new Error("캐시가 지워졌어요"));
    show();
    await type("글");
    make();
    expect((await screen.findAllByText("캐시가 지워졌어요")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "다시 듣기" })).toBeTruthy();
  });

  it("다운로드는 전체 파일을 인증 요청으로 받아 저장한다", async () => {
    await generated();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(api.fetchAudio).toHaveBeenCalledWith("/api/tts/a/full");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("전체 파일 주소가 없으면 다운로드만 막고 재생은 된다", async () => {
    api.createJob.mockResolvedValue({ job_id: "jn", chunks: 2, cached_chunks: 2 });
    api.getJob.mockResolvedValue(done({ audio_full_url: null }));
    show();
    await type("글");
    make();
    await screen.findByRole("button", { name: "일시정지" });
    expect((screen.getByRole("button", { name: "다운로드" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("화면을 떠나면 이 화면이 쥔 소리를 멈춘다", async () => {
    await generated();
    cleanup();
    expect(ttsPlayer.getState().phase).toBe("idle");
  });
});

describe("최근 생성", () => {
  const entry = { jobId: "old1", text: "어제 만든 글입니다", voice: "f1", speed: 1, chunks: 3, createdAt: "2026-10-20T01:00:00Z" };
  beforeEach(() => localStorage.setItem(RECENT_KEY, JSON.stringify([entry])));

  it("서버 캐시에 job 이 남아 있으면 새로 만들지 않고 바로 재생한다", async () => {
    api.getJob.mockResolvedValue(done());
    show();
    fireEvent.click(await screen.findByRole("button", { name: /다시 듣기/ }));
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(api.getJob).toHaveBeenCalledWith("old1", expect.any(AbortSignal));
    expect(api.createJob).not.toHaveBeenCalled();
    expect((await textbox()).value).toBe("어제 만든 글입니다");
  });

  it("job 이 사라졌으면(404) 저장해 둔 글로 다시 요청한다(대개 캐시 히트)", async () => {
    api.getJob.mockRejectedValueOnce(missing()).mockResolvedValue(done());
    api.createJob.mockResolvedValue({ job_id: "new1", chunks: 3, cached_chunks: 3 });
    show();
    fireEvent.click(await screen.findByRole("button", { name: /다시 듣기/ }));
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();
    expect(api.createJob).toHaveBeenCalledWith({ text: "어제 만든 글입니다", voice: "f1", speed: 1 });
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].jobId).toBe("new1");
  });

  it("항목을 지우거나 모두 지울 수 있다", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /목록에서 지우기/ }));
    expect(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")).toEqual([]);
    expect(await screen.findByText(/만든 음성이 여기에 남아요/)).toBeTruthy();
  });

  it("최근 항목의 음성·속도를 설정으로 되돌려 공유 설정과 맞춘다", async () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ ...entry, voice: "m1", speed: 1.5 }]));
    api.getJob.mockResolvedValue(done());
    show();
    fireEvent.click(await screen.findByRole("button", { name: /다시 듣기/ }));
    await screen.findByRole("button", { name: "일시정지" });
    expect(JSON.parse(localStorage.getItem(TTS_PREFS_KEY) ?? "{}")).toMatchObject({ voice: "m1", speed: 1.5 });
  });
});

describe("경합 상태(Race Conditions) 및 late acceptance 취소 검증", () => {
  it("생성 제출 중 cancel() 호출 시 늦게 도착한 job_id 를 즉시 취소하고 UI 덮어쓰기를 막는다", async () => {
    let resolveCreate: (val: unknown) => void = () => undefined;
    api.createJob.mockReturnValue(new Promise((res) => { resolveCreate = res; }));
    show();
    await type("지연 테스트 문장");
    make();

    // submitting 상태 확인
    expect(await screen.findByText("요청을 보내는 중이에요.")).toBeTruthy();

    // 응답 오기 전 취소 버튼 클릭
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(await screen.findByText("취소했어요. 같은 글로 다시 만들 수 있어요.")).toBeTruthy();

    // 이후 백엔드가 202 로 늦게 job 을 수락
    resolveCreate({ job_id: "late-accepted-job-1", chunks: 2, cached_chunks: 0 });

    // 취소된 늦은 응답이 cancelTtsJob 을 즉시 호출해야 함
    await waitFor(() => {
      expect(api.cancelJob).toHaveBeenCalledWith("late-accepted-job-1");
    });

    // UI 상태가 cancelled 로 유지되어야 함 (succeeded 나 running 으로 바뀌지 않음)
    expect(screen.getByText("취소했어요. 같은 글로 다시 만들 수 있어요.")).toBeTruthy();
    expect(screen.queryByText("요청을 보내는 중이에요.")).toBeNull();
  });

  it("생성 제출 중 새 요청으로 교체될 때 이전 요청의 늦은 응답만 취소하고 새 job 은 방해하지 않는다", async () => {
    let resolveCreate1: (val: unknown) => void = () => undefined;
    api.createJob.mockReturnValueOnce(new Promise((res) => { resolveCreate1 = res; }));
    api.createJob.mockResolvedValueOnce({ job_id: "job-2-success", chunks: 1, cached_chunks: 1 });
    api.getJob.mockResolvedValue(done({ chunks: [{ index: 0, audio_url: "/api/tts/a/0" }] }));

    show();
    await type("첫 번째 요청");
    make();
    expect(await screen.findByText("요청을 보내는 중이에요.")).toBeTruthy();

    // 취소 후 바로 두 번째 요청 제출
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await type("두 번째 요청");
    make();

    // 두 번째 요청이 완료되어 재생 화면이 뜸
    expect(await screen.findByRole("button", { name: "일시정지" })).toBeTruthy();

    // 이제 첫 번째 요청의 응답이 늦게 도착!
    resolveCreate1({ job_id: "job-1-late", chunks: 3, cached_chunks: 0 });

    // 첫 번째 지연 job 만 취소되어야 함
    await waitFor(() => {
      expect(api.cancelJob).toHaveBeenCalledWith("job-1-late");
    });
    // 두 번째 job-2 는 취소되지 않음
    expect(api.cancelJob).not.toHaveBeenCalledWith("job-2-success");
    // 재생 화면(두 번째 작업)이 정상 유지됨
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
  });

  it("생성 제출 중 언마운트(페이지 이탈) 시 늦게 도착한 job_id 를 즉시 취소한다", async () => {
    let resolveCreate: (val: unknown) => void = () => undefined;
    api.createJob.mockReturnValue(new Promise((res) => { resolveCreate = res; }));

    const view = show();
    await type("페이지 이탈 테스트");
    make();
    expect(await screen.findByText("요청을 보내는 중이에요.")).toBeTruthy();

    // 화면 언마운트 (페이지 이탈)
    view.unmount();

    // 이후 백엔드가 늦게 job 접수
    resolveCreate({ job_id: "unmounted-late-job", chunks: 1, cached_chunks: 0 });

    await waitFor(() => {
      expect(api.cancelJob).toHaveBeenCalledWith("unmounted-late-job");
    });
  });

  it("서버 status.max_text_chars 동적 한도가 입력 길이 및 카운터에 반영된다", async () => {
    api.status.mockResolvedValue({ ...READY, max_text_chars: 2500 });
    show();

    const area = await textbox();
    expect(area.maxLength).toBe(2500);
    expect(screen.getByText("0 / 2,500자")).toBeTruthy();
  });

  it("status.max_text_chars 가 비정상이면 기본값 5000자로 안전하게 폴백한다", async () => {
    api.status.mockResolvedValue({ ...READY, max_text_chars: -100 });
    show();

    const area = await textbox();
    expect(area.maxLength).toBe(5000);
    expect(screen.getByText("0 / 5,000자")).toBeTruthy();
  });
});
