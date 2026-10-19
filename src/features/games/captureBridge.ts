// 부모(PWA) 쪽 postMessage bridge. 게임은 별도 origin 의 sandbox iframe 이라 canvas 를 직접 읽을 수 없고,
// 게임 템플릿(back web-phaser/src/bridge.ts)이 만든 캡처만 받는다. 계약은 back ADR 0049 §6.

const MAX_DIMENSION = 8192;
const MAX_DATA_URL_CHARS = 16 * 1024 * 1024;
const PNG_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface CaptureResult {
  id: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface CaptureContext {
  /** 우리가 만든 iframe 의 contentWindow. 다른 창에서 온 메시지는 모두 버린다. */
  frameWindow: Window | null;
  /** play 응답의 origin. sandbox(allow-same-origin 없음) 문서의 event.origin 은 "null" 이라 둘 다 허용하되 source 가 반드시 같아야 한다. */
  gameOrigin: string;
  /** 보낸 요청 id. 응답 id 가 다르면 오래된 응답이거나 위조다. */
  expectedId: string;
}

export function newCaptureId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 검증을 통과한 캡처 결과만 돌려준다. 이미지는 data URL 문자열일 뿐 HTML 로 해석하지 않는다. */
export function acceptCaptureMessage(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext): CaptureResult | null {
  if (ctx.frameWindow === null || event.source !== ctx.frameWindow) return null;
  if (event.origin !== ctx.gameOrigin && event.origin !== "null") return null;
  const data = event.data as Record<string, unknown> | null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (data.type !== "ttakkari:capture:result" || data.id !== ctx.expectedId) return null;
  const { width, height, dataUrl } = data;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  const w = width as number;
  const h = height as number;
  if (w <= 0 || h <= 0 || w > MAX_DIMENSION || h > MAX_DIMENSION) return null;
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_DATA_URL_CHARS || !dataUrl.startsWith(PNG_PREFIX)) return null;
  return { id: ctx.expectedId, width: w, height: h, dataUrl };
}

/** data URL 을 PNG Blob 으로. 디코드한 바이트가 PNG 서명이 아니면 거부한다. fetch 를 쓰지 않아 data: 를 막는 CSP 와 무관하다. */
export function pngBlobFromDataUrl(dataUrl: string): Blob {
  if (!dataUrl.startsWith(PNG_PREFIX)) throw new Error("PNG 캡처가 아닙니다.");
  const bin = atob(dataUrl.slice(PNG_PREFIX.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  if (PNG_MAGIC.some((m, i) => bytes[i] !== m)) throw new Error("PNG 형식이 아닙니다.");
  return new Blob([bytes], { type: "image/png" });
}

/**
 * 캡처를 요청하고 응답을 기다린다. 게임이 아직 부팅 중이면 bridge 가 없어 응답이 없으므로 일정 간격으로 다시 보낸다.
 * 부모→게임 방향은 targetOrigin 을 "*" 로 쓴다: sandbox 문서의 origin 이 opaque 라 주소 문자열로는 배달되지 않는다.
 * 보내는 내용은 무작위 요청 id 뿐이라 노출되는 비밀이 없다.
 */
export function requestCapture(
  frame: HTMLIFrameElement,
  gameOrigin: string,
  { timeoutMs = 8000, retryMs = 500, win = window }: { timeoutMs?: number; retryMs?: number; win?: Window } = {},
): Promise<CaptureResult> {
  const id = newCaptureId();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(timeout);
    };
    const onMessage = (event: MessageEvent) => {
      const ok = acceptCaptureMessage(event, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id });
      if (!ok) return;
      cleanup();
      resolve(ok);
    };
    const send = () => frame.contentWindow?.postMessage({ type: "ttakkari:capture", id }, "*");
    win.addEventListener("message", onMessage);
    send();
    const timer = setInterval(send, retryMs);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("게임 화면에서 캡처 응답이 없어요. 게임이 다 열린 뒤 다시 눌러 주세요."));
    }, timeoutMs);
  });
}

export interface PauseResult {
  paused: boolean;
  /** 게임 템플릿이 pause 를 구현했는지. 이전 템플릿은 응답 자체가 없다(시간 초과). */
  supported: boolean;
}

/** 일시정지·재개 응답 검증. 캡처 응답과 같은 source·origin·id 조건에 객체 모양을 더한다. */
export function acceptPausedMessage(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext): PauseResult | null {
  if (ctx.frameWindow === null || event.source !== ctx.frameWindow) return null;
  if (event.origin !== ctx.gameOrigin && event.origin !== "null") return null;
  const data = event.data as Record<string, unknown> | null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (data.type !== "ttakkari:paused" || data.id !== ctx.expectedId) return null;
  if (typeof data.paused !== "boolean" || typeof data.supported !== "boolean") return null;
  return { paused: data.paused, supported: data.supported };
}

/** 게임에 일시정지/재개를 요청하고 실제 상태를 돌려받는다. 부팅 중이면 bridge 가 없어 재시도하고, 끝내 응답이 없으면 거절한다. */
export function requestPause(
  frame: HTMLIFrameElement,
  gameOrigin: string,
  paused: boolean,
  { timeoutMs = 4000, retryMs = 500, win = window }: { timeoutMs?: number; retryMs?: number; win?: Window } = {},
): Promise<PauseResult> {
  const id = newCaptureId();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(timeout);
    };
    const onMessage = (event: MessageEvent) => {
      const ok = acceptPausedMessage(event, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id });
      if (!ok) return;
      cleanup();
      resolve(ok);
    };
    const send = () => frame.contentWindow?.postMessage({ type: paused ? "ttakkari:pause" : "ttakkari:resume", id }, "*");
    win.addEventListener("message", onMessage);
    send();
    const timer = setInterval(send, retryMs);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("이 빌드는 일시정지를 지원하지 않아요. 새로 빌드하면 쓸 수 있어요."));
    }, timeoutMs);
  });
}
