import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { addExternalReport, errorText } from '../api';
import { KEY } from '../hooks';
import { METRICS } from '../labels';
import type { Configuration, ExternalMetric, Provenance } from '../types';
import { Callout } from './parts';

const PROV: { value: Provenance; label: string }[] = [
  { value: 'external_benchmark', label: '외부 벤치마크·다른 장비에서 측정' },
  { value: 'manual_evaluation', label: '사람이 직접 평가 (청취 점수 등)' },
  { value: 'imported_log', label: '기존 로그에서 가져옴' },
];
interface Row { key: string; label: string; value: string; unit: string; direction: 'higher_is_better' | 'lower_is_better'; proxy: boolean }
const blank = (): Row => ({ key: '', label: '', value: '', unit: '', direction: 'higher_is_better', proxy: false });

/** 이 서버에서 실행할 수 없는 방법의 결과를 같은 실행·측정 구조로 들여온다. 입력한 값은 ‘외부 보고’로 표시되며 따까리 실측으로 취급하지 않는다. */
export function ExternalReportForm({ experimentId, configurations, onDone }: { experimentId: string; configurations: Configuration[]; onDone?: () => void }) {
  const cache = useQueryClient();
  const [cfg, setCfg] = useState(configurations[0]?.id ?? '');
  const [prov, setProv] = useState<Provenance>('external_benchmark');
  const [env, setEnv] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => addExternalReport(experimentId, {
      configuration_id: cfg, provenance: prov, environment_snapshot: { description: env.trim() },
      metrics: rows.filter(r => r.key.trim() && r.value.trim() !== '').map<ExternalMetric>(r => ({ metric_key: r.key.trim(), metric_label: r.label.trim() || METRICS[r.key.trim()]?.label || r.key.trim(), value: Number(r.value), unit: r.unit.trim(), direction: r.direction, is_proxy: r.proxy, aggregator: 'single', slice_key: 'overall' })),
      raw_output: { note: note.trim() },
    }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: KEY }); setRows([blank()]); setNote(''); onDone?.(); },
  });
  const patch = (i: number, v: Partial<Row>) => setRows(l => l.map((r, k) => (k === i ? { ...r, ...v } : r)));
  const pickMetric = (i: number, key: string) => { const m = METRICS[key]; patch(i, { key, ...(m ? { label: m.label, unit: m.unit, direction: m.direction, proxy: !!m.proxy } : {}) }); };
  const valid = cfg && env.trim() && rows.some(r => r.key.trim() && r.value.trim() !== '' && Number.isFinite(Number(r.value)));
  function submit(e: FormEvent) { e.preventDefault(); setError(''); save.mutate(undefined, { onError: err => setError(errorText(err)) }); }
  return <form className="rs-form" onSubmit={submit} noValidate>
    <Callout kind="warning" title="외부 보고로 기록됩니다">직접 측정한 값이 아니므로 ‘따까리 실측’과 구분해 표시하고, 방법을 검증됨으로 승격하는 근거로는 쓸 수 없습니다(후보까지).</Callout>
    <div className="rs-form__grid">
      <div className="tk-field"><label className="tk-label" id="er-c">결과를 붙일 설정</label><Select id="er-cs" labelledBy="er-c" value={cfg} options={configurations.map(c => ({ value: c.id, label: c.label }))} onChange={setCfg} /></div>
      <div className="tk-field"><label className="tk-label" id="er-p">결과의 출처</label><Select id="er-ps" labelledBy="er-p" value={prov} options={PROV} onChange={setProv} /></div>
    </div>
    <div className="tk-field"><label className="tk-label" htmlFor="er-env">측정 환경</label><textarea id="er-env" className="tk-textarea" rows={2} value={env} onChange={e => setEnv(e.target.value)} placeholder="예: A100 80GB, vLLM 0.6, 2026-10-20 측정, 논문 표 3" /><p className="tk-help">장비·소프트웨어·측정 시점·출처를 적으세요. 재현할 수 있어야 합니다.</p></div>
    <fieldset className="tk-fieldset"><legend>측정값</legend>
      {rows.map((r, i) => <div key={i} className="rs-metricrow">
        <div className="tk-field"><label className="tk-label" htmlFor={`er-k${i}`}>지표</label><input id={`er-k${i}`} className="tk-input tk-input--mono" list="er-metrics" value={r.key} onChange={e => pickMetric(i, e.target.value)} placeholder="decode_tps" /></div>
        <div className="tk-field"><label className="tk-label" htmlFor={`er-v${i}`}>값</label><input id={`er-v${i}`} className="tk-input" type="number" step="any" value={r.value} onChange={e => patch(i, { value: e.target.value })} /></div>
        <div className="tk-field"><label className="tk-label" htmlFor={`er-u${i}`}>단위</label><input id={`er-u${i}`} className="tk-input" value={r.unit} onChange={e => patch(i, { unit: e.target.value })} /></div>
        <div className="tk-field"><label className="tk-label" id={`er-d${i}`}>방향</label><Select id={`er-ds${i}`} labelledBy={`er-d${i}`} value={r.direction} options={[{ value: 'higher_is_better', label: '높을수록 좋음' }, { value: 'lower_is_better', label: '낮을수록 좋음' }]} onChange={v => patch(i, { direction: v })} /></div>
        <div className="rs-metricrow__end"><label className="tk-checkbox"><input type="checkbox" checked={r.proxy} onChange={e => patch(i, { proxy: e.target.checked })} /> 간접 지표</label>
          {rows.length > 1 && <Button size="xs" variant="ghost" onClick={() => setRows(l => l.filter((_, k) => k !== i))}>삭제</Button>}</div>
      </div>)}
      <datalist id="er-metrics">{Object.entries(METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</datalist>
      <Button size="sm" onClick={() => setRows(l => [...l, blank()])}>측정값 추가</Button>
    </fieldset>
    <div className="tk-field"><label className="tk-label" htmlFor="er-note">메모 <span className="tk-label__optional">선택</span></label><textarea id="er-note" className="tk-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} /></div>
    {error && <Callout kind="caution">{error}</Callout>}
    <div className="rs-actions"><Button variant="primary" type="submit" busy={save.isPending} disabled={!valid}>외부 결과 등록</Button></div>
  </form>;
}
