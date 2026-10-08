import { useSyncExternalStore } from "react";

export type ToastTone = "neutral" | "success" | "danger" | "warning";
export interface ToastAction {
  label: string;
  onClick?: () => void;
}
export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  leaving: boolean;
}
export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** ms. 행동이 있으면 무시된다(읽고 누를 시간을 뺏지 않는다). */
  duration?: number;
}

// docs/05 의 toast duration(5000ms)과 normal(180ms). 토큰은 CSS 변수라 JS 쪽 기본값만 둔다.
const AUTO_CLOSE_MS = 5000;
const LEAVE_MS = 180;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  const t = items.find((i) => i.id === id);
  if (!t || t.leaving) return;
  items = items.map((i) => (i.id === id ? { ...i, leaving: true } : i));
  emit();
  setTimeout(() => {
    items = items.filter((i) => i.id !== id);
    emit();
  }, LEAVE_MS);
}

/** 전역 토스트. 다른 화면에 있을 때 끝난 일을 알리는 용도(docs/06 §17). */
export function toast({ message, tone = "neutral", action, duration }: ToastInput): { dismiss: () => void } {
  const id = ++seq;
  items = [...items, { id, message, tone, action, leaving: false }];
  emit();
  if (!action) setTimeout(() => dismissToast(id), duration ?? AUTO_CLOSE_MS);
  return { dismiss: () => dismissToast(id) };
}

export function clearToasts() {
  items = [];
  emit();
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}
