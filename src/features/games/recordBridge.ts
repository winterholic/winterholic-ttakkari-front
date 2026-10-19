// 플레이 녹화(back ADR 0060): 게임 bridge 에 record-start/record-stop 을 보내 프레임 시퀀스를 받는다.
// 응답은 게임이 보낸 값이라 신뢰하지 않는다: source·origin·요청 id 를 확인하고 프레임 수·바이트·JPEG 서명을 다시 검사한다.
import { newCaptureId } from "./captureBridge";
import type { CaptureContext } from "./captureBridge";

/** 게임 템플릿의 상한(record.ts RECORD_LIMITS)과 같다. 게임이 지키지만 부모도 다시 검사한다. */
export const RECORD_MAX_FRAMES = 180;
export const RECORD_MAX_BYTES = 6 * 1024 * 1024;
export const RECORD_MAX_MS = 30_000;
/** 수정 요청에 담을 수 있는 구간 프레임 수·구간 길이(back FeedbackIn.clip 의 상한과 같다). */
export const CLIP_MAX_FRAMES = 8;
export const CLIP_MAX_MS = 15_000;

const JPEG_PREFIX = "data:image/jpeg;base64,";
const REASONS = ["stopped", "limit_duration", "limit_bytes", "limit_frames", "canvas_unavailable"] as const;
export type RecordReason = (typeof REASONS)[number];

export interface RecordFrame {
  tMs: number;
  dataUrl: string;
}

export interface Recording {
  frames: RecordFrame[];
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  reason: RecordReason;
}

const decodedBytes = (dataUrl: string) => Math.floor(((dataUrl.length - JPEG_PREFIX.length) * 3) / 4);

function fromSource(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext, type: string): Record<string, unknown> | null {
  if (ctx.frameWindow === null || event.source !== ctx.frameWindow) return null;
  if (event.origin !== ctx.gameOrigin && event.origin !== "null") return null;
  const data = event.data as Record<string, unknown> | null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (data.type !== type || data.id !== ctx.expectedId) return null;
  return data;
}

export function acceptRecordStarted(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext): { supported: boolean; active: boolean } | null {
  const d = fromSource(event, ctx, "ttakkari:record:started");
  if (d === null || typeof d.supported !== "boolean" || typeof d.active !== "boolean") return null;
  return { supported: d.supported, active: d.active };
}

/** 검증을 통과한 녹화 결과만 돌려준다. 프레임 하나라도 규약에 안 맞으면 응답 전체를 거부한다(일부만 믿지 않는다). */
export function acceptRecordResult(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext): Recording | null {
  const d = fromSource(event, ctx, "ttakkari:record:result");
  if (d === null || d.supported !== true || !Array.isArray(d.frames) || d.frames.length > RECORD_MAX_FRAMES) return null;
  const { width, height, fps, durationMs, reason } = d;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (d.frames.length > 0 && ((width as number) <= 0 || (height as number) <= 0))) return null;
  if ((width as number) > 1024 || (height as number) > 4096) return null;
  if (typeof fps !== "number" || !Number.isFinite(fps) || typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > RECORD_MAX_MS + 2000) return null;
  if (typeof reason !== "string" || !(REASONS as readonly string[]).includes(reason)) return null;
  const frames: RecordFrame[] = [];
  let bytes = 0;
  let prev = -1;
  for (const raw of d.frames) {
    if (typeof raw !== "object" || raw === null) return null;
    const f = raw as Record<string, unknown>;
    if (typeof f.tMs !== "number" || !Number.isFinite(f.tMs) || f.tMs < 0 || f.tMs <= prev) return null;
    if (typeof f.dataUrl !== "string" || !f.dataUrl.startsWith(JPEG_PREFIX)) return null;
    bytes += decodedBytes(f.dataUrl);
    if (bytes > RECORD_MAX_BYTES) return null;
    prev = f.tMs;
    frames.push({ tMs: f.tMs, dataUrl: f.dataUrl });
  }
  return { frames, width: width as number, height: height as number, fps, durationMs, reason: reason as RecordReason };
}

/** data URL 을 JPEG Blob 으로. 디코드한 바이트가 JPEG 서명(SOI/EOI)이 아니면 거부한다. fetch 를 쓰지 않아 data: 를 막는 CSP 와 무관하다. */
export function jpegBlobFromDataUrl(dataUrl: string): Blob {
  if (!dataUrl.startsWith(JPEG_PREFIX)) throw new Error("JPEG 프레임이 아닙니다.");
  const bin = atob(dataUrl.slice(JPEG_PREFIX.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) throw new Error("JPEG 형식이 아닙니다.");
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * 구간 [startMs, endMs] 안의 프레임을 최대 max 장으로 고른다. 구간의 첫 프레임과 마지막 프레임을 반드시 넣고 나머지는 시간순으로 균등하게 뽑는다.
 * 구간 안에 프레임이 없으면 빈 배열. 구간이 CLIP_MAX_MS 를 넘으면 호출한 쪽이 막아야 하므로 여기서도 거부한다(빈 배열).
 */
export function pickSegmentFrames(frames: RecordFrame[], startMs: number, endMs: number, max = CLIP_MAX_FRAMES): RecordFrame[] {
  if (!(endMs > startMs) || endMs - startMs > CLIP_MAX_MS || max < 1) return [];
  const inside = frames.filter((f) => f.tMs >= startMs && f.tMs <= endMs);
  if (inside.length <= max) return inside;
  if (max === 1) return [inside[0]];
  const picked = new Set<number>();
  for (let i = 0; i < max; i += 1) picked.add(Math.round((i * (inside.length - 1)) / (max - 1)));
  return [...picked].sort((a, b) => a - b).map((i) => inside[i]);
}

function exchange<T>(
  frame: HTMLIFrameElement,
  type: string,
  accept: (e: MessageEvent, ctx: CaptureContext) => T | null,
  gameOrigin: string,
  timeoutMs: number,
  retryMs: number,
  win: Window,
  retry: boolean,
  failure: string,
): Promise<T> {
  const id = newCaptureId();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(timeout);
    };
    const onMessage = (event: MessageEvent) => {
      const ok = accept(event, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id });
      if (!ok) return;
      cleanup();
      resolve(ok);
    };
    const send = () => frame.contentWindow?.postMessage({ type, id, ...(type === "ttakkari:record-start" ? { fps: 6 } : {}) }, "*");
    win.addEventListener("message", onMessage);
    send();
    // record-stop 은 응답이 프레임을 비우므로 다시 보내면 첫 응답 뒤의 두 번째 요청이 빈 결과를 만든다. 시작만 재시도한다.
    const timer = retry ? setInterval(send, retryMs) : undefined;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(failure));
    }, timeoutMs);
  });
}

export function requestRecordStart(
  frame: HTMLIFrameElement,
  gameOrigin: string,
  { timeoutMs = 4000, retryMs = 500, win = window }: { timeoutMs?: number; retryMs?: number; win?: Window } = {},
) {
  return exchange(frame, "ttakkari:record-start", acceptRecordStarted, gameOrigin, timeoutMs, retryMs, win, true, "이 빌드는 녹화를 지원하지 않아요. 새로 빌드하면 쓸 수 있어요.");
}

export function requestRecordStop(
  frame: HTMLIFrameElement,
  gameOrigin: string,
  { timeoutMs = 20_000, win = window }: { timeoutMs?: number; win?: Window } = {},
) {
  return exchange(frame, "ttakkari:record-stop", acceptRecordResult, gameOrigin, timeoutMs, 0, win, false, "게임에서 녹화 결과가 오지 않았어요. 다시 녹화해 주세요.");
}
