export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export interface PushEnv {
  /** serviceWorker, PushManager, Notification 이 모두 있다. */
  supported: boolean;
  ios: boolean;
  /** 홈 화면에 설치된 PWA 로 실행 중이다. */
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}

/**
 * iOS 는 홈 화면에 설치한 PWA 에서만 PushManager 가 생긴다. 그래서 iOS 사파리 탭에서 지원 안 함으로 보이면
 * "지원 안 함" 대신 설치 안내를 준다.
 */
export function derivePushState(e: PushEnv): PushState {
  if (!e.supported) return e.ios && !e.standalone ? "needs-install" : "unsupported";
  if (e.permission === "denied") return "denied";
  return e.subscribed && e.permission === "granted" ? "on" : "off";
}

export const PUSH_MESSAGE: Record<PushState, string> = {
  unsupported: "이 브라우저는 알림을 지원하지 않습니다.",
  "needs-install": "iPhone 에서는 공유 버튼에서 홈 화면에 추가한 뒤, 설치된 앱에서 켤 수 있습니다.",
  denied: "알림이 차단되어 있습니다. 브라우저 또는 기기 설정에서 허용으로 바꿔 주세요.",
  off: "앱을 닫아 두어도 작업이 끝나면 알림을 받습니다.",
  on: "이 기기에서 작업이 끝나면 알림을 받습니다.",
};

/** base64url -> Uint8Array(applicationServerKey). */
export function urlBase64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function readPushEnv(subscribed: boolean): PushEnv {
  const w = typeof window === "undefined" ? undefined : window;
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const supported = !!w && !!nav && "serviceWorker" in nav && "PushManager" in w && "Notification" in w;
  const ua = nav?.userAgent ?? "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav?.platform === "MacIntel" && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone =
    (w?.matchMedia?.("(display-mode: standalone)").matches ?? false) ||
    (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone === true;
  return { supported, ios, standalone, permission: supported ? Notification.permission : "unsupported", subscribed };
}
