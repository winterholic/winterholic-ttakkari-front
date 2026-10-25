import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { PageHeader } from '../shell/PageHeader';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { errorText, listStudies, setResearchScope, type ResearchScope } from './research/api';
import { StudyFormModal } from './research/components/RecordForms';
import { Callout } from './research/components/parts';
import type { ResearchCtx } from './research/context';
import { KEY } from './research/hooks';
import { isView, VIEWS, type ViewId } from './research/labels';
import { DashboardView } from './research/views/DashboardView';
import { ExperimentDesignerView } from './research/views/ExperimentDesignerView';
import { ExperimentMonitorView } from './research/views/ExperimentMonitorView';
import { MethodLibraryView } from './research/views/MethodLibraryView';
import { ResultAnalysisView } from './research/views/ResultAnalysisView';
import { StudyRecordsView } from './research/views/StudyRecordsView';
import './research.css';

// 방법·실험·실행 쿼리는 화면을 옮길 때 같이 들고 가면 엉뚱한 곳에서 다시 열리므로 화면별로 정리한다.
const KEEPS_METHOD: ViewId[] = ['library', 'designer'];

/** 연구소 껍데기: 연구 선택(컨텍스트 바)과 6개 화면 탭, URL 쿼리(view/study/method/experiment/run) 동기화만 맡는다. */
export function ResearchPage() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const studies = useQuery({ queryKey: [...KEY, 'studies'], queryFn: listStudies });
  const raw = params.get('view');
  const view: ViewId = isView(raw) ? raw : 'dashboard';
  const studyId = params.get('study');
  const study = studies.data?.find(s => s.id === studyId) ?? null;
  // 연구를 고르면 그 연구의 범위를, 아니면 화면의 범위 선택을 따른다. 질의 키가 범위를 품고 있어 바꾸면 캐시가 섞이지 않는다.
  const scope: ResearchScope = study ? (study.scope === 'work' ? 'work' : 'personal') : params.get('scope') === 'work' ? 'work' : 'personal';
  setResearchScope(scope);

  const go = useCallback<ResearchCtx['go']>((patch, opts) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if ('study' in patch && patch.study !== prev.get('study')) {
        if (!('experiment' in patch)) next.delete('experiment');
        if (!('run' in patch)) next.delete('run');
      }
      if ('view' in patch && patch.view !== (prev.get('view') ?? 'dashboard')) {
        if (!('run' in patch)) next.delete('run');
        if (!('method' in patch) && !KEEPS_METHOD.includes((patch.view ?? 'dashboard') as ViewId)) next.delete('method');
      }
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
      return next;
    }, { replace: opts?.replace });
  }, [setParams]);

  const ctx: ResearchCtx = useMemo(() => ({
    view, scope, studyId, methodSlug: params.get('method'), experimentId: params.get('experiment'), runId: params.get('run'), params,
    studies: studies.data ?? [], study, go, openStudyForm: () => setCreating(true),
  }), [view, scope, studyId, params, studies.data, study, go]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = VIEWS.findIndex(v => v.id === view);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? VIEWS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    const target = VIEWS[(n + VIEWS.length) % VIEWS.length].id;
    go({ view: target });
    requestAnimationFrame(() => document.getElementById(`rs-tab-${target}`)?.focus());
  };

  return <div className="tk-screen">
    <PageHeader title="AI Research Lab" meta={study ? study.title : '방법을 고르고, 실험하고, 결과를 비교하는 연구 공간'} />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg research">
      <div className="rs-context">
        <div className="tk-field rs-context__study"><label className="tk-label" id="rs-study-l" htmlFor="rs-study">연구</label>
          <Select id="rs-study" labelledBy="rs-study-l" value={studyId ?? ''} options={[{ value: '', label: studies.isPending ? '불러오는 중…' : '연구를 고르지 않음' }, ...(studies.data ?? []).map(s => ({ value: s.id, label: s.title }))]} onChange={v => go({ study: v || null })} /></div>
        <div className="tk-segmented rs-context__scope" role="radiogroup" aria-label="범위">
          <label><input type="radio" name="rs-scope" checked={scope === 'personal'} disabled={!!study} onChange={() => go({ scope: null })} />개인</label>
          <label><input type="radio" name="rs-scope" checked={scope === 'work'} disabled={!!study} onChange={() => go({ scope: 'work' })} />회사</label>
        </div>
        <Button onClick={() => setCreating(true)}>새 연구</Button>
      </div>
      {studies.error && <Callout kind="caution">{errorText(studies.error)} <Button size="sm" onClick={() => void studies.refetch()}>다시 불러오기</Button></Callout>}
      <div className="tk-tablist rs-tabs" role="tablist" aria-label="연구소 화면">
        {VIEWS.map(v => <button key={v.id} id={`rs-tab-${v.id}`} className="tk-tab" role="tab" aria-selected={view === v.id} aria-controls="rs-panel" tabIndex={view === v.id ? 0 : -1} onClick={() => go({ view: v.id })} onKeyDown={onKey}>{v.label}</button>)}
      </div>
      <div className="tk-tabpanel rs-panel" role="tabpanel" id="rs-panel" aria-labelledby={`rs-tab-${view}`}>
        {view === 'dashboard' && <DashboardView ctx={ctx} />}
        {view === 'library' && <MethodLibraryView ctx={ctx} />}
        {view === 'designer' && <ExperimentDesignerView key={ctx.studyId ?? 'none'} ctx={ctx} />}
        {view === 'monitor' && <ExperimentMonitorView ctx={ctx} />}
        {view === 'analysis' && <ResultAnalysisView ctx={ctx} />}
        {view === 'records' && <StudyRecordsView ctx={ctx} />}
      </div>
    </div></div>
    {creating && <StudyFormModal onClose={() => setCreating(false)} onCreated={s => go({ study: s.id, view: view === 'dashboard' ? 'records' : view })} />}
  </div>;
}
