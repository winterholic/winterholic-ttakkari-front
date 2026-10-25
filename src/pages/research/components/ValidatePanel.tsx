import { useState } from 'react';
import { Button } from '../../../ui/Button';
import { fmtDuration, stringify } from '../format';
import type { Budget, ConfigPreview, ValidateResult } from '../types';
import { Badge } from '../../../ui/Badge';
import { Callout } from './parts';

const SHOW = 12;

/** 키별로 모든 설정에서 같은 값은 공통, 설정마다 달라지는 값만 따로 보여 준다. */
export function varyingKeys(list: ConfigPreview[]): string[] {
  const keys = [...new Set(list.flatMap(c => Object.keys(c.parameters ?? {})))];
  return keys.filter(k => new Set(list.map(c => JSON.stringify(c.parameters?.[k] ?? null))).size > 1);
}

interface Props { result?: ValidateResult; pending: boolean; error?: string; budget: Budget; stale: boolean; localErrors: string[] }

/** validate 결과: 확장될 설정 수, 예산 초과, 미지원 전략·환경 경고, 자원 예상. 생성 전에 문제를 읽게 한다. */
export function ValidatePanel({ result, pending, error, budget, stale, localErrors }: Props) {
  const [more, setMore] = useState(false);
  const cfgs = result?.expanded_configurations ?? [];
  const over = cfgs.length > budget.max_runs;
  const vary = varyingKeys(cfgs);
  const est = result?.resource_estimate;
  const overTime = est && est.estimated_seconds > budget.max_total_seconds;
  const overMem = est && est.estimated_memory_mb > budget.max_memory_mb;
  return <section className="rs-validate" aria-label="실험 검증 결과" aria-busy={pending}>
    <div className="rs-validate__head"><h3>생성 전 검증</h3>
      {pending ? <Badge>검증 중…</Badge> : error ? <Badge tone="danger">검증 실패</Badge> : result ? (result.valid && !localErrors.length ? <Badge tone="success">실행 가능</Badge> : <Badge tone="danger">고쳐야 할 항목 있음</Badge>) : <Badge>입력 대기</Badge>}
      {stale && !pending && <span className="rs-muted">입력이 바뀌었습니다. 곧 다시 검증합니다.</span>}</div>
    {error && <Callout kind="caution" title="검증 요청을 처리하지 못했습니다">{error}</Callout>}
    {localErrors.length > 0 && <Callout kind="caution" title="입력을 확인하세요"><ul className="rs-bullets">{localErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></Callout>}
    {result?.errors?.length ? <Callout kind="caution" title="실행할 수 없는 이유"><ul className="rs-bullets">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Callout> : null}
    {result?.warnings?.length ? <Callout kind="warning" title="주의"><ul className="rs-bullets">{result.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul></Callout> : null}
    {result && <>
      <dl className="tk-stats rs-validate__stats">
        <div className="tk-stat"><dt className="tk-stat__label">확장될 설정</dt><dd className="tk-stat__value" data-over={over || undefined}>{cfgs.length}<span className="tk-stat__unit"> / 예산 {budget.max_runs}</span></dd>{over && <span className="tk-stat__delta" data-tone="negative">▲ 예산 초과 {cfgs.length - budget.max_runs}</span>}</div>
        {est && <div className="tk-stat"><dt className="tk-stat__label">예상 시간</dt><dd className="tk-stat__value">{fmtDuration(est.estimated_seconds)}</dd>{overTime && <span className="tk-stat__delta" data-tone="negative">▲ 시간 예산 {fmtDuration(budget.max_total_seconds)} 초과</span>}</div>}
        {est && <div className="tk-stat"><dt className="tk-stat__label">예상 메모리</dt><dd className="tk-stat__value">{est.estimated_memory_mb.toLocaleString('ko-KR')}<span className="tk-stat__unit"> MB</span></dd>{overMem && <span className="tk-stat__delta" data-tone="negative">▲ 메모리 예산 초과</span>}</div>}
      </dl>
      {est && (est.requires_gpu_lease || est.requires_tts_lock || est.requires_cpu_lock) && <p className="rs-muted">실행 중 점유: {[est.requires_gpu_lease && '호스트 GPU', est.requires_tts_lock && 'TTS 작업 잠금', est.requires_cpu_lock && 'CPU 평가 잠금'].filter(Boolean).join(', ')}. 다른 작업이 쓰는 중이면 대기합니다.</p>}
      {cfgs.length > 0 && <div className="tk-datatable tk-datatable--sticky-col tk-datatable--compact">
        <div className="tk-datatable__bar">설정 미리보기 {cfgs.length}개{vary.length ? ` · 달라지는 값: ${vary.join(', ')}` : ' · 모든 설정이 같은 값'}</div>
        <div className="tk-datatable__scroll" role="region" aria-label="확장된 설정 표 (가로로 스크롤)" tabIndex={0}>
          <table><thead><tr><th scope="col">설정</th><th scope="col">역할</th>{vary.map(k => <th key={k} scope="col">{k}</th>)}</tr></thead>
            <tbody>{(more ? cfgs : cfgs.slice(0, SHOW)).map((c, i) => <tr key={`${c.config_hash ?? c.label}-${i}`}><th scope="row" className="tk-datatable__clip" title={c.label}>{c.label}</th><td>{c.role ?? '—'}</td>{vary.map(k => <td key={k}>{stringify(c.parameters?.[k])}</td>)}</tr>)}</tbody></table>
        </div>
        {cfgs.length > SHOW && <div className="tk-datatable__foot"><Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? '접기' : `나머지 ${cfgs.length - SHOW}개 보기`}</Button></div>}
      </div>}
    </>}
  </section>;
}
