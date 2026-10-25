import { AXES, EXECUTION_STATUSES, type AxisKey, type Facets, type MethodQuery, type Taxonomy } from '../types';
import { AXIS_LABEL, EXECUTION, LIFECYCLE } from '../labels';

export type FilterKey = AxisKey | 'execution_status' | 'lifecycle_status';
export const FILTER_KEYS: FilterKey[] = [...AXES, 'execution_status', 'lifecycle_status'];
// URL 쿼리 이름. 연구 방법 축은 쿼리 충돌을 피해 rmethod 로 쓴다.
export const URL_KEY: Record<FilterKey, string> = { target: 'target', layer: 'layer', goal: 'goal', intervention: 'intervention', research_method: 'rmethod', execution_status: 'status', lifecycle_status: 'life' };
const TITLE: Record<FilterKey, string> = { ...AXIS_LABEL, lifecycle_status: '수명 단계' };

export function readQuery(params: URLSearchParams): MethodQuery {
  const list = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  return {
    q: params.get('q') ?? '', target: list('target'), layer: list('layer'), goal: list('goal'), intervention: list('intervention'), research_method: list('rmethod'),
    execution_status: list('status'), lifecycle_status: list('life'),
  };
}
export const activeCount = (q: MethodQuery) => FILTER_KEYS.reduce((n, k) => n + ((q[k] as string[] | undefined)?.length ?? 0), 0);

function options(key: FilterKey, taxonomy: Taxonomy, facets: Facets, labelOf: (axis: string, code: string) => string) {
  if (key === 'execution_status') return EXECUTION_STATUSES.map(c => ({ code: c, label: EXECUTION[c].label }));
  if (key === 'lifecycle_status') return (Object.keys(LIFECYCLE) as (keyof typeof LIFECYCLE)[]).map(c => ({ code: c, label: LIFECYCLE[c].label }));
  const terms = taxonomy[key] ?? [];
  const codes = terms.length ? terms.map(t => t.code) : Object.keys(facets[key] ?? {});
  return codes.map(c => ({ code: c, label: labelOf(key, c) }));
}

interface Props {
  query: MethodQuery; facets: Facets; taxonomy: Taxonomy; labelOf: (axis: string, code: string) => string;
  onToggle: (key: FilterKey, code: string) => void; onClear: () => void; hideTitle?: boolean;
}

/** 축별 다중 선택 + facet 건수. 건수는 서버가 다른 필터를 적용한 결과 기준으로 준다. 0건 항목도 눈에 보이게 두되 흐리게 한다. */
export function MethodFilters({ query, facets, taxonomy, labelOf, onToggle, onClear, hideTitle }: Props) {
  const n = activeCount(query);
  return <div className="rs-filters" role="group" aria-label="방법론 필터">
    <div className="rs-filters__head">{hideTitle ? <span /> : <strong>필터</strong>}{n > 0 && <button type="button" className="tk-button tk-button--ghost tk-button--sm" onClick={onClear}>모두 해제 ({n})</button>}</div>
    {FILTER_KEYS.map(key => {
      const opts = options(key, taxonomy, facets, labelOf);
      if (!opts.length) return null;
      const selected = (query[key] as string[] | undefined) ?? [];
      return <details key={key} className="rs-filters__group" open={key !== 'lifecycle_status' || selected.length > 0}>
        <summary>{TITLE[key]}{selected.length > 0 && <span className="tk-badge tk-badge--count" aria-label={`${selected.length}개 선택`}>{selected.length}</span>}</summary>
        <div className="tk-choices">{opts.map(o => {
          const count = facets[key]?.[o.code];
          return <label key={o.code} className="tk-checkbox rs-filters__opt" data-empty={count === 0 && !selected.includes(o.code) ? 'true' : undefined}>
            <input type="checkbox" checked={selected.includes(o.code)} onChange={() => onToggle(key, o.code)} />
            <span className="rs-filters__label">{o.label}</span>{count !== undefined && <span className="rs-filters__count">{count}</span>}
          </label>;
        })}</div>
      </details>;
    })}
  </div>;
}
