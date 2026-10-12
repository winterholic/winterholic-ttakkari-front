import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/client";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

/**
 * 입력이 멈춘 뒤 `delay` ms 에 저장하는 자동 저장. 저장은 한 번에 하나씩만 돌고(이어서 온 변경은 끝난 뒤 다시 저장),
 * 탭이 가려지거나 화면을 떠날 때는 기다리지 않고 바로 저장한다.
 * `save(value)` 는 서버에 쓰고, 409 면 ApiError 를 던져 conflict 로 표시한다.
 */
export function useAutosave<T>(value: T, saved: T, save: (v: T) => Promise<void>, opts: { delay?: number; same: (a: T, b: T) => boolean }) {
  const { delay = 800, same } = opts;
  const latest = useRef(value);
  const persisted = useRef(saved);
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stopped = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const saveRef = useRef(save);
  const sameRef = useRef(same);
  const again = useRef<() => void>(() => undefined);

  useEffect(() => {
    latest.current = value;
    saveRef.current = save;
    sameRef.current = same;
  });

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    if (stopped.current || sameRef.current(latest.current, persisted.current)) return;
    const snapshot = latest.current;
    setStatus("saving");
    const run = (async () => {
      try {
        await saveRef.current(snapshot);
        persisted.current = snapshot;
        if (sameRef.current(latest.current, snapshot)) setStatus("saved");
        else {
          setStatus("dirty");
          timer.current = window.setTimeout(() => again.current(), 300);
        }
      } catch (e) {
        stopped.current = e instanceof ApiError && e.status === 409;
        setStatus(stopped.current ? "conflict" : "error");
        // 네트워크가 잠깐 끊긴 경우 등은 조금 뒤에 다시 시도한다. 409 는 사용자가 고를 때까지 멈춘다.
        if (!stopped.current) timer.current = window.setTimeout(() => again.current(), 5000);
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
  }, []);

  useEffect(() => {
    again.current = () => void flush();
  }, [flush]);

  // 값이 바뀌면 잠시 뒤 저장한다.
  useEffect(() => {
    if (stopped.current || same(value, persisted.current)) return;
    setStatus((s) => (s === "saving" || s === "conflict" ? s : "dirty"));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), delay);
    return () => window.clearTimeout(timer.current);
  }, [value, delay, flush, same]);

  // 앱이 백그라운드로 가거나 화면을 떠나면 대기 없이 저장한다(모바일에서 탭이 곧 죽을 수 있다).
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void flush();
    };
  }, [flush]);

  /** 충돌을 풀고 서버 값을 기준으로 다시 시작한다. */
  const reset = useCallback((serverValue: T) => {
    persisted.current = serverValue;
    stopped.current = false;
    setStatus(sameRef.current(latest.current, serverValue) ? "saved" : "dirty");
  }, []);

  return { status, flush, reset };
}
