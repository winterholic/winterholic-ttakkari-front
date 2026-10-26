import { useId, type ReactNode } from 'react';
import { Icon } from '../../../ui/Icon';

type CalloutKind = 'note' | 'tip' | 'warning' | 'caution';
const CALLOUT_ICON = { note: 'info', tip: 'tip', warning: 'warning', caution: 'caution' } as const;

export function Callout({ kind = 'note', title, children, role }: { kind?: CalloutKind; title?: string; children: ReactNode; role?: 'alert' | 'note' | 'status' }) {
  return <aside className={`tk-callout tk-callout--${kind}`} role={role ?? (kind === 'caution' ? 'alert' : 'note')}>
    <Icon name={CALLOUT_ICON[kind]} className="tk-callout__icon" />
    <div className="tk-callout__body">{title && <strong className="tk-callout__title">{title}</strong>}<div>{children}</div></div>
  </aside>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="tk-empty tk-empty--boxed" role="status"><p className="tk-empty__title">{title}</p>{children && <p>{children}</p>}{action}</div>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="tk-stack tk-gap-3" aria-busy="true" aria-label="불러오는 중">{Array.from({ length: rows }, (_, i) => <div key={i} className="tk-skeleton tk-skeleton--block rs-skeleton" />)}</div>;
}

export function Section({ title, hint, actions, children, id }: { title: string; hint?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string }) {
  const auto = useId();
  const labelId = (id ?? auto) + '-t';
  return <section className="rs-section" aria-labelledby={labelId} id={id}>
    <div className="rs-section__head"><div><h3 id={labelId}>{title}</h3>{hint && <p className="rs-muted">{hint}</p>}</div>{actions && <div className="rs-actions">{actions}</div>}</div>
    {children}
  </section>;
}

export function Chip({ pressed, onClick, children, count, disabled }: { pressed: boolean; onClick: () => void; children: ReactNode; count?: number; disabled?: boolean }) {
  return <button type="button" className="tk-chip" aria-pressed={pressed} onClick={onClick} disabled={disabled}>{children}{count !== undefined && <span className="rs-chip-count">{count}</span>}</button>;
}

export function Stat({ label, value, unit, delta, tone }: { label: string; value: ReactNode; unit?: string; delta?: ReactNode; tone?: 'positive' | 'negative' | 'warning' | 'neutral' }) {
  return <div className="tk-stat"><span className="tk-stat__label">{label}</span><span className="tk-stat__value">{value}{unit && <span className="tk-stat__unit"> {unit}</span>}</span>{delta && <span className="tk-stat__delta" data-tone={tone ?? 'neutral'}>{delta}</span>}</div>;
}

export function BulletList({ items, empty }: { items: unknown[]; empty?: string }) {
  const list = items.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean);
  if (!list.length) return <p className="rs-muted">{empty ?? '기록된 내용이 없습니다.'}</p>;
  return <ul className="rs-bullets">{list.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** 임의 객체를 읽을 수 있게 푼다: 값 하나짜리는 항목 목록, 문자열 목록은 줄, 그 밖의 중첩은 접어서 원본으로 둔다. */
export function FactList({ data, empty = '기록된 정보가 없습니다.' }: { data: Record<string, unknown> | null | undefined; empty?: string }) {
  const entries = Object.entries(data ?? {});
  if (!entries.length) return <p className="rs-muted">{empty}</p>;
  const scalar = entries.filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v));
  const lists = entries.filter(([, v]) => Array.isArray(v) && (v as unknown[]).every(x => typeof x === 'string'));
  const rest = entries.filter(([k]) => !scalar.some(([s]) => s === k) && !lists.some(([l]) => l === k));
  return <div className="rs-facts">
    {scalar.length > 0 && <dl className="tk-meta">{scalar.map(([k, v]) => <div key={k} className="rs-meta-row"><dt>{k}</dt><dd className="tk-mono">{v === null ? '—' : String(v)}</dd></div>)}</dl>}
    {lists.map(([k, v]) => <div key={k}><p className="rs-muted">{k}</p><ul className="rs-bullets">{(v as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
    {rest.length > 0 && <details className="rs-advanced"><summary>원본 보기 ({rest.map(([k]) => k).join(', ')})</summary><pre className="rs-pre">{JSON.stringify(Object.fromEntries(rest), null, 2)}</pre></details>}
  </div>;
}
