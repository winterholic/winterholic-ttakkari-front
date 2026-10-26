import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { getDashboard, getResearchScope, getSnapshot, getTaxonomy, normalizeAdapters } from './api';
import type { AdapterStatus, SnapshotExperiment, Taxonomy } from './types';

export const KEY = ['research'] as const;
/** 질의 키의 앞부분. 범위(개인/회사)가 바뀌면 같은 질의도 다른 캐시를 쓴다. 전체 무효화는 KEY 로 한다. */
export const rk = () => ['research', getResearchScope()] as const;

/** 분류 사전(코드 → 한국어 표시명). 서버 사전이 없거나 코드가 새로 생겼으면 코드를 그대로 보여 준다. */
export function useTaxonomy() {
  const q = useQuery({ queryKey: [...rk(), 'taxonomy'], queryFn: getTaxonomy, staleTime: 5 * 60_000 });
  const taxonomy: Taxonomy = useMemo(() => q.data ?? {}, [q.data]);
  const label = useCallback((axis: string, code: string) => taxonomy[axis]?.find(t => t.code === code)?.label_ko || taxonomy[axis]?.find(t => t.code === code)?.label || code, [taxonomy]);
  return { taxonomy, label, isPending: q.isPending, error: q.error };
}

/** 어댑터 준비 상태. 설계실·모니터·대시보드가 같은 값을 본다. */
export function useAdapters(studyId?: string | null) {
  const q = useQuery({ queryKey: [...rk(), 'dashboard', studyId ?? null], queryFn: () => getDashboard(studyId), staleTime: 10_000 });
  const adapters: AdapterStatus[] = normalizeAdapters(q.data?.host_readiness);
  return { adapters, dashboard: q.data, isPending: q.isPending, error: q.error, refetch: q.refetch };
}

/** 연구 한 건의 기록 전체(지식·근거·타임라인·실험 목록). 모니터·분석·기록 화면이 같은 캐시를 쓴다. */
export function useSnapshot(studyId?: string | null) {
  return useQuery({ queryKey: [...rk(), 'snapshot', studyId], queryFn: () => getSnapshot(studyId as string), enabled: !!studyId });
}
export const experimentName = (x: SnapshotExperiment) => x.name || x.title || x.id.slice(0, 8);

export { useDebounced } from '../../features/viewer/hooks';
