import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";
import { useLocation, useNavigationType } from "react-router";

// BrowserRouter 는 스크롤 복원을 해 주지 않고, 이 앱의 화면은 window 가 아니라 .tk-screen__body 가 스크롤한다.
// 뒤로가기(POP)로 돌아오면 그 이력 항목에서 떠났던 위치로, 새로 들어가면 맨 위로 둔다. 위치는 메모리에만 두고 새로고침하면 사라진다.
const MEMORY = new Map<string, number>();
const MEMORY_LIMIT = 100;
const GIVE_UP_MS = 2500;

export const scrollMemory = {
  get: (key: string): number => MEMORY.get(key) ?? 0,
  set(key: string, top: number) {
    MEMORY.delete(key);
    MEMORY.set(key, top);
    if (MEMORY.size > MEMORY_LIMIT) MEMORY.delete(MEMORY.keys().next().value as string);
  },
  clear: () => MEMORY.clear(),
};

export function useScrollRestore(scroller: RefObject<HTMLElement | null>): void {
  const { key } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const save = () => scrollMemory.set(key, el.scrollTop);
    el.addEventListener("scroll", save, { passive: true });
    return () => el.removeEventListener("scroll", save);
  }, [key, scroller]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = navType === "POP" ? scrollMemory.get(key) : 0;
    el.scrollTo?.({ top: target });
    if (target === 0) return;
    // 데이터가 늦게 와서 내용이 아직 짧으면 닿을 때까지 높이가 바뀔 때마다 다시 맞춘다. 사용자가 직접 움직이면 멈춘다.
    let done = false;
    const stop = () => { done = true; ro?.disconnect(); };
    const apply = () => {
      if (done) return;
      el.scrollTo?.({ top: target });
      if (Math.abs(el.scrollTop - target) < 2) stop();
    };
    const ro = typeof ResizeObserver === "undefined" || !el.firstElementChild ? null : new ResizeObserver(apply);
    ro?.observe(el.firstElementChild as Element);
    el.addEventListener("wheel", stop, { once: true, passive: true });
    el.addEventListener("touchstart", stop, { once: true, passive: true });
    const timer = window.setTimeout(stop, GIVE_UP_MS);
    return () => {
      stop();
      window.clearTimeout(timer);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, [key, navType, scroller]);
}
