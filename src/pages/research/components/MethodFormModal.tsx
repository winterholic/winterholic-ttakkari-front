import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Select } from '../../../ui/Select';
import { createMethod, errorText, getExperiment, promoteMethod } from '../api';
import { useTaxonomy, KEY, rk } from '../hooks';
import { EXECUTION, METRICS, adapterLabel, AXIS_LABEL } from '../labels';
import { ADAPTER_IDS, AXES, type AxisKey, type EvidenceItem, type Method, type MethodDetail, type MethodInput, type ParamSpec, type ParamType } from '../types';
import { ExecutionStatusBadge } from './ExecutionStatusBadge';
import { Callout, Chip } from './parts';

const PARAM_TYPES: { value: ParamType; label: string }[] = [
  { value: 'number', label: '실수' }, { value: 'integer', label: '정수' }, { value: 'range', label: '구간' }, { value: 'enum', label: '단일 선택' }, { value: 'boolean', label: '켜기/끄기' },
  { value: 'multi_enum', label: '다중 선택' }, { value: 'model', label: '모델' }, { value: 'dataset', label: '데이터셋' }, { value: 'file', label: '파일' }, { value: 'environment', label: '실행 환경' }, { value: 'text', label: '문자열·사전' },
];
const HARDWARE = ['apple_silicon', 'cpu', 'cuda'];

const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean);

/** 한글 이름만 있어도 slug 를 만든다. 영문 이름이 있으면 그것을, 없으면 시각으로. */
export function makeSlug(name: string) {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (ascii || `hypothesis-${Date.now().toString(36)}`).slice(0, 100);
}

interface ParamDraft { key: string; label: string; type: ParamType; default: string; options: string; min: string; max: string; unit: string; advanced: boolean; sweepable: boolean; description: string }
const blankParam = (): ParamDraft => ({ key: '', label: '', type: 'number', default: '', options: '', min: '', max: '', unit: '', advanced: false, sweepable: true, description: '' });

function toSpec(d: ParamDraft): ParamSpec {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const opts = d.options.split(',').map(x => x.trim()).filter(Boolean);
  let def: unknown = d.default.trim() === '' ? null : d.default;
  if (def !== null && (d.type === 'number' || d.type === 'integer')) def = Number(def);
  if (def !== null && d.type === 'boolean') def = d.default === 'true';
  return { key: d.key.trim(), label: d.label.trim() || d.key.trim(), type: d.type, default: def, required: false, min: num(d.min), max: num(d.max), step: null, options: opts.length ? opts : null, unit: d.unit.trim() || null, description: d.description.trim(), advanced: d.advanced, sweepable: d.sweepable };
}

interface CreateProps { open: boolean; onClose: () => void; studyId?: string | null; onCreated?: (m: Method) => void; onDesign?: (m: Method) => void }

