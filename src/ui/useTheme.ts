import { useCallback, useSyncExternalStore } from "react";
import pwa from "../vendor/ttakkari/pwa.json";

// docs/12 §3, docs/19 §2: data-theme 과 localStorage['tk-theme'] 가 정본이다.
export type Theme = "light" | "dark";
export const THEME_KEY = "tk-theme";

const listeners = new Set<() => void>();

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** 강제된 테마가 없으면 OS 설정을 따른다. */
export function currentTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeColor(theme: Theme) {
  // 사용자가 테마를 강제하면 상태 표시줄 색도 같은 값으로 맞춘다(docs/12 §3).
  const color = theme === "dark" ? pwa.theme_color_dark : pwa.theme_color;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 저장이 막힌 환경에서도 이번 방문에는 적용된다.
  }
  syncThemeColor(theme);
  listeners.forEach((l) => l());
}

/** 저장된 선택을 문서에 복원한다. index.html 의 인라인 스크립트와 같은 일을 하되 theme-color 까지 맞춘다. */
export function restoreTheme() {
  const t = stored();
  if (t) {
    document.documentElement.dataset.theme = t;
    syncThemeColor(t);
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener("change", cb);
  };
}

export function useTheme(): { theme: Theme; isDark: boolean; toggle: () => void; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const toggle = useCallback(() => setTheme(currentTheme() === "dark" ? "light" : "dark"), []);
  return { theme, isDark: theme === "dark", toggle, setTheme };
}
