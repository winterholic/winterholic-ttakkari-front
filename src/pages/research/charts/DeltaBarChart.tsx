import { fmtPct, verdictOf, VERDICT_TEXT } from '../format';
import type { DeltaBarItem } from '../types';
import { ChartFrame, clip } from './ChartFrame';

const ROW = 32;
const TOP = 24;

/** Baseline 대비 상대 변화율(%) 수평 막대. 개선·퇴보는 색과 함께 ▲▼ 기호·글자로도 적는다. 한 번에 한 지표만 그린다. */
export function DeltaBarChart({ items, metricLabel, direction, baselineLabel, title, sub }: { items: DeltaBarItem[]; metricLabel: string; direction: 'higher_is_better' | 'lower_is_better'; baselineLabel?: string; title?: string; sub?: string }) {
  const rows = items.map(i => ({ ...i, verdict: verdictOf(i.rel_delta_pct, direction) }));
  const max = Math.max(5, ...rows.map(r => Math.abs(r.rel_delta_pct ?? 0)));
  const summary = rows.length
    ? `${metricLabel}: ${rows.map(r => `${r.label} ${fmtPct(r.rel_delta_pct)} ${VERDICT_TEXT[r.verdict].word}`).join(', ')}`
    : `${metricLabel}: 비교할 설정이 없습니다`;
  return <ChartFrame
    title={title ?? `${metricLabel} — ${baselineLabel ? `${baselineLabel} 대비` : 'Baseline 대비'} 변화`}
    sub={sub ?? (direction === 'higher_is_better' ? '높을수록 좋은 지표: 오른쪽(▲)이 개선' : '낮을수록 좋은 지표: 왼쪽(▼ 값 감소)이 개선')}
    summary={summary} height={rows.length * ROW + TOP}
    table={{ columns: ['설정', '변화율', '절대 변화', '판정'], rows: rows.map(r => [r.label, fmtPct(r.rel_delta_pct), r.abs_delta === null ? '—' : `${r.abs_delta > 0 ? '+' : ''}${Number(r.abs_delta.toPrecision(4))}${r.unit ? ` ${r.unit}` : ''}`, VERDICT_TEXT[r.verdict].word]) }}>
    {width => {
      const labelW = Math.min(Math.round(width * 0.38), 180);
      const gutter = 76; // 막대 끝 값 글자 자리
      const plotW = Math.max(40, width - labelW - gutter);
      const mid = labelW + plotW / 2;
      const scale = (plotW / 2 - 4) / max;
      const fit = Math.max(6, Math.floor(labelW / 7));
      return <svg width={width} height={rows.length * ROW + TOP} aria-hidden="true">
        <line className="tk-chart__axis" x1={mid} x2={mid} y1={TOP - 6} y2={rows.length * ROW + TOP} />
        <text className="tk-chart__tick" x={mid} y={12} textAnchor="middle">기준 0%</text>
        {rows.map((r, i) => {
          const y = TOP + i * ROW;
          const v = r.rel_delta_pct;
          const w = v === null ? 0 : Math.abs(v) * scale;
          const mark = VERDICT_TEXT[r.verdict];
          const x = v !== null && v < 0 ? mid - w : mid;
          return <g key={`${r.configuration_id}-${r.metric_key}`}>
            <text className="tk-chart__tick" x={0} y={y + ROW / 2 + 4}>{clip(r.label, fit)}</text>
            {v !== null && <rect className="rs-delta__bar" data-verdict={r.verdict} x={x} y={y + 6} width={Math.max(w, 1)} height={ROW - 12} rx={2} />}
            <text className="tk-chart__tick" x={v !== null && v < 0 ? x - 4 : x + w + 4} y={y + ROW / 2 + 4} textAnchor={v !== null && v < 0 ? 'end' : 'start'}>
              {v === null ? '비교 불가' : `${mark.mark} ${fmtPct(v)}`}
            </text>
          </g>;
        })}
      </svg>;
    }}
  </ChartFrame>;
}