/** 시나리오 D: 카탈로그에 없는 방법·가설을 등록한다. 등록하면 서버가 실행 가능 상태를 계산해 돌려주므로, 그 결과(가설 단계·어댑터 필요 등)와 필요한 조치를 바로 보여 준다. */
export function MethodFormModal({ open, onClose, studyId, onCreated, onDesign }: CreateProps) {
  const cache = useQueryClient();
  const { taxonomy, label } = useTaxonomy();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [summary, setSummary] = useState('');
  const [principle, setPrinciple] = useState('');
  const [picked, setPicked] = useState<Record<AxisKey, string[]>>({ target: [], layer: [], goal: [], intervention: [], research_method: [] });
  const [metrics, setMetrics] = useState<string[]>([]);
  const [customMetric, setCustomMetric] = useState('');
  const [params, setParams] = useState<ParamDraft[]>([]);
  const [hardware, setHardware] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [effects, setEffects] = useState('');
  const [sides, setSides] = useState('');
  const [refs, setRefs] = useState<EvidenceItem[]>([]);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Method | null>(null);

  const save = useMutation({
    mutationFn: (body: MethodInput) => createMethod(body),
    onSuccess: m => { setCreated(m); void cache.invalidateQueries({ queryKey: KEY }); onCreated?.(m); },
  });
  const valid = name.trim() && summary.trim() && picked.target.length && picked.layer.length && picked.goal.length && params.every(p => p.key.trim());
  const toggle = (axis: AxisKey, code: string) => setPicked(p => ({ ...p, [axis]: p[axis].includes(code) ? p[axis].filter(c => c !== code) : [...p[axis], code] }));
  const patchParam = (i: number, v: Partial<ParamDraft>) => setParams(list => list.map((p, k) => (k === i ? { ...p, ...v } : p)));

  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!valid) { setError('이름, 한 줄 요약, 대상·계층·목표를 각각 하나 이상 고르세요.'); return; }
    save.mutate({
      slug: slug.trim() || makeSlug(nameEn || name), name: nameEn.trim() || name.trim(), name_ko: name.trim(), summary: summary.trim(), principle: principle.trim(),
      targets: picked.target, layers: picked.layer, goals: picked.goal, interventions: picked.intervention, research_methods: picked.research_method,
      parameters: params.map(toSpec), compatibility: { hardware, notes: notes.trim() }, metrics, expected_effects: lines(effects), side_effects: lines(sides),
      evidence: refs.filter(r => r.title?.trim() || r.url?.trim()), lifecycle_status: 'hypothesis', source_study_id: studyId ?? null, adapter_hints: adapters,
    }, { onError: err => setError(errorText(err)) });
  }

  if (created) return <Dialog open={open} onClose={onClose} size="lg" title="가설을 등록했습니다" modal>
    <CreatedGuide method={created} onClose={onClose} onDesign={onDesign} />
  </Dialog>;

  return <Dialog open={open} onClose={onClose} size="lg" title="새 방법·가설 등록" modal
    footer={<><Button variant="ghost" onClick={onClose}>닫기</Button><Button variant="primary" type="submit" form="method-form" busy={save.isPending} disabled={!valid}>가설로 등록</Button></>}>
    <form id="method-form" className="rs-form" onSubmit={submit} noValidate>
      <Callout kind="note" title="등록하면 먼저 ‘가설’ 단계가 됩니다">실행할 수 있다고 표시하지 않습니다. 실험 결과가 쌓이면 후보·검증됨으로 승격할 수 있고, 실행기가 없으면 외부에서 실행한 결과를 등록해 검증합니다.</Callout>
      <div className="rs-form__grid">
        <div className="tk-field"><label className="tk-label" htmlFor="m-name">방법 이름</label><input id="m-name" className="tk-input" value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="예: 커널 메모리 접근 패턴 변경" required /></div>
        <div className="tk-field"><label className="tk-label" htmlFor="m-name-en">영문 이름 <span className="tk-label__optional">선택</span></label><input id="m-name-en" className="tk-input" value={nameEn} onChange={e => setNameEn(e.target.value)} maxLength={200} /></div>
      </div>
      <div className="tk-field"><label className="tk-label" htmlFor="m-sum">한 줄 요약</label><input id="m-sum" className="tk-input" value={summary} onChange={e => setSummary(e.target.value)} maxLength={300} placeholder="무엇을 바꿔서 무엇이 나아질 것으로 보는가" required /></div>
      <div className="tk-field"><label className="tk-label" htmlFor="m-prin">가설 · 작동 원리 <span className="tk-label__optional">선택</span></label><textarea id="m-prin" className="tk-textarea" rows={4} value={principle} onChange={e => setPrinciple(e.target.value)} placeholder="왜 그렇게 될 것이라고 보는지, 어떤 조건에서 성립하는지" /></div>
      {AXES.map(axis => {
        const terms = taxonomy[axis] ?? [];
        return <fieldset className="tk-fieldset" key={axis}><legend>{AXIS_LABEL[axis]}{axis === 'target' || axis === 'layer' || axis === 'goal' ? ' (필수)' : ''}</legend>
          {terms.length ? <div className="tk-chips tk-chips--wrap">{terms.map(t => <Chip key={t.code} pressed={picked[axis].includes(t.code)} onClick={() => toggle(axis, t.code)}>{label(axis, t.code)}</Chip>)}</div>
            : <p className="rs-muted">분류 사전을 불러오지 못했습니다. 코드를 쉼표로 직접 입력하세요.<input className="tk-input" aria-label={`${AXIS_LABEL[axis]} 코드`} onChange={e => setPicked(p => ({ ...p, [axis]: e.target.value.split(',').map(x => x.trim()).filter(Boolean) }))} /></p>}
        </fieldset>;
      })}
      <fieldset className="tk-fieldset"><legend>측정할 지표</legend>
        <div className="tk-chips tk-chips--wrap">{Object.entries(METRICS).map(([k, m]) => <Chip key={k} pressed={metrics.includes(k)} onClick={() => setMetrics(l => (l.includes(k) ? l.filter(x => x !== k) : [...l, k]))}>{m.label}</Chip>)}
          {metrics.filter(k => !METRICS[k]).map(k => <Chip key={k} pressed onClick={() => setMetrics(l => l.filter(x => x !== k))}>{k}</Chip>)}</div>
        <div className="rs-inline"><input className="tk-input tk-input--sm" aria-label="새 지표 코드" placeholder="목록에 없는 지표 코드" value={customMetric} onChange={e => setCustomMetric(e.target.value)} />
          <Button size="sm" disabled={!customMetric.trim()} onClick={() => { setMetrics(l => [...l, customMetric.trim()]); setCustomMetric(''); }}>지표 추가</Button></div>
      </fieldset>
      <fieldset className="tk-fieldset"><legend>조정할 파라미터 정의 <span className="rs-muted">({params.length}개)</span></legend>
        <p className="rs-muted">여기서 정의한 파라미터로 실험 설계실이 입력 폼을 자동으로 만듭니다.</p>
        {params.map((p, i) => <details key={i} className="rs-paramdef" open={!p.key}><summary>{p.label || p.key || '새 파라미터'} <span className="rs-muted">{PARAM_TYPES.find(t => t.value === p.type)?.label}</span></summary>
          <div className="rs-form__grid">
            <div className="tk-field"><label className="tk-label" htmlFor={`pk${i}`}>키</label><input id={`pk${i}`} className="tk-input tk-input--mono" value={p.key} onChange={e => patchParam(i, { key: e.target.value })} placeholder="cache_type_k" /></div>
            <div className="tk-field"><label className="tk-label" htmlFor={`pl${i}`}>표시 이름</label><input id={`pl${i}`} className="tk-input" value={p.label} onChange={e => patchParam(i, { label: e.target.value })} /></div>
            <div className="tk-field"><label className="tk-label" id={`pt${i}`} htmlFor={`pty${i}`}>종류</label><Select id={`pty${i}`} labelledBy={`pt${i}`} value={p.type} options={PARAM_TYPES} onChange={v => patchParam(i, { type: v })} /></div>
            <div className="tk-field"><label className="tk-label" htmlFor={`pd${i}`}>기본값</label><input id={`pd${i}`} className="tk-input" value={p.default} onChange={e => patchParam(i, { default: e.target.value })} /></div>
            {(p.type === 'enum' || p.type === 'multi_enum' || p.type === 'model' || p.type === 'dataset' || p.type === 'environment') && <div className="tk-field"><label className="tk-label" htmlFor={`po${i}`}>선택지 (쉼표로 구분)</label><input id={`po${i}`} className="tk-input" value={p.options} onChange={e => patchParam(i, { options: e.target.value })} /></div>}
            {(p.type === 'number' || p.type === 'integer' || p.type === 'range') && <>
              <div className="tk-field"><label className="tk-label" htmlFor={`pmin${i}`}>최솟값</label><input id={`pmin${i}`} className="tk-input" type="number" value={p.min} onChange={e => patchParam(i, { min: e.target.value })} /></div>
              <div className="tk-field"><label className="tk-label" htmlFor={`pmax${i}`}>최댓값</label><input id={`pmax${i}`} className="tk-input" type="number" value={p.max} onChange={e => patchParam(i, { max: e.target.value })} /></div></>}
            <div className="tk-field"><label className="tk-label" htmlFor={`pu${i}`}>단위</label><input id={`pu${i}`} className="tk-input" value={p.unit} onChange={e => patchParam(i, { unit: e.target.value })} /></div>
          </div>
          <div className="tk-field"><label className="tk-label" htmlFor={`pdesc${i}`}>설명</label><input id={`pdesc${i}`} className="tk-input" value={p.description} onChange={e => patchParam(i, { description: e.target.value })} /></div>
          <div className="tk-choices tk-choices--inline"><label className="tk-checkbox"><input type="checkbox" checked={p.advanced} onChange={e => patchParam(i, { advanced: e.target.checked })} /> 고급 항목으로 접기</label>
            <label className="tk-checkbox"><input type="checkbox" checked={p.sweepable} onChange={e => patchParam(i, { sweepable: e.target.checked })} /> 값 여러 개 탐색 허용</label>
            <Button size="sm" variant="ghost" onClick={() => setParams(l => l.filter((_, k) => k !== i))}>삭제</Button></div>
        </details>)}
        <Button size="sm" onClick={() => setParams(l => [...l, blankParam()])}>파라미터 추가</Button>
      </fieldset>
      <fieldset className="tk-fieldset"><legend>실행기 연결 <span className="rs-muted">선택</span></legend>
        <p className="rs-muted">실행할 수 있을 것 같은 실행기를 고르면 서버가 준비 상태를 확인해 실행 가능 여부를 계산합니다. 모르면 비워 두세요.</p>
        <div className="tk-chips tk-chips--wrap">{ADAPTER_IDS.filter(a => a !== 'external_report').map(a => <Chip key={a} pressed={adapters.includes(a)} onClick={() => setAdapters(l => (l.includes(a) ? l.filter(x => x !== a) : [...l, a]))}>{adapterLabel(a)}</Chip>)}</div>
      </fieldset>
      <details className="rs-advanced"><summary>호환 환경 · 기대 효과 · 부작용 · 참고 문헌 · slug</summary>
        <div className="rs-stack">
          <fieldset className="tk-fieldset"><legend>필요 하드웨어</legend><div className="tk-chips tk-chips--wrap">{HARDWARE.map(h => <Chip key={h} pressed={hardware.includes(h)} onClick={() => setHardware(l => (l.includes(h) ? l.filter(x => x !== h) : [...l, h]))}>{h}</Chip>)}</div></fieldset>
          <div className="tk-field"><label className="tk-label" htmlFor="m-notes">호환·제약 메모</label><textarea id="m-notes" className="tk-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="tk-field"><label className="tk-label" htmlFor="m-eff">기대 효과 (한 줄에 하나)</label><textarea id="m-eff" className="tk-textarea" rows={3} value={effects} onChange={e => setEffects(e.target.value)} /></div>
          <div className="tk-field"><label className="tk-label" htmlFor="m-side">알려진 부작용·트레이드오프 (한 줄에 하나)</label><textarea id="m-side" className="tk-textarea" rows={3} value={sides} onChange={e => setSides(e.target.value)} /></div>
          {refs.map((r, i) => <div key={i} className="rs-form__grid"><div className="tk-field"><label className="tk-label" htmlFor={`rt${i}`}>문헌 제목</label><input id={`rt${i}`} className="tk-input" value={r.title ?? ''} onChange={e => setRefs(l => l.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} /></div>
            <div className="tk-field"><label className="tk-label" htmlFor={`ru${i}`}>주소</label><input id={`ru${i}`} className="tk-input" value={r.url ?? ''} onChange={e => setRefs(l => l.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} /></div></div>)}
          <Button size="sm" onClick={() => setRefs(l => [...l, { kind: 'paper', title: '', url: '' }])}>참고 문헌 추가</Button>
          <div className="tk-field"><label className="tk-label" htmlFor="m-slug">slug <span className="tk-label__optional">비우면 자동</span></label><input id="m-slug" className="tk-input tk-input--mono" value={slug} onChange={e => setSlug(e.target.value)} /></div>
        </div>
      </details>
      {error && <Callout kind="caution">{error}</Callout>}
    </form>
  </Dialog>;
}

/** 등록 직후 안내: 서버가 계산한 실행 가능 상태와 지금 할 수 있는 일. */
function CreatedGuide({ method, onClose, onDesign }: { method: Method; onClose: () => void; onDesign?: (m: Method) => void }) {
  const st = method.execution_status;
  const needAdapters = method.adapter_hints?.length ? method.adapter_hints.map(adapterLabel).join(', ') : '지정하지 않음';
  return <div className="rs-stack">
    <p><strong>{method.name_ko}</strong> 가설을 카탈로그에 등록했습니다. 현재 상태:</p>
    <p><ExecutionStatusBadge status={st} reason={method.unavailable_reason} showReason /></p>
    <Callout kind={st === 'hypothesis_stage' || st === 'adapter_required' ? 'warning' : 'tip'} title="다음 단계">
      <ul className="rs-bullets">
        {st === 'hypothesis_stage' && <li>실행할 수 있는 형태가 아직 아닙니다. 파라미터와 측정 지표를 구체화하거나, 외부에서 실험한 결과를 기록하세요.</li>}
        {st === 'adapter_required' && <><li>이 서버에는 이 방법을 실행하는 어댑터가 없습니다. 연결 후보: {needAdapters}.</li><li>당장은 ‘외부 결과 등록’으로 실험을 만들고, 다른 환경에서 측정한 값을 입력하면 같은 비교 화면에서 볼 수 있습니다.</li></>}
        {st === 'environment_unavailable' && <li>어댑터는 있지만 현재 환경에서는 실행할 수 없습니다: {method.unavailable_reason ?? '사유 확인 필요'}</li>}
        {(st === 'partially_supported' || st === 'tool_integrated' || st === 'immediately_executable') && <li>{EXECUTION[st].hint}</li>}
        <li>실험 결과가 쌓이면 방법 상세에서 ‘검증 후 승격’으로 후보 또는 검증됨 단계로 올릴 수 있습니다. 외부 결과만으로는 ‘후보’까지입니다.</li>
      </ul>
    </Callout>
    <div className="rs-actions"><Button variant="primary" onClick={() => onDesign?.(method)}>이 방법으로 실험 설계</Button><Button onClick={onClose}>닫기</Button></div>
  </div>;
}

/** 검증 후 승격(promote): 완료된 실행과 판단 메모를 근거로 가설을 후보·검증됨으로 올린다. */
export function PromoteModal({ open, onClose, method }: { open: boolean; onClose: () => void; method: MethodDetail }) {
  const cache = useQueryClient();
  const exps = method.related_experiments ?? [];
  const [expId, setExpId] = useState(exps[0]?.id ?? '');
  const [runId, setRunId] = useState('');
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<'candidate' | 'validated'>('candidate');
  const [error, setError] = useState('');
  const detail = useQuery({ queryKey: [...rk(), 'experiment', expId], queryFn: () => getExperiment(expId), enabled: !!expId });
  const okRuns = (detail.data?.runs ?? []).filter(r => r.status === 'succeeded');
  const run = okRuns.find(r => r.id === runId);
  const localOk = run?.execution_origin === 'local_measured';
  const save = useMutation({
    mutationFn: () => promoteMethod(method.id, { run_id: runId, decision_note: note.trim(), target_status: localOk ? target : 'candidate' }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: KEY }); onClose(); },
  });
  return <Dialog open={open} onClose={onClose} size="lg" title="검증 후 승격" modal
    footer={<><Button variant="ghost" onClick={onClose}>닫기</Button><Button variant="primary" busy={save.isPending} disabled={!runId || !note.trim()} onClick={() => { setError(''); save.mutate(undefined, { onError: e => setError(errorText(e)) }); }}>승격</Button></>}>
    <div className="rs-form">
      {!exps.length && <Callout kind="warning">이 방법으로 만든 실험이 없습니다. 먼저 실험 설계실에서 실험을 실행해 결과를 만드세요.</Callout>}
      {exps.length > 0 && <>
        <div className="tk-field"><label className="tk-label" id="pr-exp">근거 실험</label>
          <Select id="pr-exp-s" labelledBy="pr-exp" value={expId} options={exps.map(x => ({ value: x.id, label: x.name || x.title || x.id.slice(0, 8) }))} onChange={v => { setExpId(v); setRunId(''); }} /></div>
        <div className="tk-field"><label className="tk-label" id="pr-run">근거 실행 (성공한 실행만)</label>
          {detail.isPending ? <p className="rs-muted">불러오는 중…</p> : okRuns.length ? <Select id="pr-run-s" labelledBy="pr-run" value={runId} options={[{ value: '', label: '실행을 고르세요' }, ...okRuns.map(r => ({ value: r.id, label: `${r.configuration_label ?? r.configuration_id.slice(0, 8)} · ${r.execution_origin === 'local_measured' ? '실측' : '외부 보고'} · 반복 ${r.repeat_index}` }))]} onChange={setRunId} />
            : <p className="rs-muted">성공한 실행이 없습니다.</p>}</div>
        {run && !localOk && <Callout kind="warning" title="외부 결과만 있습니다">이 실행은 따까리가 측정한 값이 아니라서 ‘후보’까지만 승격됩니다. 검증됨으로 올리려면 실행기로 직접 측정한 실행과 Baseline 비교가 필요합니다.</Callout>}
        {localOk && <fieldset className="tk-fieldset"><legend>승격 단계</legend><div className="tk-choices tk-choices--inline">
          <label className="tk-radio"><input type="radio" name="tgt" checked={target === 'candidate'} onChange={() => setTarget('candidate')} /> 후보</label>
          <label className="tk-radio"><input type="radio" name="tgt" checked={target === 'validated'} onChange={() => setTarget('validated')} /> 검증됨 (Baseline 대비 비교 필요)</label></div></fieldset>}
        <div className="tk-field"><label className="tk-label" htmlFor="pr-note">판단 요약</label><textarea id="pr-note" className="tk-textarea" rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="무엇이 어떤 조건에서 어떻게 나아졌고, 어떤 한계가 있었는지" /></div>
        <p className="rs-muted">승격하면 연구 기록에 결정 노드가 남습니다.</p>
      </>}
      {error && <Callout kind="caution">{error}</Callout>}
    </div>
  </Dialog>;
}
