import { Badge, RunBadge } from '../../../ui/Badge';
import { EXECUTION, LIFECYCLE, EVIDENCE, ORIGIN_LABEL, PROVENANCE_LABEL, RUN_STATUS, RUN_BADGE, proxyNote } from '../labels';
import type { EvidenceStatus, ExecutionStatus, LifecycleStatus, RunStatus } from '../types';

/** F축 6단계 실행 가능 상태 배지. 불가·지원 한계 사유는 글자로 같이 적는다(툴팁에만 두지 않는다). */
export function ExecutionStatusBadge({ status, reason, showReason }: { status: ExecutionStatus | string; reason?: string | null; showReason?: boolean }) {
  const info = EXECUTION[status as ExecutionStatus];
  return <>
    <span title={reason || info?.hint} className="rs-badge-wrap"><Badge tone={info?.tone}>{info?.label ?? String(status)}</Badge></span>
    {showReason && reason && <span className="rs-reason">{reason}</span>}
  </>;
}

export function LifecycleBadge({ status }: { status: LifecycleStatus | string }) {
  const info = LIFECYCLE[status as LifecycleStatus];
  return <Badge tone={info?.tone}>{info?.label ?? String(status)}</Badge>;
}

/** 문헌 근거와 따까리 실측은 서로 다른 배지다. 섞어 쓰지 않는다. */
export function EvidenceBadge({ status }: { status: EvidenceStatus | string }) {
  return <span title="논문·문서에서 보고된 내용입니다. 따까리가 재현한 결과가 아닙니다."><Badge>{EVIDENCE[status as EvidenceStatus] ?? String(status)}</Badge></span>;
}

export function MeasuredBadge({ runs }: { runs?: number }) {
  return runs && runs > 0
    ? <span title="이 환경에서 따까리가 직접 실행해 측정한 기록이 있습니다."><Badge tone="success">따까리 실측 {runs}회</Badge></span>
    : <span title="따까리에서 직접 측정한 기록이 아직 없습니다."><Badge>실측 없음</Badge></span>;
}

export function ProxyBadge({ metricKey }: { metricKey: string }) {
  return <span title={proxyNote(metricKey)}><Badge tone="warning">간접 지표(proxy)</Badge></span>;
}

/** 실행 출처. 외부 보고는 결과 출처(provenance)를 같이 적는다. */
export function OriginBadge({ origin, provenance }: { origin: string; provenance?: string | null }) {
  const tone = origin === 'local_measured' ? 'success' : origin === 'external_report' ? 'warning' : undefined;
  const label = ORIGIN_LABEL[origin] ?? origin;
  return <Badge tone={tone}>{provenance ? `${label} · ${PROVENANCE_LABEL[provenance] ?? provenance}` : label}</Badge>;
}

export function RunStateBadge({ status }: { status: RunStatus | string }) {
  const s = status as RunStatus;
  return RUN_BADGE[s] ? <RunBadge state={RUN_BADGE[s]}>{RUN_STATUS[s]}</RunBadge> : <Badge>{status}</Badge>;
}
