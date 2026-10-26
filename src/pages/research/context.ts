import type { ViewId } from './labels';
import type { Study } from './types';

/** URL 쿼리(view/study/method/experiment/run)와 연구 목록을 뷰들이 같이 쓴다. */
export interface ResearchCtx {
  view: ViewId;
  scope: 'personal' | 'work';
  studyId: string | null;
  methodSlug: string | null;
  experimentId: string | null;
  runId: string | null;
  params: URLSearchParams;
  studies: Study[];
  study: Study | null;
  /** null 값은 쿼리에서 지운다. replace 는 필터처럼 기록을 쌓지 않을 때. */
  go: (patch: Record<string, string | null>, opts?: { replace?: boolean }) => void;
  openStudyForm: () => void;
}
