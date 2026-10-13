import { useCallback, useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";

/** 캐럿이 가려지지 않게 두는 여백(px). 키보드·모달 가장자리에 바짝 붙지 않게 한다. */
const MARGIN = 16;

const MIRRORED = [
  "boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "wordBreak", "overflowWrap",
] as const;

/** 텍스트에어리어 안에서 캐럿이 있는 줄의 위치(textarea 내용 상단 기준, 스크롤 전 좌표)와 줄 높이. */
export function measureCaret(ta: HTMLTextAreaElement): { top: number; height: number } {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement("div");
  for (const p of MIRRORED) mirror.style[p] = cs[p];
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px", whiteSpace: "pre-wrap", overflow: "hidden" });
  mirror.textContent = ta.value.slice(0, ta.selectionEnd);
  // 끝이 줄바꿈이어도 새 줄의 높이가 잡히도록 보이지 않는 글자를 하나 둔다.
  const mark = document.createElement("span");
  mark.textContent = "​";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const out = { top: mark.offsetTop + parseFloat(cs.borderTopWidth || "0"), height: mark.offsetHeight };
  mirror.remove();
  return out;
}

/**
 * 캐럿 줄(caretTop~caretBottom)이 보이는 구간(viewTop~viewBottom) 안에 들어오도록 스크롤해야 하는 양.
 * 양수면 아래로, 음수면 위로. 이미 보이면 0. 구간이 캐럿 줄보다 좁으면 캐럿 아래쪽(입력 위치)을 우선한다.
 */
export function scrollDeltaForCaret(caretTop: number, caretBottom: number, viewTop: number, viewBottom: number, margin = MARGIN): number {
  if (caretBottom + margin > viewBottom) return caretBottom + margin - viewBottom;
  if (caretTop - margin < viewTop) return caretTop - margin - viewTop;
  return 0;
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** 가상 키보드가 가린 높이. 키보드가 없거나 visualViewport 를 모르면 0. */
function keyboardInset(scroller: HTMLElement): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  return Math.max(0, scroller.getBoundingClientRect().bottom - (vv.offsetTop + vv.height));
}

/**
 * 본문 텍스트에어리어를 내용만큼 키우고, 캐럿이 있는 줄이 항상 보이게 스크롤한다.
 *
 * 높이를 고정하고 안에서 스크롤하면, 모바일 키보드가 올라온 뒤 엔터로 줄이 늘어도 캐럿이 텍스트에어리어 아래 끝에 붙은 채
 * 키보드 밑으로 들어간다(브라우저는 포커스할 때만 보이는 곳으로 올려 준다). 그래서 상자는 키우고 스크롤은 모달 본문 하나로
 * 두고, 캐럿을 직접 재서 visualViewport(키보드를 뺀 보이는 영역) 안에 넣는다. 키보드가 가린 만큼은 `--memo-kbd-inset` 으로
 * 편집기 아래에 여백을 주어 맨 끝 줄도 위로 올릴 수 있게 한다.
 */
export function useCaretVisible(ref: RefObject<HTMLTextAreaElement | null>, value: string, enabled: boolean) {
  const reveal = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const scroller = scrollParent(ta);
    const vv = window.visualViewport;
    const sr = scroller.getBoundingClientRect();
    // 포커스가 없으면(키보드가 내려갔으면) 여백도 거둔다.
    const inset = document.activeElement === ta ? keyboardInset(scroller) : 0;
    ta.closest<HTMLElement>(".memo-editor")?.style.setProperty("--memo-kbd-inset", `${Math.round(inset)}px`);
    if (document.activeElement !== ta) return;
    const viewBottom = vv ? Math.min(sr.bottom, vv.offsetTop + vv.height) : sr.bottom;
    const caret = measureCaret(ta);
    const taTop = ta.getBoundingClientRect().top - ta.scrollTop;
    const delta = scrollDeltaForCaret(taTop + caret.top, taTop + caret.top + caret.height, sr.top, viewBottom);
    if (delta) scroller.scrollTop += delta;
  }, [ref]);

  // 내용이 바뀌면 높이를 맞춘다. 높이를 잠깐 auto 로 줄이면 스크롤 상자가 위로 밀리므로 위치를 되돌린다.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta || !enabled) return;
    const scroller = scrollParent(ta);
    const st = scroller.scrollTop;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + ta.offsetHeight - ta.clientHeight}px`;
    scroller.scrollTop = st;
    reveal();
  }, [ref, value, enabled, reveal]);

  useEffect(() => {
    const ta = ref.current;
    if (!ta || !enabled) return;
    let raf = 0;
    // 키보드가 올라오는 동안 visualViewport 가 여러 번 바뀐다. 한 프레임에 한 번만 다시 맞춘다.
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(reveal);
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", later);
    vv?.addEventListener("scroll", later);
    document.addEventListener("selectionchange", later);
    ta.addEventListener("focus", later);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", later);
      vv?.removeEventListener("scroll", later);
      document.removeEventListener("selectionchange", later);
      ta.removeEventListener("focus", later);
    };
  }, [ref, enabled, reveal]);
}
