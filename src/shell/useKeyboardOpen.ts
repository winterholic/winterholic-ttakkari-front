import { useEffect } from "react";

const TEXT_INPUT = /^(text|search|email|url|tel|password|number|date|datetime-local|month|time|week)$/;

function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === "TEXTAREA") return true;
  return el instanceof HTMLInputElement && TEXT_INPUT.test(el.type);
}

/**
 * 글자 입력 칸에 포커스가 있는 동안 <html data-kbd> 를 켠다. 모바일 키보드가 올라오면 하단 탭바가 키보드 위에 떠서
 * 화면을 가리므로 shell.css 가 이 표시로 숨긴다. iOS 는 키보드 높이를 알려 주는 API 가 마땅치 않아 포커스로 판단한다.
 */
export function useKeyboardOpen() {
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      // 입력 칸 사이를 옮겨 갈 때 탭바가 깜빡이지 않도록 포커스가 빠질 때만 잠깐 기다린다.
      if (isTextEntry(document.activeElement)) root.dataset.kbd = "";
      else timer = window.setTimeout(() => delete root.dataset.kbd, 120);
    };
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
      delete root.dataset.kbd;
    };
  }, []);
}
