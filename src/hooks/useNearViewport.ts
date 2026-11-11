import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * 요소가 화면(스크롤 영역) 근처에 한 번이라도 들어오면 true 가 되고 그 뒤로는 계속 true 다.
 * 길게 쌓인 목록에서 화면 밖 항목의 무거운 조회를 미루는 데 쓴다. IntersectionObserver 가 없으면 바로 true 다.
 */
export function useNearViewport(ref: RefObject<Element | null>, margin = "1500px 0px"): boolean {
  const supported = typeof IntersectionObserver !== "undefined";
  const [near, setNear] = useState(!supported);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near, margin]);
  return near;
}
