import { useEffect } from "react";
import { useNavigate } from "react-router";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** 데스크톱 단축키. ⌘N 은 브라우저가 가로채서 ⌘⇧O(새 세션)를 쓴다. `/` 는 지시 입력으로 이동. */
export function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        navigate("/chat");
        return;
      }
      if (e.key === "/" && !mod && !typing(e.target) && !document.querySelector("dialog[open]")) {
        const input = document.querySelector<HTMLTextAreaElement>(".tk-composer__input");
        if (input) {
          e.preventDefault();
          input.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
