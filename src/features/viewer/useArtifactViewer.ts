import { useCallback } from "react";
import { useSearchParams } from "react-router";

/** 결과물 열기 계약(디자인 시스템 docs/19 §5): URL 쿼리 ?artifact=<id>. 열 때 push, 닫을 때 history.back(). */
export function useArtifactViewer() {
  const [params, setParams] = useSearchParams();
  const current = params.get("artifact");
  const open = useCallback(
    (id: string) => {
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set("artifact", id);
        return next;
      });
    },
    [setParams],
  );
  const close = useCallback(() => {
    if (window.history.state?.idx > 0) window.history.back();
    else
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.delete("artifact");
        return next;
      }, { replace: true });
  }, [setParams]);
  return { current, open, close };
}
