import { playGame } from "../../api/client";
import { pngBlobFromDataUrl, requestCapture } from "./captureBridge";
import type { Screenshot } from "./feedback";

// 비교용 캡처는 화면에 보이는 플레이어와 별개로, 눈에 안 띄는 iframe 에서 해당 빌드를 열어 같은 bridge 로 찍는다.
// 두 빌드의 크기가 같아야 나란히 비교가 되므로 크기를 고정한다.
const PROBE_WIDTH = 360;
const PROBE_HEIGHT = 640;
const LOAD_TIMEOUT_MS = 20_000;

/** 지정한 빌드를 별도 iframe 으로 열어 한 장 캡처한다. iframe 은 끝나면 반드시 제거한다. */
export async function captureBuild(gameId: string, buildId: string): Promise<Screenshot> {
  const play = await playGame(gameId, buildId);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", play.sandbox);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = `v${play.build_seq} 비교용 캡처`;
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PROBE_WIDTH}px;height:${PROBE_HEIGHT}px;border:0;opacity:0;pointer-events:none`;
  frame.src = play.url;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("게임을 여는 데 너무 오래 걸려요.")), LOAD_TIMEOUT_MS);
      frame.addEventListener("load", () => { clearTimeout(t); resolve(); }, { once: true });
    });
    const r = await requestCapture(frame, play.origin, { timeoutMs: 15_000 });
    const blob = pngBlobFromDataUrl(r.dataUrl);
    return {
      blob, url: URL.createObjectURL(blob), width: r.width, height: r.height, source: "bridge-postmessage",
      capturedAt: new Date().toISOString(), buildId: play.build_id, buildSeq: play.build_seq, bundleSha256: play.bundle_sha256,
    };
  } finally {
    frame.remove();
  }
}
