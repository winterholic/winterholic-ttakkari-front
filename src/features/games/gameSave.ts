// 게임 영구 세이브(back ADR 0057). sandbox iframe 은 localStorage 를 쓸 수 없으므로 부모(PWA)가 게임별 슬롯을 대신 보관한다.
// 게임 템플릿의 save.get/set 메모리 저장소를 bridge 의 save-export/save-import 로 오가며 저장한다. 서버로 보내지 않고 이 기기 localStorage 에만 둔다.
import { newCaptureId } from "./captureBridge";

export const SAVE_KEY_PREFIX = "ttakkari-game-save:v1:";
/** 템플릿 bridge 의 MAX_SAVE_CHARS 와 같다. 이보다 큰 값은 저장하지 않는다. */
export const MAX_SAVE_CHARS = 64 * 1024;

export interface SavedGame {
  data: string;
  savedAt: string;
  buildSeq: number | null;
}

const key = (gameId: string) => SAVE_KEY_PREFIX + gameId;

/** 저장할 수 있는 모양인가: 64KB 이하의 JSON 객체(배열·원시값 제외). 템플릿 save-import 가 받는 조건과 같다. */
export function isValidSaveData(data: unknown): data is string {
  if (typeof data !== "string" || data.length > MAX_SAVE_CHARS) return false;
  try {
    const parsed: unknown = JSON.parse(data);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/** 키가 하나도 없는 빈 세이브. 아직 불러오지 못한 게임의 빈 상태가 실제 저장을 덮어쓰지 않도록 저장하지 않는다. */
export function isEmptySave(data: string): boolean {
  try {
    return Object.keys(JSON.parse(data) as Record<string, unknown>).length === 0;
  } catch {
    return true;
  }
}

export function readSave(gameId: string, storage: Storage = window.localStorage): SavedGame | null {
  try {
    const raw = storage.getItem(key(gameId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedGame>;
    if (!isValidSaveData(v.data)) return null;
    return { data: v.data, savedAt: typeof v.savedAt === "string" ? v.savedAt : "", buildSeq: typeof v.buildSeq === "number" ? v.buildSeq : null };
  } catch {
    return null;
  }
}

/** 저장에 성공하면 true. 용량 초과·사생활 보호 모드처럼 localStorage 가 막히면 false 를 돌려주고 던지지 않는다. */
export function writeSave(gameId: string, data: string, buildSeq: number | null, storage: Storage = window.localStorage): boolean {
  if (!isValidSaveData(data) || isEmptySave(data)) return false;
  try {
    storage.setItem(key(gameId), JSON.stringify({ data, savedAt: new Date().toISOString(), buildSeq } satisfies SavedGame));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(gameId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(key(gameId));
  } catch {
    // 지울 수 없으면 남아 있어도 다음 저장에서 덮인다
  }
}

interface FrameCtx {
  frameWindow: Window | null;
  gameOrigin: string;
}

function fromFrame(event: { origin: string; source: unknown; data: unknown }, ctx: FrameCtx): Record<string, unknown> | null {
  if (ctx.frameWindow === null || event.source !== ctx.frameWindow) return null;
  if (event.origin !== ctx.gameOrigin && event.origin !== "null") return null;
  const data = event.data as Record<string, unknown> | null;
  return typeof data === "object" && data !== null && !Array.isArray(data) ? data : null;
}

/** 게임이 부팅을 마쳤다는 알림(ttakkari:ready). 이 신호를 받으면 저장된 세이브를 넣어 준다. */
export function acceptReadyMessage(event: { origin: string; source: unknown; data: unknown }, ctx: FrameCtx): boolean {
  return fromFrame(event, ctx)?.type === "ttakkari:ready";
}

export function acceptSaveExportMessage(event: { origin: string; source: unknown; data: unknown }, ctx: FrameCtx & { expectedId: string }): string | null {
  const d = fromFrame(event, ctx);
  if (!d || d.type !== "ttakkari:save-export:result" || d.id !== ctx.expectedId) return null;
  return isValidSaveData(d.data) ? d.data : null;
}

export function acceptSaveImportMessage(event: { origin: string; source: unknown; data: unknown }, ctx: FrameCtx & { expectedId: string }): boolean | null {
  const d = fromFrame(event, ctx);
  if (!d || d.type !== "ttakkari:save-import:result" || d.id !== ctx.expectedId) return null;
  return typeof d.ok === "boolean" ? d.ok : null;
}

function roundTrip<T>(
  frame: HTMLIFrameElement,
  message: Record<string, unknown>,
  accept: (event: MessageEvent, id: string) => T | null,
  timeoutMs: number,
  what: string,
  win: Window,
): Promise<T> {
  const id = newCaptureId();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.removeEventListener("message", onMessage);
      clearTimeout(timeout);
    };
    const onMessage = (event: MessageEvent) => {
      const ok = accept(event, id);
      if (ok === null) return;
      cleanup();
      resolve(ok);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(what + " 응답이 없어요."));
    }, timeoutMs);
    win.addEventListener("message", onMessage);
    // 부모→게임은 targetOrigin "*": sandbox 문서의 origin 이 opaque 라 주소 문자열로는 배달되지 않는다. 보내는 값은 요청 id 와 이 사용자의 세이브뿐이다.
    frame.contentWindow?.postMessage({ ...message, id }, "*");
  });
}

export function requestSaveExport(frame: HTMLIFrameElement, gameOrigin: string, { timeoutMs = 3000, win = window }: { timeoutMs?: number; win?: Window } = {}): Promise<string> {
  return roundTrip(frame, { type: "ttakkari:save-export" }, (e, id) => acceptSaveExportMessage(e, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id }), timeoutMs, "세이브 내보내기", win);
}

export function requestSaveImport(frame: HTMLIFrameElement, gameOrigin: string, data: string, { timeoutMs = 3000, win = window }: { timeoutMs?: number; win?: Window } = {}): Promise<boolean> {
  return roundTrip(frame, { type: "ttakkari:save-import", data }, (e, id) => acceptSaveImportMessage(e, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id }), timeoutMs, "세이브 불러오기", win);
}
