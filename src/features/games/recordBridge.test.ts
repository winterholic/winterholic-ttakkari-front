import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIP_MAX_FRAMES, CLIP_MAX_MS, RECORD_MAX_BYTES, RECORD_MAX_FRAMES,
  acceptRecordResult, acceptRecordStarted, jpegBlobFromDataUrl, pickSegmentFrames, requestRecordStart, requestRecordStop,
} from "./recordBridge";
import type { RecordFrame } from "./recordBridge";

afterEach(() => vi.useRealTimers());

const frameWindow = {} as Window;
const ctx = { frameWindow, gameOrigin: "https://games.example", expectedId: "abc" };
const ev = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) => ({ origin: "null", source: frameWindow, data, ...over });

// 최소 JPEG: SOI(ff d8) ... EOI(ff d9)
const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9];
const jpegUrl = (bytes: number[] = JPEG_BYTES) => "data:image/jpeg;base64," + btoa(String.fromCharCode(...bytes));
const frames = (n: number, stepMs = 250): RecordFrame[] => Array.from({ length: n }, (_, i) => ({ tMs: i * stepMs, dataUrl: jpegUrl() }));
const result = (over: Record<string, unknown> = {}) => ({
  type: "ttakkari:record:result", id: "abc", supported: true, frames: frames(4), width: 390, height: 844, fps: 4, durationMs: 1000, reason: "stopped", ...over,
});

describe("녹화 응답 검증", () => {
  it("깨진 JPEG는 미리보기 렌더 전에 거부한다", () => {
    expect(acceptRecordResult(ev(result({frames:[{tMs:0,dataUrl:"data:image/jpeg;base64,YmFk"}]})),ctx)).toBeNull();
  });
  it("출처 창·origin·요청 id 가 맞는 응답만 받는다", () => {
    expect(acceptRecordResult(ev(result()), ctx)).toMatchObject({ width: 390, height: 844, fps: 4, reason: "stopped", frames: [{ tMs: 0 }, { tMs: 250 }, { tMs: 500 }, { tMs: 750 }] });
    expect(acceptRecordResult(ev(result(), { origin: "https://games.example" }), ctx)).not.toBeNull();
    expect(acceptRecordResult(ev(result(), { origin: "https://evil.example" }), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result(), { source: {} }), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ id: "other" })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result()), { ...ctx, frameWindow: null })).toBeNull();
    for (const bad of [null, "x", [], { type: "ttakkari:pick:result", id: "abc" }, result({ supported: false })]) expect(acceptRecordResult(ev(bad), ctx)).toBeNull();
  });

  it("규약에 안 맞는 프레임이 하나라도 있으면 응답 전체를 거부한다", () => {
    const f = frames(3);
    expect(acceptRecordResult(ev(result({ frames: [...f.slice(0, 2), { tMs: 600, dataUrl: "data:image/png;base64,AAAA" }] })), ctx)).toBeNull(); // PNG
    expect(acceptRecordResult(ev(result({ frames: [...f.slice(0, 2), { tMs: 600, dataUrl: "javascript:alert(1)" }] })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ frames: [f[1], f[0]] })), ctx)).toBeNull(); // 시각이 거꾸로
    expect(acceptRecordResult(ev(result({ frames: [f[0], { ...f[1], tMs: 0 }] })), ctx)).toBeNull(); // 같은 시각
    expect(acceptRecordResult(ev(result({ frames: [{ ...f[0], tMs: -1 }] })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ frames: [{ ...f[0], tMs: "0" }] })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ frames: "nope" })), ctx)).toBeNull();
  });

  it("프레임 수·바이트·크기·길이·사유의 상한을 다시 검사한다", () => {
    expect(acceptRecordResult(ev(result({ frames: frames(RECORD_MAX_FRAMES) })), ctx)).not.toBeNull();
    expect(acceptRecordResult(ev(result({ frames: frames(RECORD_MAX_FRAMES + 1) })), ctx)).toBeNull();
    const big = { tMs: 0, dataUrl: "data:image/jpeg;base64," + "A".repeat(Math.ceil(((RECORD_MAX_BYTES + 1) * 4) / 3)) };
    expect(acceptRecordResult(ev(result({ frames: [big] })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ width: 5000 })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ width: 0 })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ width: 1.5 })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ durationMs: 60_000 })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ durationMs: -1 })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ reason: "whatever" })), ctx)).toBeNull();
    expect(acceptRecordResult(ev(result({ reason: "limit_bytes" })), ctx)).toMatchObject({ reason: "limit_bytes" }); // 한도로 멈춘 것은 사유와 함께 받는다
    expect(acceptRecordResult(ev(result({ frames: [], width: 0, height: 0, durationMs: 0, reason: "canvas_unavailable" })), ctx)).toMatchObject({ frames: [], reason: "canvas_unavailable" });
  });

  it("시작 응답은 supported·active 가 불리언일 때만 받는다", () => {
    const ok = { type: "ttakkari:record:started", id: "abc", supported: true, active: true };
    expect(acceptRecordStarted(ev(ok), ctx)).toEqual({ supported: true, active: true });
    expect(acceptRecordStarted(ev({ ...ok, active: "yes" }), ctx)).toBeNull();
    expect(acceptRecordStarted(ev(ok, { origin: "https://evil.example" }), ctx)).toBeNull();
    expect(acceptRecordStarted(ev({ ...ok, id: "x" }), ctx)).toBeNull();
  });
});

