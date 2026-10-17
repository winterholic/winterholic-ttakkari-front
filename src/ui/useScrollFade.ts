import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * 가로로 스크롤되는 상자(.tk-segmented--scroll)의 잘린 쪽에 data-fade="start end" 를 붙인다.
 * 디자인 시스템 CSS 가 그 쪽 가장자리를 흐리게 만들어 "옆에 더 있다"는 단서가 된다.
 * 고른 항목이 보이도록 scrollLeft 만 맞춘다(scrollIntoView 는 화면 본문까지 밀어 버린다).
 */
export function useScrollFade(ref: RefObject<HTMLElement | null>, selected: string | null, key: string) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const on = selected ? box.querySelector<HTMLElement>(selected) : null;
    if (on) {
      const left = on.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
      box.scrollLeft = left - (box.clientWidth - on.offsetWidth) / 2;
    }
    const update = () => {
      const more: string[] = [];
      if (box.scrollLeft > 1) more.push("start");
      if (box.scrollLeft + box.clientWidth < box.scrollWidth - 1) more.push("end");
      if (more.length) box.dataset.fade = more.join(" ");
      else delete box.dataset.fade;
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(box);
    return () => {
      box.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [ref, selected, key]);
}
