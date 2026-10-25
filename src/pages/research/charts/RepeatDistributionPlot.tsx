import { fmtValue, DIRECTION_TEXT, type Direction } from '../format';
import type { RepeatDistributionItem } from '../types';
import { ChartFrame, clip, niceTicks } from './ChartFrame';

const ROW = 36;
const TOP = 6;
const AXIS = 24;

/** 반복 실행 분포: 최소~최대 선, ±표준편차 띠, 평균(점)·중앙값(눈금)과 실제 실행 값. n<2 는 변동성 미상으로 적는다. */
export function RepeatDistributionPlot({ items, metricLabel, unit, direction }: { items: RepeatDistributionItem[]; metricLabel: string; unit?: string; direction: Direction }) {
  const all = items.flatMap(i => [i.min, i.max, ...(i.values ?? [])]).filter((v): v is number => v !== null);
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const ticks = niceTicks(lo, hi, 4);
  const d0 = ticks[0];
  const d1 = ticks[ticks.length - 1] === d0 ? d0 + 1 : ticks[ticks.length - 1];
  const unknown = items.filter(i => i.n < 2).length;
  const summary = `${metricLabel} 반복 분포: ${items.map(i => `${i.label} n=${i.n} 평균 ${fmtValue(i.mean, unit)}${i.n < 2 ? ' 변동성 미상' : ` 범위 ${fmtValue(i.min)}~${fmtValue(i.max)}`}`).join(', ')}`;
  return <ChartFrame title={`${metricLabel} — 반복 분포`} sub={`${DIRECTION_TEXT[direction]}${unit ? ` · 단위 ${unit}` : ''}${unknown ? ` · ${unknown}개 설정은 실행이 1회라 변동성 미상` : ''}`}
    summary={summary} height={items.length * ROW + TOP + AXIS}
    table={{ columns: ['설정', 'n', '평균', '중앙값', '표준편차', '최소', '최대'], rows: items.map(i => [i.label, i.n, fmtValue(i.mean), fmtValue(i.median), i.n < 2 ? '변동성 미상' : fmtValue(i.std), fmtValue(i.min), fmtValue(i.max)]) }}>
    {width => {
      const labelW = Math.min(Math.round(width * 0.3), 150);
      const right = 12;
      const plotW = Math.max(40, width - labelW - right);
      const x = (v: number) => labelW + ((v - d0) / (d1 - d0)) * plotW;
      const fit = Math.max(6, Math.floor(labelW / 7));
      const base = items.length * ROW + TOP;
      return <svg width={width} height={base + AXIS} aria-hidden="true">
        {ticks.map(t => <g key={t}>
          <line className="tk-chart__grid" x1={x(t)} x2={x(t)} y1={TOP} y2={base} />
          <text className="tk-chart__tick" x={x(t)} y={base + 16} textAnchor="middle">{fmtValue(t)}</text>
        </g>)}
        {items.map((it, i) => {
          const y = TOP + i * ROW + ROW / 2;
          return <g key={`${it.configuration_id}-${i}`}>
            <text className="tk-chart__tick" x={0} y={y + 4}>{clip(it.label, fit)}</text>
            {it.n >= 2 && it.min !== null && it.max !== null && <line className="rs-dist__range" x1={x(it.min)} x2={x(it.max)} y1={y} y2={y} />}
            {it.n >= 2 && it.mean !== null && it.std !== null && <rect className="rs-dist__band" x={x(Math.max(d0, it.mean - it.std))} y={y - 8} width={Math.max(2, x(Math.min(d1, it.mean + it.std)) - x(Math.max(d0, it.mean - it.std)))} height={16} rx={2} />}
            {(it.values ?? []).map((v, k) => <circle key={k} className="rs-dist__point" cx={x(v)} cy={y} r={3} />)}
            {it.median !== null && it.n >= 2 && <line className="rs-dist__median" x1={x(it.median)} x2={x(it.median)} y1={y - 10} y2={y + 10} />}
            {it.mean !== null && <circle className="tk-chart__dot" data-series={1} cx={x(it.mean)} cy={y} r={5} />}
            {it.n < 2 && <text className="tk-chart__tick" x={Math.min(width - 4, x(it.mean ?? d0) + 10)} y={y + 4}>변동성 미상 (n={it.n})</text>}
          </g>;
        })}
      </svg>;
    }}
  </ChartFrame>;
}
