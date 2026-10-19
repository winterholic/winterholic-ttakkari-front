import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getNotebook, getNotebookLMStatus, listNotebookJobs, listNotebooks } from "../../api/client";
import type { NlmAuthStatus } from "../../api/notebooklmTypes";
import { jobActive } from "./labels";

export const nlmKeys = {
  status: ["notebooklm", "status"] as const,
  notebooks: ["notebooklm", "notebooks"] as const,
  notebook: (id: string) => ["notebooklm", "notebook", id] as const,
  jobs: ["notebooklm", "jobs"] as const,
};

/** 마지막으로 알려진 상태만 읽는다(브라우저·Google 요청 없음). 로그인 창이 열려 있는 동안만 주기적으로 다시 읽는다. */
export function useNotebookLMStatus() {
  return useQuery({
    queryKey: nlmKeys.status,
    queryFn: getNotebookLMStatus,
    refetchInterval: (q) => (q.state.data?.login.active ? 3000 : false),
  });
}

/** 연결됨일 때만 Google 에 닿는 목록을 읽는다. 로그인이 필요하거나 쿨다운 중이면 요청 자체를 만들지 않는다. */
export const isConnected = (s: NlmAuthStatus | undefined): boolean => s?.state === "ready";

export function useNotebookList(enabled: boolean) {
  return useQuery({ queryKey: nlmKeys.notebooks, queryFn: listNotebooks, enabled, retry: false });
}

export function useNotebookDetail(id: string, enabled: boolean) {
  return useQuery({ queryKey: nlmKeys.notebook(id), queryFn: () => getNotebook(id), enabled, retry: false });
}

/** 소스 등록 job. 진행 중인 job 이 하나라도 있을 때만 폴링하고, 모두 끝나면 멈춘다. */
export function useNotebookJobs(notebookId: string, enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: nlmKeys.jobs,
    queryFn: () => listNotebookJobs(20),
    enabled,
    retry: false,
    refetchInterval: (q) => (q.state.data?.some((j) => j.notebook_id === notebookId && jobActive(j)) ? 2500 : false),
  });
  const seenActive = useRef(new Set<string>());
  useEffect(() => {
    let finished = false;
    for (const j of query.data ?? []) {
      if (j.notebook_id !== notebookId) continue;
      if (jobActive(j)) seenActive.current.add(j.id);
      else if (seenActive.current.delete(j.id)) finished = true;
    }
    // 진행 중이던 작업이 끝난 순간 소스 목록을 새로 읽는다.
    if (finished) void qc.invalidateQueries({ queryKey: nlmKeys.notebook(notebookId) });
  }, [query.data, notebookId, qc]);
  return query;
}

/** until 까지 남은 초. 0 이 되면 onZero 를 한 번 부른다. */
export function useCountdown(until: string | null | undefined, onZero?: () => void): number | null {
  const target = until ? Date.parse(until) : NaN;
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const cb = useRef(onZero);
  useEffect(() => {
    cb.current = onZero;
  });
  useEffect(() => {
    fired.current = false;
    if (!Number.isFinite(target)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  const left = Number.isFinite(target) ? Math.max(0, Math.ceil((target - now) / 1000)) : null;
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      cb.current?.();
    }
  }, [left]);
  return left;
}
