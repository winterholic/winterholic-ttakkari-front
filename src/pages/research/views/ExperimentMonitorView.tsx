import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Select } from '../../../ui/Select';
import { toast } from '../../../ui/toastStore';
import { cancelRun, errorText, getExperiment, listRuns, runExperiment } from '../api';
import { OriginBadge, RunStateBadge } from '../components/ExecutionStatusBadge';
import { ExternalReportForm } from '../components/ExternalReportForm';
import { Callout, Chip, Empty, FactList, Section, Skeleton } from '../components/parts';
import { RunDetailDialog } from '../components/RunDetailDialog';
import type { ResearchCtx } from '../context';
import { fmtDuration, fmtTime, shortId } from '../format';
import { experimentName, KEY, useAdapters, useSnapshot, rk } from '../hooks';
import { adapterLabel, STRATEGY } from '../labels';
import type { RunStatus, RunSummary, Strategy } from '../types';

const ACTIVE: RunStatus[] = ['queued', 'running'];
const FILTERS: { id: string; label: string; match: (r: RunSummary) => boolean }[] = [
  { id: 'all', label: '전체', match: () => true },
  { id: 'active', label: '진행 중', match: r => ACTIVE.includes(r.status) },
  { id: 'failed', label: '실패·취소', match: r => r.status === 'failed' || r.status === 'cancelled' },
  { id: 'ok', label: '성공', match: r => r.status === 'succeeded' },
];

