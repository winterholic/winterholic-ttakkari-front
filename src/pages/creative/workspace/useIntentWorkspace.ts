import { useCallback, useEffect, useRef, useState } from "react";
import { intentResolve } from "../../../api/creativeV2";
import type { IntentResolveRequest, IntentResolveResult } from "../../../api/creativeV2";
import { carryOpenChoices, dropTextDerived, forgetChoice } from "./intentModel";

export type WorkspaceDelta = Omit<IntentResolveRequest, "brief" | "intent" | "read_free_text"> & {
  /** 길이·비율을 새로 정할 때, 서버가 직전 값을 후보로 보지 않도록 잊고 보낸다. */
  forget?: Array<"duration" | "aspect">;
};

const BRIEF_DEBOUNCE_MS = 700;

/**
 * 제작 의도 워크스페이스 상태. 서버(resolve)가 정본이고 화면은 마지막 응답을 그대로 그린다.
 * 요청은 하나씩 순서대로 보낸다. 응답의 intent를 다음 요청에 이어 보내야 해서, 동시에 보내면 앞선 변경을 덮어쓴다.
 */
export function useIntentWorkspace(debounceMs = BRIEF_DEBOUNCE_MS) {
  const [brief, setBriefState] = useState("");
  const [result, setResult] = useState<IntentResolveResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(0);
  const briefRef = useRef("");
  const sentBrief = useRef("");
  const resultRef = useRef<IntentResolveResult | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const send = useCallback((delta: WorkspaceDelta = {}) => {
    setPending((n) => n + 1);
    chain.current = chain.current.then(async () => {
      try {
        const { forget, ...rest } = delta;
        const text = briefRef.current;
        let intent = resultRef.current?.intent ?? null;
        if (intent && text !== sentBrief.current) intent = dropTextDerived(intent);
        for (const kind of forget ?? []) if (intent) intent = forgetChoice(intent, kind);
        const structured = { ...carryOpenChoices(intent), ...rest.structured };
        const next = await intentResolve({ ...rest, structured: Object.keys(structured).length ? structured : undefined, brief: text, intent, read_free_text: true });
        sentBrief.current = text;
        resultRef.current = next;
        if (alive.current) { setResult(next); setError(null); }
      } catch (e) {
        if (alive.current) setError(e);
      } finally {
        if (alive.current) setPending((n) => n - 1);
      }
    });
  }, []);

  const setBrief = useCallback((text: string) => {
    briefRef.current = text;
    setBriefState(text);
  }, []);

  // 문장을 고치면 잠깐 기다렸다가 다시 읽는다. 지금까지 한 번도 보내지 않았고 비어 있으면 보내지 않는다.
  useEffect(() => {
    if (brief === sentBrief.current) return;
    if (!brief.trim() && !resultRef.current) return;
    const timer = setTimeout(() => { if (briefRef.current !== sentBrief.current) send(); }, debounceMs);
    return () => clearTimeout(timer);
  }, [brief, send, debounceMs]);

  const reset = useCallback(() => {
    resultRef.current = null;
    sentBrief.current = "";
    briefRef.current = "";
    setBriefState("");
    setResult(null);
    setError(null);
  }, []);

  return { brief, setBrief, result, error, pending, busy: pending > 0, send, reset };
}
