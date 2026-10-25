import { fmtValue, DIRECTION_TEXT } from '../format';
import type { MetricBarGroup } from '../types';
import { ChartFrame, clip } from './ChartFrame';

const ROW = 30;

/** 한 지표를 설정별 막대로 나란히 본다. 지표마다 단위가 달라 지표 하나가 차트 하나다. */
export function MetricComparisonBar({ group, baselineId }: { group: MetricBarGroup; baselineId?: string | null }) {
  const vals = group.values.filter(v => v.value !== null) as Array<{ configuration_id: string; label: string; value: number; n?: number }>;
  const max = Math.max(0, ...vals.map(v => v.value));
  const min = Math.min(0, ...vals.map(v => v.value));
  const span = max - min || 1;
  const best = vals.length ? (group.direction === 'higher_is_better' ? Math.max(...vals.map(v => v.value)) : Math.min(...vals.map(v => v.value))) : null;
  const summary = `${group.metric_label}: ${group.values.map(v => `${v.label} ${fmtValue(v.value, group.unit)}`).join(', ')}`;
  return <ChartFrame title={group.metric_label} sub={`${DIRECTION_TEXT[group.direction]}${group.unit ? ` · 단위 ${group.unit}` : ''}${vals.length > 1 ? ' · ★ 이 지표에서만 가장 좋은 값' : ''}`} summary={summary} height={group.values.length * ROW + 4}
    table={{ columns: ['설정', group.unit ? `값 (${group.unit})` : '값', '실행 수'], rows: group.values.map(v => [v.label, fmtValue(v.value), v.n ?? '—']) }}>
    {width => {
      const labelW = Math.min(Math.round(width * 0.34), 170);
      const valueW = 92;
      const plotW = Math.max(40, width - labelW - valueW);
      const zero = labelW + ((0 - min) / span) * plotW;
      const fit = Math.max(6, Math.floor(labelW / 7));
      return <svg width={width} height={group.values.length * ROW + 4} aria-hidden="true">
        {group.values.map((v, i) => {
          const y = 2 + i * ROW;
          const isBase = v.configuration_id === baselineId;
          const w = v.value === null ? 0 : (Math.abs(v.value) / span) * plotW;
          const x = v.value !== null && v.value < 0 ? zero - w : zero;
          return <g key={v.configuration_id}>
            <text className="tk-chart__tick" x={0} y={y + ROW / 2 + 3}>{clip(`${isBase ? '● ' : ''}${v.label}`, fit)}</text>
            {v.value !== null && <rect className="tk-chart__bar rs-metric__bar" data-series={isBase ? 6 : 1} data-best={v.value === best && vals.length > 1 ? 'true' : undefined} x={x} y={y + 5} width={Math.max(w, 1)} height={ROW - 12} rx={2} />}
            <text className="tk-chart__tick" x={Math.min(width - 2, (v.value !== null && v.value < 0 ? x : x + w) + 6)} y={y + ROW / 2 + 3} textAnchor="start">
              {v.value === null ? '측정 없음' : `${fmtValue(v.value)}${v.value === best && vals.length > 1 ? ' ★' : ''}`}
            </text>
          </g>;
        })}
        <line className="tk-chart__axis" x1={zero} x2={zero} y1={0} y2={group.values.length * ROW + 4} />
      </svg>;
    }}
  </ChartFrame>;
}