/** 실행 모니터. 진행은 완료한 실행 수로만 보여 준다. 실행기가 실행 중 진행률을 주지 않으면 퍼센트를 만들어 내지 않는다. */
export function ExperimentMonitorView({ ctx }: { ctx: ResearchCtx }) {
  const cache = useQueryClient();
  const snap = useSnapshot(ctx.studyId);
  const { adapters } = useAdapters(ctx.studyId);
  const [filter, setFilter] = useState('all');
  const expId = ctx.experimentId;
  const runsQ = useQuery({
    queryKey: [...rk(), 'runs', ctx.studyId, expId],
    queryFn: () => listRuns({ study_id: ctx.studyId, experiment_id: expId }),
    refetchInterval: q => (q.state.data?.runs.some(r => ACTIVE.includes(r.status)) ? 3000 : false),
  });
  const detail = useQuery({ queryKey: [...rk(), 'experiment', expId], queryFn: () => getExperiment(expId as string), enabled: !!expId, refetchInterval: runsQ.data?.runs.some(r => ACTIVE.includes(r.status)) ? 3000 : false });
  const runs = runsQ.data?.runs ?? [];
  const labels = useMemo(() => new Map((detail.data?.configurations ?? []).map(c => [c.id, c.label])), [detail.data]);
  const labelOf = (r: RunSummary) => r.configuration_label ?? labels.get(r.configuration_id) ?? `설정 ${shortId(r.configuration_id)}`;
  const shown = runs.filter(FILTERS.find(f => f.id === filter)?.match ?? (() => true));
  const counts: Record<RunStatus, number> = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  runs.forEach(r => { counts[r.status] += 1; });
  const finished = counts.succeeded + counts.failed + counts.cancelled;
  const exps = snap.data?.experiments ?? [];

  const invalidate = () => { void cache.invalidateQueries({ queryKey: KEY }); };
  const cancel = useMutation({ mutationFn: (id: string) => cancelRun(id, '사용자가 모니터에서 취소함'), onSuccess: () => { invalidate(); toast({ message: '취소를 요청했습니다.', tone: 'success' }); }, onError: e => toast({ message: errorText(e), tone: 'danger' }) });
  const start = useMutation({ mutationFn: (cfg: string[] | null) => runExperiment(expId as string, cfg), onSuccess: () => { invalidate(); toast({ message: '실행을 시작했습니다.', tone: 'success' }); }, onError: e => toast({ message: errorText(e), tone: 'danger' }) });

  const host = runsQ.data?.host_gpu_status;
  const locks = runsQ.data?.active_locks ?? [];
  const exp = detail.data?.experiment;
  const runDetailId = ctx.runId;
  const runForDialog = runs.find(r => r.id === runDetailId);

  return <div className="rs-monitor">
    <div className="rs-monitor__bar">
      <div className="tk-field rs-monitor__sel"><label className="tk-label" id="mon-exp-l" htmlFor="mon-exp">실험</label>
        <Select id="mon-exp" labelledBy="mon-exp-l" value={expId ?? ''} options={[{ value: '', label: ctx.studyId ? '이 연구의 모든 실행' : '모든 연구의 실행' }, ...exps.map(x => ({ value: x.id, label: experimentName(x) }))]} onChange={v => ctx.go({ experiment: v || null, run: null }, { replace: true })} /></div>
      <div className="tk-chips" role="group" aria-label="실행 상태 필터">{FILTERS.map(f => <Chip key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)} count={runs.filter(f.match).length}>{f.label}</Chip>)}</div>
      <Button size="sm" onClick={() => { void runsQ.refetch(); }} busy={runsQ.isFetching}>새로고침</Button>
    </div>

    {runsQ.error && <Callout kind="caution">{errorText(runsQ.error)} <Button size="sm" onClick={() => void runsQ.refetch()}>다시 불러오기</Button></Callout>}

    <div className="rs-monitor__top">
      <Section title="실행 진행" hint={expId ? undefined : '실험을 고르면 그 실험의 설정별 진행을 봅니다.'}>
        {runsQ.isPending ? <Skeleton rows={2} /> : <>
          <p className="rs-progress__line"><strong>완료 {finished} / 전체 {runs.length}개 실행</strong>
            {counts.running > 0 && <Badge tone="info">실행 중 {counts.running}</Badge>}{counts.queued > 0 && <Badge>대기 {counts.queued}</Badge>}{counts.failed > 0 && <Badge tone="danger">실패 {counts.failed}</Badge>}{counts.cancelled > 0 && <Badge>취소 {counts.cancelled}</Badge>}</p>
          {runs.length > 0 && <progress className="rs-progress" value={finished} max={runs.length} aria-label={`완료한 실행 ${finished}개 / 전체 ${runs.length}개`} />}
          <p className="rs-muted">끝난 실행 수만 셉니다. 실행기가 실행 중 진행률을 알려 주는 경우에만 실행별 진행률이 표시되고, 남은 시간은 추정하지 않습니다.</p>
          {exp && <p className="rs-muted">{adapterLabel(exp.adapter_id)} · {STRATEGY[exp.strategy as Strategy]?.label ?? exp.strategy} · 주요 지표 {exp.primary_metric}</p>}
        </>}
      </Section>
      <Section title="자원·실행기 상태">
        <ul className="rs-adapterlist">{adapters.filter(a => a.adapter_id !== 'external_report').map(a => <li key={a.adapter_id}>
          <span>{adapterLabel(a.adapter_id)}</span> {a.ready ? <Badge tone="success">준비됨</Badge> : <Badge tone="danger">사용 불가</Badge>}{a.reason && !a.ready && <span className="rs-reason">{a.reason}</span>}</li>)}
          {!adapters.length && <li className="rs-muted">실행기 상태를 받지 못했습니다.</li>}</ul>
        {locks.length > 0 ? <p>점유 중인 잠금: {locks.map((l, i) => <Badge key={i} tone="warning">{typeof l === 'string' ? l : String((l as { name?: string }).name ?? JSON.stringify(l))}</Badge>)}<span className="rs-muted"> 다른 작업이 끝나야 실행됩니다.</span></p> : <p className="rs-muted">점유 중인 잠금이 없습니다.</p>}
        {host && Object.keys(host).length > 0 && <details className="rs-advanced"><summary>호스트 GPU 상태</summary><FactList data={host} /></details>}
      </Section>
    </div>

    {expId && detail.data && !runs.length && !runsQ.isPending && exp?.adapter_id !== 'external_report' && <Callout kind="note" title="아직 실행하지 않은 실험입니다">
      설정 {detail.data.configurations.length}개를 실행합니다. <Button variant="primary" size="sm" busy={start.isPending} onClick={() => start.mutate(null)}>실험 실행</Button></Callout>}

    <Section title="실행 목록" hint={`${shown.length}개 표시 · 실패·취소한 실행도 숨기지 않습니다`}>
      {!runsQ.isPending && !shown.length && <Empty title={runs.length ? '이 상태의 실행이 없습니다' : '실행 기록이 없습니다'}>{ctx.studyId ? '실험 설계실에서 실험을 만들고 실행하면 여기에 나타납니다.' : '연구를 고르면 그 연구의 실행만 볼 수 있습니다.'}</Empty>}
      {shown.length > 0 && <div className="tk-datatable tk-datatable--sticky-col">
        <div className="tk-datatable__scroll" role="region" aria-label="실행 목록 (가로로 스크롤)" tabIndex={0}>
          <table><thead><tr><th scope="col">설정</th><th scope="col">상태</th><th scope="col" className="tk-datatable__num">반복</th><th scope="col">진행</th><th scope="col" className="tk-datatable__num">소요</th><th scope="col">출처</th><th scope="col">시작</th><th scope="col">실패 원인</th><th scope="col"><span className="tk-sr-only">작업</span></th></tr></thead>
            <tbody>{shown.map(r => <tr key={r.id} aria-selected={runDetailId === r.id}>
              <th scope="row" className="tk-datatable__clip" title={labelOf(r)}><button type="button" className="tk-link" onClick={() => ctx.go({ run: r.id })}>{labelOf(r)}</button></th>
              <td><RunStateBadge status={r.status} /></td>
              <td className="tk-datatable__num">{r.repeat_index}</td>
              <td>{r.progress === null || r.progress === undefined ? <span className="rs-muted">{ACTIVE.includes(r.status) ? '진행률 없음' : '—'}</span> : <><progress value={r.progress} max={1} aria-label="실행 진행률" /> {Math.round(r.progress * 100)}%</>}</td>
              <td className="tk-datatable__num">{fmtDuration(r.wall_seconds)}</td>
              <td><OriginBadge origin={r.execution_origin} /></td>
              <td>{fmtTime(r.started_at)}</td>
              <td className="rs-wrapcell">{r.error_message ? <span className="rs-reason" title={r.error_message}>{r.error_code ? `${r.error_code}: ` : ''}{r.error_message.slice(0, 80)}{r.error_message.length > 80 ? '…' : ''}</span> : '—'}</td>
              <td>{ACTIVE.includes(r.status) ? <Button size="xs" variant="danger" busy={cancel.isPending && cancel.variables === r.id} onClick={() => cancel.mutate(r.id)}>취소</Button>
                : r.execution_origin === 'local_measured' || r.execution_origin === 'migrated_v1' ? <Button size="xs" onClick={() => start.mutate([r.configuration_id])} disabled={start.isPending || !expId}>다시 실행</Button> : null}</td>
            </tr>)}</tbody></table>
        </div></div>}
      {!expId && shown.some(r => !ACTIVE.includes(r.status)) && <p className="rs-muted">실험을 고르면 ‘다시 실행’을 쓸 수 있습니다.</p>}
    </Section>

    {expId && detail.data && exp?.adapter_id === 'external_report' && <Section title="외부 결과 입력" hint="이 서버에서 실행하지 않는 실험입니다. 다른 환경에서 측정한 값을 입력하면 같은 비교 화면에서 볼 수 있습니다.">
      <ExternalReportForm experimentId={expId} configurations={detail.data.configurations} />
    </Section>}

    {expId && detail.data && runs.some(r => r.status === 'succeeded') && <div className="rs-actions"><Button variant="primary" onClick={() => ctx.go({ view: 'analysis' })}>결과 비교·분석으로 이동</Button></div>}
    {runDetailId && <RunDetailDialog runId={runDetailId} configLabel={runForDialog ? labelOf(runForDialog) : undefined} onClose={() => ctx.go({ run: null })}
      onCancel={id => cancel.mutate(id)} onRerun={expId ? cfg => { start.mutate([cfg]); ctx.go({ run: null }); } : undefined} />}
  </div>;
}
