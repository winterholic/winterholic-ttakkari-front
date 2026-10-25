import { useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { Badge } from '../../../ui/Badge';
import { createExperiment, errorText, getMethod, validateExperiment } from '../api';
import { AdapterInputs } from '../components/AdapterInputs';
import { defaultValues, DynamicParameterForm } from '../components/DynamicParameterForm';
import { ProxyBadge } from '../components/ExecutionStatusBadge';
import { MethodPicker } from '../components/MethodPicker';
import { Callout, Chip, Empty } from '../components/parts';
import { ValidatePanel } from '../components/ValidatePanel';
import type { ResearchCtx } from '../context';
import { adapterNeeds, buildPayload, combinationChecks, initialDesign, localErrors, effectiveBudget, getAdapterMeasurableMetrics, mergeSpecs, metricChoices, suggestAdapter, unmeasurableMetrics, type DesignState } from '../designerModel';
import { DIRECTION_TEXT } from '../format';
import { KEY, useAdapters, useDebounced, rk } from '../hooks';
import { ADAPTER, STRATEGY, SWEEP_STRATEGIES, adapterLabel, getMetricInfo, metricLabel, resolveMetricKey } from '../labels';
import { ADAPTER_IDS, STRATEGIES, type MethodDetail, type Strategy } from '../types';

const SWEEP_HINT: Partial<Record<Strategy, string>> = {
  ab: '비교하고 싶은 파라미터에서 ‘값 여러 개 탐색’을 켜세요. 첫 번째 값이 기준(A), 나머지가 변경(B)입니다.',
  grid: '‘값 여러 개 탐색’을 켠 파라미터의 모든 조합을 실행합니다. 첫 조합이 기준 설정으로 표시됩니다.',
  random: '‘값 여러 개 탐색’을 켠 파라미터의 조합에서 중복 없이 뽑아 실행합니다. 첫 조합이 기준 설정으로 표시됩니다.',
  bayesian: '탐색할 파라미터의 후보 값을 넣으세요. optuna 가 설치되어 있어야 실행됩니다.',
  ablation: '요소를 끄고 켜는 파라미터에서 ‘값 여러 개 탐색’을 켜고 [켬, 끔] 순서로 두세요. 첫 값이 켠 상태(Full)입니다.',
};

function Step({ n, title, hint, done, children }: { n: number; title: string; hint?: ReactNode; done?: boolean; children: ReactNode }) {
  return <section className="rs-step" aria-labelledby={`step-${n}`}>
    <h3 id={`step-${n}`} className="rs-step__title"><span className="rs-step__no" data-done={done || undefined} aria-hidden="true">{done ? '✓' : n}</span>{title}</h3>
    {hint && <p className="rs-muted rs-step__hint">{hint}</p>}
    <div className="rs-step__body">{children}</div>
  </section>;
}

/** 실험 설계실: 목표→방법→실행기→조합→튜닝→입력→지표→예산을 차례로 정하고, 생성 전에 서버 검증 결과(확장될 설정 수·예산·경고)를 읽는다. JSON 은 고급 탭에만 있다. */
export function ExperimentDesignerView({ ctx }: { ctx: ResearchCtx }) {
  const cache = useQueryClient();
  const { adapters, dashboard } = useAdapters(ctx.studyId);
  const [slugs, setSlugs] = useState<string[]>(ctx.methodSlug && ctx.methodSlug !== 'new' ? [ctx.methodSlug] : []);
  const [design, setDesign] = useState<DesignState>(initialDesign);
  const [tab, setTab] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [error, setError] = useState('');

  const detailQs = useQueries({ queries: slugs.map(s => ({ queryKey: [...rk(), 'method', s], queryFn: () => getMethod(s), staleTime: 60_000 })) });
  const methods = detailQs.flatMap(q => (q.data ? [q.data] : [])) as MethodDetail[];
  const loadingMethods = detailQs.some(q => q.isPending);
  const adapterReady = (id: string) => id === 'external_report' || !!adapters.find(a => a.adapter_id === id)?.ready;

  // 파생 값: 사용자가 건드리지 않은 항목은 선택한 방법과 실행기에서 정한다
  const adapterId = design.adapterTouched ? design.adapterId : suggestAdapter(methods, adapterReady) || '';
  const { specs, owners } = useMemo(() => mergeSpecs(methods, adapterId), [methods, adapterId]);
  const params = useMemo(() => ({ values: { ...defaultValues(specs), ...design.params.values }, sweeps: design.params.sweeps }), [specs, design.params]);
  const metricCtx = useMemo(() => ({ params, inputs: design.inputs, extra: design.extra }), [params, design.inputs, design.extra]);
  const choices = useMemo(() => metricChoices(methods, adapterId, metricCtx), [methods, adapterId, metricCtx]);
  const unmeasured = useMemo(() => unmeasurableMetrics(methods, adapterId, metricCtx), [methods, adapterId, metricCtx]);
  const matchedPrimary = choices.includes(design.primaryMetric)
    ? design.primaryMetric
    : resolveMetricKey(design.primaryMetric, choices);
  const primaryMetric = matchedPrimary
    ? matchedPrimary
    : design.adapterId === 'external_report' || adapterId === 'external_report'
    ? design.primaryMetric
    : choices[0] ?? '';
  const budget = effectiveBudget({ ...design, adapterId });
  const eff: DesignState = { ...design, adapterId, primaryMetric, params, budget, name: design.name.trim() || (methods[0] ? `${methods[0].name_ko || methods[0].name} · ${STRATEGY[design.strategy].label}` : '') };
  const adapter = adapters.find(a => a.adapter_id === adapterId);
  const sweepEnabled = SWEEP_STRATEGIES.includes(design.strategy);
  const checks = useMemo(() => combinationChecks(methods), [methods]);
  const errs = localErrors(eff, specs, methods);
  const set = (patch: Partial<DesignState>) => setDesign(d => ({ ...d, ...patch }));

  const payload = ctx.studyId ? buildPayload(ctx.studyId, methods, eff, specs) : null;
  const payloadKey = JSON.stringify(payload);
  const debounced = useDebounced(payloadKey, 600);
  const canValidate = !!ctx.studyId && !!adapterId && (methods.length > 0 || adapterId === 'external_report') && !loadingMethods;
  const validate = useQuery({
    queryKey: [...rk(), 'validate', debounced], queryFn: () => validateExperiment(JSON.parse(debounced)), enabled: canValidate && debounced === payloadKey, placeholderData: keepPreviousData, retry: false, staleTime: 0,
  });

  const create = useMutation({
    mutationFn: async (autoStart: boolean) => {
      if (!ctx.studyId || !payload) throw new Error('연구를 먼저 선택하세요.');
      return createExperiment(ctx.studyId, { ...payload, name: eff.name, hypothesis: design.hypothesis.trim(), rationale: design.rationale.trim(), auto_start: autoStart });
    },
    onSuccess: r => { void cache.invalidateQueries({ queryKey: KEY }); ctx.go({ view: 'monitor', experiment: r.experiment.id, method: null }); },
  });
  const blocked = errs.length > 0 || (validate.data ? !validate.data.valid : false) || checks.some(c => c.tone === 'danger');
  const submit = (auto: boolean) => { setError(''); create.mutate(auto, { onError: e => setError(errorText(e)) }); };

  function openJson() {
    setJsonText(JSON.stringify(payload ?? {}, null, 2)); setJsonError(''); setTab('json');
  }
  function applyJson() {
    try {
      const v = JSON.parse(jsonText) as Partial<ReturnType<typeof buildPayload>>;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('JSON 객체가 필요합니다.');
      const values: Record<string, unknown> = {}; const sweeps: Record<string, unknown[]> = {}; const extra: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v.search_space ?? {})) {
        const sp = specs.find(s => s.key === k);
        if (!sp) { extra[k] = val; continue; }
        const arrayValued = sp.type === 'range' || sp.type === 'multi_enum';
        if (Array.isArray(val) && (!arrayValued || val.every(Array.isArray))) sweeps[k] = val; else values[k] = val;
      }
      setDesign(d => ({ ...d, adapterId: v.adapter_id ?? d.adapterId, adapterTouched: true, strategy: (v.strategy as Strategy) ?? d.strategy, params: { values, sweeps }, extra, inputs: (v.fixed_inputs as Record<string, unknown>) ?? d.inputs,
        primaryMetric: v.primary_metric ?? d.primaryMetric, secondary: v.secondary_metrics ?? d.secondary, budget: { ...d.budget, ...(v.budget ?? {}) } }));
      const ids = [v.method_id, ...(v.compared_method_ids ?? [])].filter((x): x is string => !!x);
      if (ids.length) setSlugs(ids);
      setJsonError(''); setTab('form');
    } catch (e) { setJsonError(e instanceof Error ? e.message : 'JSON 을 읽지 못했습니다.'); }
  }

  if (!ctx.studyId) return <Empty title="실험을 설계할 연구를 먼저 고르세요"
    action={<div className="rs-actions"><Button variant="primary" onClick={ctx.openStudyForm}>새 연구 만들기</Button></div>}>
    위의 연구 선택에서 기존 연구를 고르거나 새 연구를 만드세요. 실험은 연구의 목표 아래에서 만들어지고 기록됩니다.</Empty>;

  const hasSweep = Object.keys(params.sweeps).length > 0;
  const adapterFor = (id: string) => adapters.find(a => a.adapter_id === id);

  return <div className="rs-designer">
    <div className="rs-designer__main">
      <div className="tk-segmented rs-designer__tabs" role="radiogroup" aria-label="설계 방식">
        <label><input type="radio" name="dtab" checked={tab === 'form'} onChange={() => setTab('form')} />폼으로 설계</label>
        <label><input type="radio" name="dtab" checked={tab === 'json'} onChange={openJson} />고급 (JSON)</label>
      </div>

      {tab === 'json' ? <div className="rs-form">
        <Callout kind="warning" title="전문가용 편집">서버에 보내는 검증 페이로드입니다. 폼에서 정한 값이 그대로 들어 있고, 고친 뒤 ‘폼에 적용’하면 폼이 이 값으로 바뀝니다.</Callout>
        <div className="tk-field"><label className="tk-label" htmlFor="json-edit">검증 페이로드 (JSON)</label>
          <textarea id="json-edit" className="tk-textarea tk-input--mono rs-json" rows={22} value={jsonText} onChange={e => setJsonText(e.target.value)} spellCheck={false} aria-invalid={!!jsonError || undefined} />
          {jsonError && <p className="tk-error">{jsonError}</p>}</div>
        <div className="rs-actions"><Button variant="primary" onClick={applyJson}>폼에 적용</Button><Button variant="ghost" onClick={() => setTab('form')}>취소</Button></div>
      </div> : <>
        <Step n={1} title="목표와 가설" done={!!ctx.study} hint="이 실험이 연구 목표의 어느 질문에 답하는지 적어 두면 결과를 읽을 때 기준이 됩니다.">
          <p className="rs-goal"><span className="rs-muted">연구 목표</span><br />{ctx.study?.goal ?? '—'}</p>
          <div className="tk-field"><label className="tk-label" htmlFor="d-name">실험 이름</label><input id="d-name" className="tk-input" value={design.name} placeholder={eff.name || '예: KV 캐시 양자화 속도·메모리 비교'} onChange={e => set({ name: e.target.value })} maxLength={200} /></div>
          <div className="tk-field"><label className="tk-label" htmlFor="d-hyp">검증할 가설 <span className="tk-label__optional">선택</span></label><textarea id="d-hyp" className="tk-textarea" rows={3} value={design.hypothesis} onChange={e => set({ hypothesis: e.target.value })} placeholder="예: q8_0 KV 캐시는 품질 손실 없이 메모리를 줄인다." /></div>
          <div className="tk-field"><label className="tk-label" htmlFor="d-why">이 방법을 고른 이유 <span className="tk-label__optional">선택</span></label><textarea id="d-why" className="tk-textarea" rows={2} value={design.rationale} onChange={e => set({ rationale: e.target.value })} placeholder="대안과 비교한 근거, 기대하는 효과" /></div>
        </Step>

        <Step n={2} title="방법 선택 (복수 가능)" done={methods.length > 0} hint="첫 번째 방법이 주 방법입니다. 둘 이상 고르면 조합 효과를 별도 실험으로 확인합니다.">
          <MethodPicker selected={methods} loading={loadingMethods} onAdd={s => setSlugs(l => (l.includes(s) ? l : [...l, s]))}
            onRemove={id => setSlugs(l => l.filter(s => { const m = methods.find(x => x.id === id); return !m || (s !== m.slug && s !== m.id); }))}
            onPrimary={id => { const m = methods.find(x => x.id === id); if (m) setSlugs(l => [m.slug, ...l.filter(s => s !== m.slug)]); }} />
        </Step>

        <Step n={3} title="조합 점검" done={methods.length > 1 && !checks.some(c => c.tone === 'danger')} hint="선택한 방법 사이의 충돌·선후 관계입니다.">
          {methods.length < 2 ? <p className="rs-muted">방법이 하나라서 조합 점검은 없습니다.</p> : <ul className="rs-checks">{checks.map((c, i) => <li key={i} data-tone={c.tone}><span className="rs-checks__mark" aria-hidden="true">{c.tone === 'danger' ? '✕' : c.tone === 'warning' ? '!' : c.tone === 'success' ? '✓' : 'i'}</span><span><span className="tk-sr-only">{c.tone === 'danger' ? '충돌: ' : c.tone === 'warning' ? '주의: ' : ''}</span>{c.text}</span></li>)}</ul>}
          {methods.filter(m => m.execution_status === 'partially_supported' && m.unsupported_params?.length).map(m => <Callout key={m.id} kind="warning" title={`「${m.name_ko || m.name}」은(는) 일부만 지원됩니다`}>실행되지 않거나 대체되는 파라미터: {m.unsupported_params?.join(', ')}</Callout>)}
        </Step>

        <Step n={4} title="실행기와 실험 방식" done={!!adapterId} hint="어떤 도구로 실행하고, 설정을 어떻게 만들어 비교할지 정합니다.">
          <fieldset className="tk-fieldset"><legend>실행기</legend>
            <div className="rs-adapters" role="radiogroup" aria-label="실행기">{ADAPTER_IDS.map(id => {
              const st = adapterFor(id); const ready = adapterReady(id);
              const hinted = methods[0]?.adapter_hints?.includes(id);
              return <label key={id} className="rs-adapter" data-ready={ready ? 'true' : 'false'}>
                <input type="radio" name="adapter" checked={adapterId === id} onChange={() => set({ adapterId: id, adapterTouched: true })} />
                <span><strong>{adapterLabel(id)}</strong> {id === 'external_report' ? <Badge tone="warning">실측 아님</Badge> : st ? (ready ? <Badge tone="success">준비됨</Badge> : <Badge tone="danger">사용 불가</Badge>) : <Badge>상태 미확인</Badge>}{hinted && <> <Badge tone="info">이 방법의 후보</Badge></>}
                  <span className="rs-adapter__hint">{ADAPTER[id].hint}</span>{st && !st.ready && st.reason && <span className="rs-reason">{st.reason}</span>}</span>
              </label>;
            })}</div></fieldset>
          {adapterId && methods[0] && !methods[0].adapter_hints?.includes(adapterId) && methods[0].adapter_hints?.length > 0 && <Callout kind="warning">주 방법의 연결 후보 실행기({methods[0].adapter_hints.map(adapterLabel).join(', ')})와 다릅니다. 지원되지 않는 파라미터는 무시됩니다.</Callout>}
          <div className="tk-field"><label className="tk-label" id="d-strat-l" htmlFor="d-strat">실험 방식</label>
            <Select id="d-strat" labelledBy="d-strat-l" value={design.strategy} options={STRATEGIES.map(s => ({ value: s, label: STRATEGY[s].label }))} onChange={v => set({ strategy: v })} />
            <p className="tk-help">{STRATEGY[design.strategy].hint}</p></div>
          {design.strategy === 'repeat' && <div className="tk-field"><label className="tk-label" htmlFor="d-rep">반복 횟수</label><input id="d-rep" className="tk-input" type="number" min={1} max={10} value={design.repeats} onChange={e => set({ repeats: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /><p className="tk-help">같은 설정을 이 횟수만큼 실행해 변동성을 봅니다. 1~10회.</p></div>}
          {['ab', 'grid', 'random', 'bayesian', 'ablation'].includes(design.strategy) && !hasSweep && <p className="rs-muted">다음 단계에서 ‘값 여러 개 탐색’을 켠 파라미터가 비교할 설정이 됩니다. 켜지 않으면 설정이 하나뿐입니다.</p>}
        </Step>

        <Step n={5} title="파라미터 튜닝" done={methods.length > 0} hint={sweepEnabled ? SWEEP_HINT[design.strategy] ?? '' : '이 실험 방식은 설정 하나를 쓰므로 고정값만 정합니다.'}>
          <DynamicParameterForm specs={specs} state={params} onChange={p => setDesign(d => ({ ...d, params: p }))} sweepEnabled={sweepEnabled} supported={adapter?.supported_parameters} owners={owners} />
        </Step>

        <Step n={6} title="실험 입력" done={adapterId === 'external_report' || (adapterId !== 'llm_inference' || !!String(design.inputs.prompt ?? '').trim())} hint="모든 설정이 같은 입력으로 측정되어야 비교할 수 있습니다.">
          <AdapterInputs adapterId={adapterId} inputs={design.inputs} onChange={inputs => set({ inputs })} />
          <div className="tk-field"><label className="tk-label" htmlFor="d-ds">데이터셋 버전 <span className="tk-label__optional">선택</span></label><input id="d-ds" className="tk-input" value={design.datasetVersion} onChange={e => set({ datasetVersion: e.target.value })} placeholder="예: ko-tech-v2" /><p className="tk-help">기록해 두면 나중에 다른 입력으로 한 실험과 섞어 비교하는 것을 막아 줍니다.</p></div>
        </Step>

        <Step n={7} title="지표와 방향" done={!!primaryMetric || adapterId === 'external_report'} hint="무엇에 대해 ‘좋다’고 말할지 정합니다. 최적은 이 지표와 제약에 종속됩니다.">
          {adapterId === 'external_report' ? <p className="rs-muted">외부 결과는 실험을 만든 뒤 측정값과 방향을 직접 입력합니다.</p> : <>
            <div className="tk-field"><label className="tk-label" id="d-pm-l" htmlFor="d-pm">주요 지표</label>
              <Select id="d-pm" labelledBy="d-pm-l" value={primaryMetric} options={choices.map(k => ({ value: k, label: metricLabel(k) }))} onChange={v => set({ primaryMetric: v })} />
              {(() => {
                const info = getMetricInfo(primaryMetric);
                return info ? <p className="tk-help">{DIRECTION_TEXT[info.direction]}{info.unit ? ` · 단위 ${info.unit}` : ''} {info.proxy && <ProxyBadge metricKey={primaryMetric} />}</p> : null;
              })()}</div>
            <fieldset className="tk-fieldset"><legend>함께 볼 지표</legend><div className="tk-chips tk-chips--wrap">{choices.filter(k => k !== primaryMetric).map(k => {
              const info = getMetricInfo(k);
              return <Chip key={k} pressed={design.secondary.includes(k)} onClick={() => set({ secondary: design.secondary.includes(k) ? design.secondary.filter(x => x !== k) : [...design.secondary, k] })}>{metricLabel(k)}{info?.proxy ? ' (간접)' : ''}</Chip>;
            })}</div>
              <p className="tk-help">속도만 보면 품질 손실을, 메모리만 보면 속도 손실을 놓칩니다. 상충할 수 있는 지표를 같이 고르세요.</p>
              {unmeasured.length > 0 && <p className="tk-help">방법이 권장하지만 이 실행기는 측정하지 않는 지표: {unmeasured.join(', ')}. 필요하면 외부 결과로 따로 등록하세요.</p>}
              {adapterId === 'retrieval_eval' && getAdapterMeasurableMetrics(adapterId, metricCtx).isSweepK && (
                <Callout kind="note" title="평가 k 탐색(Sweep) 안내">평가 k를 여러 값으로 탐색하는 경우, 각 k별 지표(Recall@k 등)는 해당 k 실행에만 측정됩니다. 모든 설정을 공통 축에서 비교하려면 질의 지연 시간 등 공통 지표를 보조 지표로 함께 확인하세요.</Callout>
              )}
            </fieldset></>}
        </Step>

        <Step n={8} title="실행 환경 확인과 예산" done={adapterReady(adapterId)} hint="조합이 폭발하거나 자원을 넘는 실험은 생성 전에 막습니다.">
          <div className="rs-envcheck" data-ready={adapterReady(adapterId) ? 'true' : 'false'}>
            <strong>{adapterId ? adapterNeeds(adapterId) : '실행기 미선택'}</strong>{' '}
            {adapterId === 'external_report' ? <Badge tone="warning">직접 실행하지 않음</Badge> : adapter ? (adapter.ready ? <Badge tone="success">준비됨</Badge> : <Badge tone="danger">준비 안 됨</Badge>) : <Badge>상태를 받지 못함</Badge>}
            {adapter?.reason && <p className="rs-reason">{adapter.reason}</p>}
            {!!adapter?.available_models?.length && <p className="rs-muted">사용 가능한 모델: {adapter.available_models.join(', ')}</p>}
            {dashboard?.gpu_lease && adapterId === 'llm_inference' && <p className="rs-muted">{dashboard.gpu_lease.held ? '지금 호스트 GPU 를 다른 작업이 쓰고 있습니다. 실행은 그 작업이 끝날 때까지 기다릴 수 있습니다.' : '지금 호스트 GPU 를 쓰는 다른 작업이 없습니다.'}</p>}
            {adapterId === 'tts_synthesis' && (() => {
              const currentMode = String(params.values.mode ?? 'synthesize');
              const sweepModes = (params.sweeps.mode ?? []) as string[];
              const hasStt = currentMode === 'synthesize_and_stt' || sweepModes.includes('synthesize_and_stt');
              if (!hasStt) return null;
              const sttReady = adapter?.details?.stt_ready;
              if (sttReady === false) {
                return <Callout kind="warning" title="로컬 STT(Whisper) 엔진 준비 안 됨">로컬 STT 파이썬 실행기가 감지되지 않았습니다. synthesize_and_stt 실행 시 STT 재인식 단계에서 오류가 발생할 수 있습니다 (텍스트 정규화 및 음성 합성은 정상 실행됩니다).</Callout>;
              }
              if (sttReady === undefined) {
                return <p className="rs-muted">STT 엔진의 세부 준비 상태가 확인되지 않았습니다. STT 재인식 지표는 발음 명료도의 간접 대리 지표이며 사람 청취 품질(MOS)이 아닙니다.</p>;
              }
              return <p className="rs-muted">로컬 STT 엔진이 준비되어 발음 명료도 대리 지표(CER/WER)를 산출할 수 있습니다 (청취 품질은 별도 확인 필요).</p>;
            })()}
          </div>
          <div className="rs-form__grid">
            <div className="tk-field"><label className="tk-label" htmlFor="b-runs">최대 실행 수</label><input id="b-runs" className="tk-input" type="number" min={1} max={adapterId === 'llm_inference' ? 12 : 50} value={budget.max_runs} onChange={e => set({ budget: { ...budget, max_runs: Number(e.target.value) }, maxRunsTouched: true })} /><p className="tk-help">상한 {adapterId === 'llm_inference' ? 12 : 50}</p></div>
            <div className="tk-field"><label className="tk-label" htmlFor="b-sec">최대 총 시간 (초)</label><input id="b-sec" className="tk-input" type="number" min={1} max={3600} value={budget.max_total_seconds} onChange={e => set({ budget: { ...budget, max_total_seconds: Number(e.target.value) } })} /><p className="tk-help">상한 3,600초</p></div>
            <div className="tk-field"><label className="tk-label" htmlFor="b-mem">메모리 한도 (MB)</label><input id="b-mem" className="tk-input" type="number" min={64} value={budget.max_memory_mb} onChange={e => set({ budget: { ...budget, max_memory_mb: Number(e.target.value) } })} /></div>
            <div className="tk-field"><label className="tk-label" htmlFor="b-seed">시드</label><input id="b-seed" className="tk-input" type="number" value={design.seed} onChange={e => set({ seed: Number(e.target.value) })} /><p className="tk-help">같은 시드로 재현합니다</p></div>
          </div>
        </Step>
      </>}
    </div>

    <aside className="rs-designer__side" aria-label="검증과 생성">
      <ValidatePanel result={canValidate ? validate.data : undefined} pending={canValidate && validate.isFetching} error={validate.error ? errorText(validate.error) : undefined}
        budget={budget} stale={debounced !== payloadKey} localErrors={errs} />
      {error && <Callout kind="caution">{error}</Callout>}
      <div className="rs-actions rs-designer__go">
        <Button variant="primary" busy={create.isPending} disabled={blocked || !canValidate || adapterId === 'external_report'} onClick={() => submit(true)}>만들고 바로 실행</Button>
        <Button busy={create.isPending} disabled={blocked || !canValidate} onClick={() => submit(false)}>{adapterId === 'external_report' ? '실험 만들고 결과 입력하기' : '실험만 만들기'}</Button>
      </div>
      {blocked && canValidate && <p className="rs-muted">충돌·오류가 있는 동안에는 만들 수 없습니다.</p>}
      {adapterId === 'external_report' && <p className="rs-muted">외부 결과는 실행 없이 만든 뒤, 모니터 화면에서 측정값을 입력합니다.</p>}
    </aside>
  </div>;
}