describe("JPEG 변환", () => {
  it("JPEG 서명이 맞는 바이트만 Blob 으로 만든다", async () => {
    const blob = jpegBlobFromDataUrl(jpegUrl());
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(JPEG_BYTES.length);
    expect(() => jpegBlobFromDataUrl("data:image/png;base64,iVBORw0KGgo=")).toThrow();
    expect(() => jpegBlobFromDataUrl(jpegUrl([0x00, 0x01, 0x02, 0x03, 0x04]))).toThrow(); // 시작 서명이 아님
    expect(() => jpegBlobFromDataUrl(jpegUrl([0xff, 0xd8, 0x00, 0x00]))).toThrow(); // 끝 서명이 아님
  });
});

describe("구간 프레임 고르기", () => {
  const all = frames(40, 250); // 0 ~ 9750ms

  it("구간 안의 프레임만, 최대 8장으로, 첫·끝 프레임을 포함해 균등하게 고른다", () => {
    const got = pickSegmentFrames(all, 2000, 8000);
    expect(got.length).toBe(CLIP_MAX_FRAMES);
    expect(got[0].tMs).toBe(2000);
    expect(got[got.length - 1].tMs).toBe(8000);
    expect(got.every((f) => f.tMs >= 2000 && f.tMs <= 8000)).toBe(true);
    expect(got.map((f) => f.tMs)).toEqual([...got.map((f) => f.tMs)].sort((a, b) => a - b));
  });

  it("프레임이 적으면 구간의 프레임을 모두 돌려준다", () => {
    expect(pickSegmentFrames(all, 1000, 2000).map((f) => f.tMs)).toEqual([1000, 1250, 1500, 1750, 2000]);
    expect(pickSegmentFrames(all, 100, 120)).toEqual([]);
  });

  it("거꾸로 된 구간, 같은 지점, 15초를 넘는 구간, 0장 요청은 거부한다", () => {
    expect(pickSegmentFrames(all, 5000, 2000)).toEqual([]);
    expect(pickSegmentFrames(all, 3000, 3000)).toEqual([]);
    expect(pickSegmentFrames(frames(100, 250), 0, CLIP_MAX_MS + 1)).toEqual([]);
    expect(pickSegmentFrames(frames(100, 250), 0, CLIP_MAX_MS).length).toBeGreaterThan(0);
    expect(pickSegmentFrames(all, 0, 5000, 0)).toEqual([]);
    expect(pickSegmentFrames(all, 0, 5000, 1).length).toBe(1);
  });
});

describe("녹화 요청", () => {
  function fakeFrame() {
    const posted: unknown[] = [];
    const win = new EventTarget() as unknown as Window;
    const frame = { contentWindow: { postMessage: (m: unknown) => posted.push(m) } } as unknown as HTMLIFrameElement;
    const answer = (data: unknown) => {
      const e = Object.assign(new Event("message"), { origin: "null", source: frame.contentWindow, data });
      win.dispatchEvent(e);
    };
    return { frame, win, posted, answer };
  }

  it("시작은 fps 힌트를 보내고 응답을 받는다", async () => {
    const { frame, win, posted, answer } = fakeFrame();
    const p = requestRecordStart(frame, "https://games.example", { win });
    const sent = posted[0] as { type: string; id: string; fps: number };
    expect(sent).toMatchObject({ type: "ttakkari:record-start", fps: 6 });
    answer({ type: "ttakkari:record:started", id: sent.id, supported: true, active: true });
    await expect(p).resolves.toEqual({ supported: true, active: true });
  });

  it("정지는 한 번만 보내고(재전송하면 빈 결과가 올 수 있다) 결과를 받는다", async () => {
    vi.useFakeTimers();
    const { frame, win, posted, answer } = fakeFrame();
    const p = requestRecordStop(frame, "https://games.example", { win });
    await vi.advanceTimersByTimeAsync(5000);
    expect(posted.length).toBe(1);
    const sent = posted[0] as { type: string; id: string };
    expect(sent.type).toBe("ttakkari:record-stop");
    answer({ ...result(), id: sent.id });
    await expect(p).resolves.toMatchObject({ reason: "stopped", frames: expect.any(Array) });
  });

  it("응답이 없으면 사유와 함께 거절한다(이전 템플릿 빌드)", async () => {
    vi.useFakeTimers();
    const { frame, win } = fakeFrame();
    const p = requestRecordStart(frame, "https://games.example", { win, timeoutMs: 1500 });
    const assertion = expect(p).rejects.toThrow("녹화를 지원하지 않아요");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });
});
