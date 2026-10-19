import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { GamePlay } from "../../api/gameTypes";
import { acceptReadyMessage, clearSave, isEmptySave, readSave, requestSaveExport, requestSaveImport, writeSave } from "./gameSave";
import type { SavedGame } from "./gameSave";

export const AUTOSAVE_MS = 5_000;
/** 게임이 ready 신호를 보내지 않는 이전 템플릿 빌드는 로드 뒤 이 시간이 지나면 한 번 불러오기를 시도한다. */
export const IMPORT_FALLBACK_MS = 2_500;

/**
 * 게임의 save 저장소를 이 기기에 보관한다(back ADR 0057). 게임이 부팅하면(ready 신호 또는 폴백) 저장된 세이브를 넣어 주고,
 * 보이는 동안 주기적으로 내보내 바뀐 값만 저장한다. 빈 세이브는 저장하지 않아 불러오기 전 상태가 실제 저장을 지우지 못한다.
 */
export function useGameSave(gameId: string, frameRef: RefObject<HTMLIFrameElement | null>, play: GamePlay | undefined, active: boolean) {
  // 게임이 바뀌면 그 게임의 슬롯을 다시 읽는다(효과 안에서 setState 하지 않고 렌더에서 고른다)
  const [store, setStore] = useState<{ id: string; saved: SavedGame | null }>(() => ({ id: gameId, saved: readSave(gameId) }));
  const saved = store.id === gameId ? store.saved : readSave(gameId);
  const setSaved = useCallback((s: SavedGame | null) => setStore({ id: gameId, saved: s }), [gameId]);
  const last = useRef<string | null>(null);
  const imported = useRef(false);
  const origin = play?.origin;
  const buildSeq = play?.build_seq ?? null;
  const url = play?.url;

  useEffect(() => {
    if (!active || !origin || !url) return undefined;
    imported.current = false;
    last.current = readSave(gameId)?.data ?? null;
    let stopped = false;
    const frame = () => frameRef.current;

    const importOnce = () => {
      const f = frame();
      if (stopped || imported.current || !f) return;
      imported.current = true;
      const s = readSave(gameId);
      if (s) void requestSaveImport(f, origin, s.data).catch(() => undefined);
    };
    const flush = async () => {
      const f = frame();
      if (stopped || !f || !imported.current) return;
      try {
        const data = await requestSaveExport(f, origin);
        if (stopped || isEmptySave(data) || data === last.current) return;
        if (writeSave(gameId, data, buildSeq)) {
          last.current = data;
          setSaved(readSave(gameId));
        }
      } catch {
        // 게임이 응답하지 않으면(부팅 중·이전 템플릿) 다음 주기에 다시 시도한다
      }
    };

    const onMessage = (event: MessageEvent) => {
      const f = frame();
      if (f && acceptReadyMessage(event, { frameWindow: f.contentWindow, gameOrigin: origin })) importOnce();
    };
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    const fallback = setTimeout(importOnce, IMPORT_FALLBACK_MS);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void flush(); }, AUTOSAVE_MS);
    return () => {
      stopped = true;
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      clearTimeout(fallback);
      clearInterval(timer);
    };
  }, [active, origin, url, gameId, buildSeq, frameRef, setSaved]);

  /** 저장된 세이브를 지우고, 열려 있는 게임의 메모리 세이브도 비운다(안 비우면 다음 주기에 다시 저장된다). */
  const clear = useCallback(async () => {
    clearSave(gameId);
    last.current = null;
    setSaved(null);
    const f = frameRef.current;
    if (f && origin) await requestSaveImport(f, origin, "{}").catch(() => undefined);
  }, [gameId, origin, frameRef, setSaved]);

  return { saved, clear };
}
