import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { Select } from '../../../ui/Select';
import { adoptBestResult, errorText } from '../api';
import { adoptionBasis, bestLabel, DIRECTION_TEXT, fmtValue, promotionNotice, type PromotionNotice } from '../format';
import { KEY } from '../hooks';
import { ORIGIN_LABEL } from '../labels';
import type { MetricMeta } from '../series';
import type { BestResult, ExperimentDetail } from '../types';
import { Callout } from './parts';

interface Props { studyId: string; detail: ExperimentDetail; metrics: MetricMeta[]; primaryMetric: string; studyGoal?: string; adopted: BestResult[]; valueOf: (configId: string, metricKey: string) => number | null }

/** 채택은 ‘무엇에 대해 최적인지’를 함께 적어야만 한다. 목표·지표·제약이 없으면 보내지 않는다. 단일 점수로 전면 최적을 선언하지 않는다. */
export function BestResultPanel({ studyId, detail, metrics, primaryMetric, studyGoal, adopted, valueOf }: Props) {
  const cache = useQueryClient();
  const ok = detail.runs.filter(r => r.status === 'succeeded');
  const cfgs = detail.configurations.filter(c => ok.some(r => r.configuration_id === c.id));
  const [cfg, setCfg] = useState(cfgs[0]?.id ?? '');
  const runsOf = ok.filter(r => r.configuration_id === cfg);
  const [runId, setRunId] = useState('');
  const run = runsOf.find(r => r.id === runId) ?? runsOf[0];
  const [goal, setGoal] = useState(studyGoal?.split('\n')[0].slice(0, 120) ?? '');
  const [metric, setMetric] = useState(primaryMetric);
  const [constraint, setConstraint] = useState('');
  const [status, setStatus] = useState<'adopted' | 'rejected'>('adopted');
  const [reason, setReason] = useState('');
  const [promote, setPromote] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [promotionMsg, setPromotionMsg] = useState<PromotionNotice | null>(null);
  const m = metrics.find(x => x.key === metric);
  const cfgLabel = cfgs.find(c => c.id === cfg)?.label ?? '';
  const value = cfg && m ? valueOf(cfg, m.key) : null;
  const canPromote = !!detail.experiment.method_id && run?.execution_origin === 'local_measured' && status === 'adopted';
  const sentence = `「${cfgLabel || '설정'}」 — ${goal.trim() || '(목표 미입력)'}에 대해, ${m?.label ?? '(지표 미선택)'} 기준${constraint.trim() ? `, 제약: ${constraint.trim()}` : ''} ${status === 'adopted' ? '최선으로 채택' : '기각'}`;
  const valid = cfg && run && goal.trim() && metric && constraint.trim() && reason.trim();
  const save = useMutation({
    mutationFn: () => adoptBestResult(studyId, {
      experiment_id: detail.experiment.id, configuration_id: cfg, run_id: run!.id, status, promote_method: canPromote && promote,
      objective: goal.trim(), primary_metric: metric, constraints: { description: constraint.trim(), direction: m?.direction ?? null, value, origin: run!.execution_origin },
      rationale: reason.trim(),
    }),
    onSuccess: r => {
      void cache.invalidateQueries({ queryKey: KEY }); setConfirm(false); setReason('');
      setPromotionMsg(promotionNotice(r.method_promotion));
      // 서버가 기각을 채택으로 기록하면 사용자가 모르고 지나가지 않게 알린다
      if (r.status && r.status !== status) setError(`서버가 요청한 결정(${status === 'adopted' ? '채택' : '기각'})과 다르게 ‘${r.status}’로 기록했습니다. 연구 기록을 확인하세요.`);
    },
  });
  if (!cfgs.length) return <Callout kind="note">성공한 실행이 없어 채택할 설정이 없습니다. 실패·취소한 실행은 위 목록에 그대로 남아 있습니다.</Callout>;
  return <div className="rs-form">
    {adopted.length > 0 && <div><h4>이미 기록된 결정</h4><ul className="rs-rellist">{adopted.map(b => <li key={b.id}><strong>{b.status === 'adopted' ? '채택' : b.status === 'rejected' ? '기각' : '대체됨'}</strong> · {bestLabel(b)}{adoptionBasis(b).map(t => <span key={t} className="rs-muted"> · {t}</span>)}<p className="rs-prose rs-prewrap">{b.rationale}</p></li>)}</ul></div>}
    <div className="rs-form__grid">
      <div className="tk-field"><label className="tk-label" id="br-c">대상 설정</label><Select id="br-cs" labelledBy="br-c" value={cfg} options={cfgs.map(c => ({ value: c.id, label: c.label }))} onChange={v => { setCfg(v); setRunId(''); }} /></div>
      <div className="tk-field"><label className="tk-label" id="br-r">대표 실행</label><Select id="br-rs" labelledBy="br-r" value={run?.id ?? ''} options={runsOf.map(r => ({ value: r.id, label: `반복 ${r.repeat_index} · ${ORIGIN_LABEL[r.execution_origin] ?? r.execution_origin}` }))} onChange={setRunId} /></div>
    </div>
    <fieldset className="tk-fieldset"><legend>무엇에 대해 최적인가 (필수)</legend>
      <div className="tk-field"><label className="tk-label" htmlFor="br-goal">목표</label><input id="br-goal" className="tk-input" value={goal} onChange={e => setGoal(e.target.value)} placeholder="예: 8GB 메모리에서 대화형 응답 속도" /></div>
      <div className="tk-field"><label className="tk-label" id="br-m">기준 지표</label><Select id="br-ms" labelledBy="br-m" value={metric} options={metrics.map(x => ({ value: x.key, label: x.label }))} onChange={setMetric} />
        {m && value !== null && <p className="tk-help">{cfgLabel}의 {m.label}: <strong>{fmtValue(value, m.unit)}</strong> · {DIRECTION_TEXT[m.direction]}{m.is_proxy ? ' · 간접 지표' : ''}</p>}</div>
      <div className="tk-field"><label className="tk-label" htmlFor="br-con">제약·조건</label><input id="br-con" className="tk-input" value={constraint} onChange={e => setConstraint(e.target.value)} placeholder="예: 메모리 6GB 이하, 한국어 정확도 하락 1% 이내, 이 장비에서만" /><p className="tk-help">다른 지표·환경에서는 이 결과가 최선이 아닐 수 있습니다. 조건을 남겨 두세요.</p></div>
    </fieldset>
    <fieldset className="tk-fieldset"><legend>결정</legend><div className="tk-choices tk-choices--inline">
      <label className="tk-radio"><input type="radio" name="br-st" checked={status === 'adopted'} onChange={() => setStatus('adopted')} /> 채택</label>
      <label className="tk-radio"><input type="radio" name="br-st" checked={status === 'rejected'} onChange={() => setStatus('rejected')} /> 기각 (이유를 남김)</label></div></fieldset>
    <div className="tk-field"><label className="tk-label" htmlFor="br-why">판단 근거</label><textarea id="br-why" className="tk-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="무엇을 보고 그렇게 판단했는지, 남은 불확실성은 무엇인지" /></div>
    {canPromote && <label className="tk-checkbox"><input type="checkbox" checked={promote} onChange={e => setPromote(e.target.checked)} /> 이 결과를 근거로 방법을 카탈로그에서 승격</label>}
    <p className="rs-sentence" aria-live="polite">{sentence}</p>
    {error && <Callout kind="caution">{error}</Callout>}
    {promotionMsg && <Callout kind={promotionMsg.kind} role="status">{promotionMsg.text}</Callout>}
    <div className="rs-actions"><Button variant="primary" disabled={!valid} onClick={() => setConfirm(true)}>{status === 'adopted' ? '이 설정 채택' : '기각 기록'}</Button></div>
    {confirm && <Dialog open onClose={() => setConfirm(false)} size="sm" title="연구 기록에 남깁니다" modal
      footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>취소</Button><Button variant="primary" busy={save.isPending} onClick={() => { setError(''); setPromotionMsg(null); save.mutate(undefined, { onError: e => { setError(errorText(e)); setConfirm(false); } }); }}>기록</Button></>}>
      <p>{sentence}</p><p className="rs-muted">결정 노드가 연구 타임라인에 남습니다. 나중에 바꾸려면 지우는 것이 아니라 새 결정으로 대체합니다.</p>
    </Dialog>}
  </div>;
}
