// 오브젝트 선택(back ADR 0059): 게임 화면의 한 지점(캔버스 0~1 비율)에 어떤 오브젝트가 있는지 게임 bridge 에 묻는다.
// 응답은 게임이 보낸 값이라 신뢰하지 않는다: source·origin·요청 id 를 확인하고 모든 필드를 길이·범위·타입으로 걸러 낸다.
import { newCaptureId } from "./captureBridge";
import type { CaptureContext } from "./captureBridge";

const MAX_HITS = 10;
const MAX_TEXT = 200;

export interface PickBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickHit {
  scene: string;
  /** 게임이 setName() 으로 붙인 이름. 없으면 빈 문자열 */
  name: string;
  /** Phaser 오브젝트 종류(Rectangle, Image, Text ...) */
  type: string;
  texture: string | null;
  frame: string | null;
  text: string | null;
  /** 컨테이너 안의 오브젝트면 그 컨테이너 이름 */
  container: string | null;
  depth: number;
  /** 캔버스 대비 0~1 비율 */
  bounds: PickBounds;
}

export type PickOutcome =
  | { supported: true; hits: PickHit[]; truncated: boolean; point: { x: number; y: number } }
  | { supported: false; reason: string };

const str = (v: unknown, max = MAX_TEXT): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseHit(raw: unknown): PickHit | null {
  if (typeof raw !== "object" || raw === null) return null;
  const h = raw as Record<string, unknown>;
  const b = h.bounds as Record<string, unknown> | null;
  if (typeof b !== "object" || b === null) return null;
  const [x, y, width, height] = [num(b.x), num(b.y), num(b.width), num(b.height)];
  const type = str(h.type, 40);
  if (x === null || y === null || width === null || height === null || type === null || width <= 0 || height <= 0) return null;
  return {
    scene: str(h.scene, 80) ?? "", name: str(h.name, 80) ?? "", type, texture: str(h.texture, 80), frame: str(h.frame, 80), text: str(h.text, 60),
    container: str(h.container, 80), depth: num(h.depth) ?? 0, bounds: { x, y, width, height },
  };
}

/** 검증을 통과한 pick 응답만 돌려준다. 모양이 이상한 항목은 버리고, 응답 자체가 규약에 안 맞으면 null. */
export function acceptPickMessage(event: { origin: string; source: unknown; data: unknown }, ctx: CaptureContext): PickOutcome | null {
  if (ctx.frameWindow === null || event.source !== ctx.frameWindow) return null;
  if (event.origin !== ctx.gameOrigin && event.origin !== "null") return null;
  const data = event.data as Record<string, unknown> | null;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (data.type !== "ttakkari:pick:result" || data.id !== ctx.expectedId || typeof data.supported !== "boolean") return null;
  if (!data.supported) return { supported: false, reason: str(data.reason, 300) ?? "이 게임은 오브젝트 선택을 지원하지 않아요." };
  const point = data.point as Record<string, unknown> | null;
  const px = point ? num(point.x) : null;
  const py = point ? num(point.y) : null;
  if (!Array.isArray(data.hits) || px === null || py === null) return null;
  const hits = data.hits.slice(0, MAX_HITS).map(parseHit).filter((h): h is PickHit => h !== null);
  return { supported: true, hits, truncated: data.truncated === true, point: { x: px, y: py } };
}

/**
 * 한 지점의 오브젝트를 묻는다. x, y 는 게임 화면의 0~1 비율이다. 게임이 부팅 중이거나 pick 을 모르는 이전 템플릿 빌드면
 * 응답이 없으므로 일정 간격으로 다시 보내다가 시간이 지나면 거절한다.
 */
export function requestPick(
  frame: HTMLIFrameElement,
  gameOrigin: string,
  x: number,
  y: number,
  { timeoutMs = 3000, retryMs = 500, win = window }: { timeoutMs?: number; retryMs?: number; win?: Window } = {},
): Promise<PickOutcome> {
  const id = newCaptureId();
  const fx = Math.min(1, Math.max(0, x));
  const fy = Math.min(1, Math.max(0, y));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      win.removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(timeout);
    };
    const onMessage = (event: MessageEvent) => {
      const ok = acceptPickMessage(event, { frameWindow: frame.contentWindow, gameOrigin, expectedId: id });
      if (!ok) return;
      cleanup();
      resolve(ok);
    };
    const send = () => frame.contentWindow?.postMessage({ type: "ttakkari:pick", id, x: fx, y: fy }, "*");
    win.addEventListener("message", onMessage);
    send();
    const timer = setInterval(send, retryMs);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("이 빌드는 오브젝트 선택을 지원하지 않아요. 새로 빌드하면 쓸 수 있어요."));
    }, timeoutMs);
  });
}
