import type { Method } from '../types';
import { EvidenceBadge, ExecutionStatusBadge, LifecycleBadge, MeasuredBadge } from './ExecutionStatusBadge';

/** 라이브러리 카드. 실행 상태 배지와 불가 사유를 카드 겉면에서 바로 읽는다. 카드 전체가 하나의 버튼이다. */
export function MethodCard({ method, labelOf, onOpen, selected }: { method: Method; labelOf: (axis: string, code: string) => string; onOpen: () => void; selected?: boolean }) {
  const tags = [...method.targets.map(c => labelOf('target', c)), ...method.layers.slice(0, 2).map(c => labelOf('layer', c))];
  const shown = tags.slice(0, 4);
  const blocked = method.execution_status === 'environment_unavailable' || method.execution_status === 'adapter_required' || method.execution_status === 'hypothesis_stage' || method.execution_status === 'partially_supported';
  return <button type="button" className="rs-card" onClick={onOpen} aria-pressed={selected || undefined} data-status={method.execution_status}>
    <span className="rs-card__title">{method.name_ko || method.name}</span>
    {method.name_ko && method.name && method.name !== method.name_ko && <span className="rs-card__sub">{method.name}</span>}
    <span className="rs-card__summary">{method.summary}</span>
    <span className="rs-card__badges">
      <ExecutionStatusBadge status={method.execution_status} reason={method.unavailable_reason} />
      {method.lifecycle_status !== 'validated' && <LifecycleBadge status={method.lifecycle_status} />}
      {method.local_measurements && <MeasuredBadge runs={method.local_measurements.measured_run_count} />}
      {method.local_measurements?.measured_run_count ? null : <EvidenceBadge status={method.evidence_status} />}
    </span>
    {blocked && (method.unavailable_reason || method.unsupported_params?.length) && <span className="rs-card__reason">
      {method.unavailable_reason ?? `실행되지 않는 파라미터: ${method.unsupported_params?.join(', ')}`}
    </span>}
    <span className="rs-card__tags">{shown.map(t => <span key={t} className="rs-tag">{t}</span>)}{tags.length > shown.length && <span className="rs-tag">+{tags.length - shown.length}</span>}</span>
  </button>;
}
