import type { BestResult, MethodRelation } from './types';

export type Direction = 'higher_is_better' | 'lower_is_better';
export type Verdict = 'improved' | 'regressed' | 'flat' | 'unknown';

export function fmtValue(v: number | null | undefined, unit = ''): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  let s: string;
  if (a >= 1000) s = v.toLocaleString('ko-KR', { maximumFractionDigits: 0 });
  else if (a >= 100) s = v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  else if (a >= 1) s = v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  else if (a === 0) s = '0';
  else s = v.toLocaleString('ko-KR', { maximumSignificantDigits: 3 });
  return unit ? `${s} ${unit}` : s;
}

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}초`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s ? `${m}분 ${s}초` : `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 방향을 고려한 판정. 변화가 기준(%) 미만이면 변화 없음으로 둔다. 색이 아니라 글자와 기호로도 말한다. */
export function verdictOf(relPct: number | null | undefined, direction: Direction, threshold = 1): Verdict {
  if (relPct === null || relPct === undefined || Number.isNaN(relPct)) return 'unknown';
  if (Math.abs(relPct) < threshold) return 'flat';
  const better = direction === 'higher_is_better' ? relPct > 0 : relPct < 0;
  return better ? 'improved' : 'regressed';
}
export const VERDICT_TEXT: Record<Verdict, { mark: string; word: string; tone: 'positive' | 'negative' | 'neutral' }> = {
  improved: { mark: '▲', word: '개선', tone: 'positive' },
  regressed: { mark: '▼', word: '퇴보', tone: 'negative' },
  flat: { mark: '―', word: '변화 없음', tone: 'neutral' },
  unknown: { mark: '?', word: '비교 불가', tone: 'neutral' },
};

export const DIRECTION_TEXT: Record<Direction, string> = { higher_is_better: '높을수록 좋음', lower_is_better: '낮을수록 좋음' };

export function shortId(id: string) { return id.slice(0, 8); }

export function asList(v: unknown): string[] { return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []; }

export function safeLink(url?: string | null) { return url && /^https?:\/\//i.test(url) ? url : undefined; }

export function stringify(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** 관계 행에서 자기 자신이 아닌 쪽 방법과 방향. */
export function relationOther(rel: MethodRelation, selfId: string) {
  const outgoing = rel.from_method_id === selfId;
  const ref = rel.other_method ?? (outgoing ? rel.to_method : rel.from_method);
  const id = outgoing ? rel.to_method_id : rel.from_method_id;
  return { id: ref?.id ?? id, slug: ref?.slug ?? id, name: ref?.name_ko || ref?.name || id.slice(0, 8), status: ref?.execution_status, outgoing };
}


/** 채택 결과의 이름. 대시보드 응답은 설정 id 없이 라벨만 줄 수 있다. */
export const bestLabel = (b: BestResult) => b.configuration_label ?? (b.configuration_id ? b.configuration_id.slice(0, 8) : '채택 결과');

/** 무엇에 대해 최적인가: 목표·지표·제약을 한 줄씩. 서버가 구조화해 주지 않은 예전 기록은 근거 글만 남는다. */
export function adoptionBasis(b: BestResult): string[] {
  const out: string[] = [];
  if (b.objective) out.push('목표: ' + b.objective);
  if (b.primary_metric) out.push('지표: ' + b.primary_metric);
  const c = b.constraints as { description?: string } | undefined;
  if (c?.description) out.push('제약: ' + c.description);
  return out;
}
