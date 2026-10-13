import { useCallback, useEffect, useRef, useState } from "react";

export interface View {
  x: number;
  y: number;
  k: number;
}

export const MIN_K = 0.3;
export const MAX_K = 1.6;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

/**
 * 캔버스 이동·확대. 빈 곳을 끌면 이동, 트랙패드 두 손가락 스크롤도 이동, ⌘/Ctrl+휠·핀치는 커서 자리를 중심으로 확대.
 * 노드(버튼) 위에서 시작한 끌기는 이동으로 보지 않는다. 클릭과 끌기를 4px 로 가른다.
 */
export function usePanZoom() {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const zoomAt = useCallback((k: number, cx?: number, cy?: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    setView((v) => {
      const nk = clampK(k);
      // 화면의 (px,py) 아래 있던 캔버스 점이 그대로 그 자리에 남게 한다.
      return { k: nk, x: px - ((px - v.x) * nk) / v.k, y: py - ((py - v.y) * nk) / v.k };
    });
  }, []);

  /**
   * 내용 상자(캔버스 좌표)를 화면에 맞춘다. pad 는 화면 px. 1배를 넘지 않고 minK 밑으로 줄이지 않는다.
   * 다 안 들어가면 anchorX(캔버스 x)를 가운데에 두고 위쪽부터 보인다. 글자를 못 읽을 만큼 줄여 다 보이는 것보다 낫다.
   */
  const fit = useCallback(
    (box: { x: number; y: number; w: number; h: number }, pad = { top: 24, right: 24, bottom: 24, left: 24 }, minK = MIN_K, anchorX?: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const aw = Math.max(1, r.width - pad.left - pad.right);
      const ah = Math.max(1, r.height - pad.top - pad.bottom);
      const k = clampK(Math.max(minK, Math.min(1, aw / box.w, ah / box.h)));
      const fitsW = box.w * k <= aw;
      const cx = fitsW || anchorX === undefined ? box.x + box.w / 2 : anchorX;
      setView({ k, x: pad.left + aw / 2 - cx * k, y: pad.top + Math.max(0, (ah - box.h * k) / 2) - box.y * k });
    },
    [],
  );

  /** 캔버스 좌표의 상자가 화면 밖이면 그 상자가 보이도록 옮긴다(키보드 포커스·검색 이동). */
  const reveal = useCallback((box: { x: number; y: number; w: number; h: number }, margin = 48) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setView((v) => {
      const sx = box.x * v.k + v.x;
      const sy = box.y * v.k + v.y;
      const sw = box.w * v.k;
      const sh = box.h * v.k;
      let { x, y } = v;
      if (sx < margin) x += margin - sx;
      else if (sx + sw > r.width - margin) x -= sx + sw - (r.width - margin);
      if (sy < margin) y += margin - sy;
      else if (sy + sh > r.height - margin) y -= sy + sh - (r.height - margin);
      return x === v.x && y === v.y ? v : { ...v, x, y };
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // 트랙패드 핀치는 ctrlKey 가 붙은 wheel 로 온다.
        zoomAt(viewRef.current.k * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    let pinch: { d: number; k: number } | null = null;
    const onDown = (e: PointerEvent) => {
      // 노드·버튼에서 시작한 누름은 그쪽 클릭이다.
      if ((e.target as Element).closest("button, a, input, textarea, [data-no-pan]")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: viewRef.current.k };
        drag = null;
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const r = el.getBoundingClientRect();
        zoomAt((pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        return;
      }
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      el.dataset.panning = "";
      setView((v) => ({ ...v, x: drag!.vx + dx, y: drag!.vy + dy }));
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        drag = null;
        delete el.dataset.panning;
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [zoomAt]);

  return { ref, view, setView, zoomAt, fit, reveal };
}
