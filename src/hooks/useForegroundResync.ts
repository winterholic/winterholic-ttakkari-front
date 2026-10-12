import { useEffect, useRef } from "react";

/**
 * 화면이 다시 보이거나(visibilitychange, pageshow) 네트워크가 돌아오면(online) 한 번 불린다.
 * iOS PWA 는 백그라운드·잠금 중에 SSE 와 타이머를 멈추므로, 그 사이 서버에서 생긴 일은 복귀 시점에 다시 가져와야 한다.
 */
export function useForegroundResync(onResync: () => void) {
  const cb = useRef(onResync);
  useEffect(() => {
    cb.current = onResync;
  });
  useEffect(() => {
    const fire = () => {
      if (document.visibilityState === "visible") cb.current();
    };
    document.addEventListener("visibilitychange", fire);
    window.addEventListener("pageshow", fire);
    window.addEventListener("online", fire);
    return () => {
      document.removeEventListener("visibilitychange", fire);
      window.removeEventListener("pageshow", fire);
      window.removeEventListener("online", fire);
    };
  }, []);
}
