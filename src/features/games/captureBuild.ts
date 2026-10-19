import { playGame } from "../../api/client";
import { pngBlobFromDataUrl, requestCapture } from "./captureBridge";
import type { Screenshot } from "./feedback";

// 비교용 캡처는 화면에 보이는 플레이어와 별개로, 눈에 안 띄는 iframe 에서 해당 빌드를 열어 같은 bridge 로 찍는다.
// 두 빌드의 크기가 같아야 나란히 비교가 되므로 크기를 고정한다.
const PROBE_WIDTH = 360;
const PROBE_HEIGHT = 640;
const LOAD_TIMEOUT_MS = 20_000;
// load 직후에는 Phaser 가 아직 씬을 만들기 전이라 배경만 찍힌다(실측). 화면 밖(left:-10000px)에서는 WebGL 렌더 대상 생성이 실패해(Framebuffer Incomplete Attachment) 화면 안에 투명으로 둔다.
const BOOT_SETTLE_MS = 1500;
const COOL_DOWN_MS = 1500;

/**
 * 지정한 빌드를 별도 iframe 으로 열어 한 장 캡처한다. iframe 은 끝나면 반드시 제거한다.
 * 실측: 헤드리스 Chrome 에서 WebGL 컨텍스트가 겹치면 Phaser 부팅이 가끔 실패해(Framebuffer Incomplete Attachment) bridge 가 설치되지 않는다. 새 iframe 으로 한 번 더 시도한다.
 */
export async function captureBuild(gameId: string, buildId: string): Promise<Screenshot> {
  try {
    return await captureBuildOnce(gameId, buildId);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, COOL_DOWN_MS));
    return captureBuildOnce(gameId, buildId);
  }
}

async function captureBuildOnce(gameId: string, buildId: string): Promise<Screenshot> {
  const play = await playGame(gameId, buildId);
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", play.sandbox);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = `v${play.build_seq} 비교용 캡처`;
  frame.style.cssText = `position:fixed;left:0;top:0;width:${PROBE_WIDTH}px;height:${PROBE_HEIGHT}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
  frame.src = play.url;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("게임을 여는 데 너무 오래 걸려요.")), LOAD_TIMEOUT_MS);
      frame.addEventListener("load", () => { clearTimeout(t); resolve(); }, { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, BOOT_SETTLE_MS));
    const r = await requestCapture(frame, play.origin, { timeoutMs: 15_000 });
    const blob = pngBlobFromDataUrl(r.dataUrl);
    return {
      blob, url: URL.createObjectURL(blob), width: r.width, height: r.height, source: "bridge-postmessage",
      capturedAt: new Date().toISOString(), buildId: play.build_id, buildSeq: play.build_seq, bundleSha256: play.bundle_sha256,
    };
  } finally {
    // 문서를 먼저 비워 WebGL 컨텍스트를 놓게 한다. 그냥 제거하면 컨텍스트가 남아 다음 캡처의 부팅이 실패하는 일이 있었다(실측).
    frame.src = "about:blank";
    frame.remove();
    await new Promise((resolve) => setTimeout(resolve, COOL_DOWN_MS));
  }
}
