import { useQuery } from '@tanstack/react-query';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { errorText, getRun } from '../api';
import { DIRECTION_TEXT, fmtDuration, fmtTime, fmtValue } from '../format';
import { rk } from '../hooks';
import { ArtifactList } from './ArtifactList';
import { OriginBadge, ProxyBadge, RunStateBadge } from './ExecutionStatusBadge';
import { adapterLabel, errorCodeNote } from '../labels';
import { Callout, FactList, Skeleton } from './parts';

interface Props { runId: string; onClose: () => void; configLabel?: string; onCancel?: (id: string) => void; onRerun?: (runId: string) => void }

/** 실행 한 건의 전부: 상태·실패 원인·측정값·실행 환경·원본 출력·산출물. 진행률은 실행기가 줄 때만 보인다. */
export function RunDetailDialog({ runId, onClose, configLabel, onCancel, onRerun }: Props) {
  const q = useQuery({ queryKey: [...rk(), 'run', runId], queryFn: () => getRun(runId), refetchInterval: query => (['queued', 'running'].includes(query.state.data?.status ?? '') ? 3000 : false) });
  const r = q.data;
  const active = r && (r.status === 'queued' || r.status === 'running');
  return <Dialog open onClose={onClose} size="lg" title={`실행 상세${configLabel ? ` · ${configLabel}` : ''}`}
    footer={r ? <>{active && onCancel && <Button variant="danger" onClick={() => onCancel(r.id)}>이 실행 취소</Button>}
      {!active && onRerun && (r.execution_origin === 'local_measured' || r.execution_origin === 'migrated_v1') && <Button variant="primary" onClick={() => onRerun(r.id)}>원 조건으로 다시 실행</Button>}</> : undefined}>
    {q.isPending && <Skeleton rows={4} />}
    {q.error && <Callout kind="caution">{errorText(q.error)}</Callout>}
    {r && <div className="rs-stack">
      <div className="rs-detail__badges"><RunStateBadge status={r.status} /><OriginBadge origin={r.execution_origin} provenance={r.provenance} /><span className="rs-muted">{adapterLabel(r.adapter_id)} · 반복 {r.repeat_index} · 시드 {r.seed ?? '—'}</span></div>
      {r.execution_origin === 'external_report' && <Callout kind="note" title="따까리가 측정한 값이 아닙니다">다른 환경에서 측정해 들여온 보고입니다. 같은 조건의 비교인지 실행 환경 기록으로 확인하세요.</Callout>}
      {r.status === 'failed' && <Callout kind="caution" title="실패 원인">{errorCodeNote(r.error_code) && <p>{errorCodeNote(r.error_code)}</p>}{r.error_code && <p><code className="tk-mono">{r.error_code}</code></p>}<p>{r.error_message || '실행기가 원인을 남기지 않았습니다.'}</p></Callout>}
      {r.status === 'cancelled' && <Callout kind="warning" title="취소된 실행">{errorCodeNote(r.error_code) && <p>{errorCodeNote(r.error_code)}</p>}{r.error_code && r.error_code !== 'cancelled' && <p><code className="tk-mono">{r.error_code}</code></p>}<p>{r.error_message || '사용자가 취소했거나 예산을 넘어 중단되었습니다.'}</p></Callout>}
      <dl className="tk-meta">
        <div className="rs-meta-row"><dt>시작</dt><dd>{fmtTime(r.started_at)}</dd></div>
        <div className="rs-meta-row"><dt>끝</dt><dd>{fmtTime(r.finished_at)}</dd></div>
        <div className="rs-meta-row"><dt>소요</dt><dd>{fmtDuration(r.wall_seconds)}</dd></div>
        <div className="rs-meta-row"><dt>진행</dt><dd>{r.progress === null || r.progress === undefined ? (active ? '이 실행기는 실행 중 진행률을 알려 주지 않습니다' : '—') : <><progress value={r.progress} max={1} aria-label="실행 진행률" /> {Math.round(r.progress * 100)}%</>}</dd></div>
      </dl>
      <section aria-label="측정값"><h4>측정값</h4>
        {r.measurements?.length ? <div className="tk-datatable tk-datatable--sticky-col"><div className="tk-datatable__scroll" role="region" aria-label="측정값 표 (가로로 스크롤)" tabIndex={0}>
          <table><thead><tr><th scope="col">지표</th><th scope="col" className="tk-datatable__num">값</th><th scope="col">방향</th><th scope="col">집계</th></tr></thead>
            <tbody>{r.measurements.map((m, i) => <tr key={i}><th scope="row">{m.metric_label}{m.is_proxy && <> <ProxyBadge metricKey={m.metric_key} /></>}</th><td className="tk-datatable__num">{fmtValue(m.value, m.unit)}</td><td>{DIRECTION_TEXT[m.direction]}</td><td>{m.aggregator}{m.slice_key !== 'overall' ? ` · ${m.slice_key}` : ''}</td></tr>)}</tbody></table></div></div>
          : <p className="rs-muted">{r.status === 'succeeded' ? '측정값이 기록되지 않았습니다.' : '측정값이 없습니다. 실패·취소한 실행은 측정하지 않습니다.'}</p>}
      </section>
      <section aria-label="산출물"><h4>산출물</h4><ArtifactList artifacts={r.artifacts ?? []} /></section>
      <section aria-label="실행 환경"><h4>실행 환경</h4><FactList data={r.environment_snapshot} empty="실행 환경이 기록되지 않았습니다. 같은 조건의 비교인지 확인할 수 없습니다." /></section>
      <section aria-label="원본 출력"><h4>원본 출력</h4><FactList data={r.raw_output} empty="원본 출력이 없습니다." /></section>
    </div>}
  </Dialog>;
}
