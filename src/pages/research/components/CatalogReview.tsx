import { useRef, useState } from 'react';
import { Button } from '../../../ui/Button';
import { errorText, reviewCatalog, type CatalogReviewResult } from '../api';
import { ExecutionStatusBadge } from './ExecutionStatusBadge';
import { Callout, Empty, Section } from './parts';

const ELIGIBILITY = { candidate: '검토 후보', needs_review: '추가 검토 필요', excluded: '현재 조건에서 제외' };

/** On-demand research-context review. Never converts missing estimates into scores. */
export function CatalogReview({ studyId, query, onMethod, onFailure }: {
  studyId: string | null; query: string; onMethod: (slug: string) => void;
  onFailure: (study: string, experiment: string, run: string | null) => void;
}) {
  const [budget, setBudget] = useState(60);
  const [result, setResult] = useState<{ key: string; body?: CatalogReviewResult; error?: string; busy?: boolean } | null>(null);
  const request = useRef(0);
  const key = JSON.stringify([studyId, query, budget]);
  const visible = result?.key === key ? result : null;
  const review = async () => {
    if (!studyId || !Number.isInteger(budget) || budget < 1 || budget > 86400) return;
    const id = ++request.current;
    setResult({ key, busy: true });
    try {
      const body = await reviewCatalog(studyId, query, budget);
      if (id === request.current) setResult({ key, body });
    } catch (error) {
      if (id === request.current) setResult({ key, error: errorText(error) });
    }
  };
  return <Section title="연구 조건으로 방법 검토" hint="연구에 저장한 환경과 현재 검색어로 카탈로그를 검토합니다. 분야 등 다른 목록 필터는 이 검토에 적용하지 않습니다.">
    <div className="rs-actions">
      <label className="rs-muted">검토 예산(초)<input className="tk-input" type="number" min={1} max={86400} value={Number.isFinite(budget) ? budget : ''}
        aria-label="검토 예산(초)" onChange={e => setBudget(e.target.value === '' ? NaN : Number(e.target.value))} /></label>
      <Button disabled={!studyId || !Number.isInteger(budget) || budget < 1 || budget > 86400} busy={visible?.busy} onClick={() => void review()}>현재 연구에 맞춰 검토</Button>
    </div>
    {!studyId && <p className="rs-muted">먼저 상단에서 연구를 선택해 주세요.</p>}
    {visible?.error && <Callout kind="caution">{visible.error} 버튼을 눌러 다시 시도할 수 있습니다.</Callout>}
    {visible?.body && <div className="tk-stack tk-gap-3" aria-live="polite">
      <p className="rs-muted">조건·비용·저장된 상충 및 실패 이력에 따른 검토 순서입니다. 효과·근거의 질·정보가치는 아직 평가하지 않았습니다. 실행 지원 상태는 이 Mac 기준입니다.</p>
      {visible.body.truncated && <Callout kind="warning">후보가 200개를 넘어 일부만 검토했습니다. 검색어를 좁혀 주세요.</Callout>}
      {!visible.body.candidates.length && <Empty title="검토할 방법이 없습니다">검색어를 줄이거나 새 방법을 등록해 보세요.</Empty>}
      {visible.body.candidates.map(m => <details key={m.id} className="rs-advanced">
        <summary>{m.title} · {ELIGIBILITY[m.eligibility]}</summary>
        <div className="tk-stack tk-gap-3">
          <ExecutionStatusBadge status={m.execution_status} reason={m.unavailable_reason} />
          {m.unavailable_reason && <p className="rs-muted">{m.unavailable_reason}</p>}
          <p>{m.reason.cost_seconds == null ? '실행 비용 미측정' : `기록된 예상 비용 ${m.reason.cost_seconds}초`}
            {m.reason.conditions.missing.length > 0 ? ` · 조건 확인 필요: ${m.reason.conditions.missing.join(', ')}` : ''}
            {m.reason.conditions.mismatches.length > 0 ? ` · 조건 불일치: ${m.reason.conditions.mismatches.join(', ')}` : ''}</p>
          {!m.reason.conditions.missing.length && !m.reason.conditions.mismatches.length && <p className="rs-muted">적용 조건이 선언되지 않은 방법도 추가 검토가 필요합니다.</p>}
          {m.reason.research_context.truncated && <Callout kind="warning">연결 이력을 일부만 확인했습니다.</Callout>}
          {m.reason.research_context.relations.some(r => r.affects_selection) && <p>현재 조건에서 검토할 상충 보고가 있습니다. 방법 상세의 관계와 조건을 확인해 주세요.</p>}
          {(m.reason.research_context.failures ?? []).map((f, i) => <div key={`${f.experiment_id}-${f.run_id ?? i}`}>
            <p>{f.affects_selection ? '현재 조건과 관련되거나 조건이 불명확한 실패' : '다른 조건에서 발생한 실패'} · {f.error_code ?? '오류 코드 미기록'}: {f.error_message ?? '오류 설명 미기록'}</p>
            <Button size="sm" onClick={() => onFailure(f.study_id, f.experiment_id, f.run_id)}>실패 기록 보기</Button>
          </div>)}
          <Button size="sm" onClick={() => onMethod(m.slug)}>방법 상세</Button>
        </div>
      </details>)}
    </div>}
  </Section>;
}
