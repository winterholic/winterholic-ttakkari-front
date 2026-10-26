import { fmtValue } from '../format';
import type { SweepLineSeries } from '../types';
import { ChartFrame, niceTicks } from './ChartFrame';

const H = 240;
const M = { l: 52, r: 30, t: 14, b: 36 };

/** 파라미터 하나를 바꿀 때 지표가 어떻게 변하는지(민감도). 같은 값이 여러 설정에서 나오면 평균을 점으로 하고 n 을 표시한다. */
export function SweepLineChart({ series }: { series: SweepLineSeries }) {
  const numeric = series.points.every(p => typeof p.x === 'number');
  const pts = series.points.map((p, i) => ({ ...p, xv: numeric ? (p.x as number) : i }));
  const ys = pts.map(p => p.y).filter((v): v is number => v !== null);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const xt = numeric ? niceTicks(Math.min(...pts.map(p => p.xv)), Math.max(...pts.map(p => p.xv)), 4) : pts.map(p => p.xv);
  const [x0, x1] = [xt[0], xt[xt.length - 1]];
  const [y0, y1] = [yt[0], yt[yt.length - 1]];
  const best = ys.length ? pts.reduce((a, b) => ((b.y ?? -Infinity) > (a.y ?? -Infinity) ? b : a)) : null;
  const unit = series.unit ? ` (${series.unit})` : '';
  const summary = `${series.parameter} 변화에 따른 ${series.metric_label}: ${pts.map(p => `${p.x} → ${fmtValue(p.y)}`).join(', ')}`;
  return <ChartFrame title={`${series.parameter} → ${series.metric_label}`} sub={`지표가 좋아지는 방향은 지표 정의를 따릅니다${best && best.y !== null ? ` · 값이 가장 큰 지점 ${best.x}` : ''}`} height={H} summary={summary}
    table={{ columns: [series.parameter, `${series.metric_label}${unit}`, 'n'], rows: pts.map(p => [String(p.x), fmtValue(p.y), p.n ?? '—']) }}>
    {width => {
      const w = Math.max(120, width - M.l - M.r);
      const h = H - M.t - M.b;
      const px = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * w;
      const py = (v: number) => M.t + h - ((v - y0) / (y1 - y0 || 1)) * h;
      const segments: string[] = [];
      let cur: string[] = [];
      for (const p of pts) {
        if (p.y === null) { if (cur.length) segments.push(cur.join(' ')); cur = []; } else cur.push(`${px(p.xv)},${py(p.y)}`);
      }
      if (cur.length) segments.push(cur.join(' '));
      return <svg width={width} height={H} aria-hidden="true">
        {yt.map(t => <g key={`y${t}`}><line className="tk-chart__grid" x1={M.l} x2={M.l + w} y1={py(t)} y2={py(t)} /><text className="tk-chart__tick" x={M.l - 6} y={py(t) + 4} textAnchor="end">{fmtValue(t)}</text></g>)}
        {(numeric ? xt : pts.map(p => p.xv)).map((t, i) => <text key={`x${i}`} className="tk-chart__tick" x={px(t)} y={M.t + h + 16} textAnchor="middle">{numeric ? fmtValue(t) : String(pts[i].x)}</text>)}
        <line className="tk-chart__axis" x1={M.l} x2={M.l + w} y1={M.t + h} y2={M.t + h} />
        <line className="tk-chart__axis" x1={M.l} x2={M.l} y1={M.t} y2={M.t + h} />
        <text className="tk-chart__tick" x={M.l + w / 2} y={H - 4} textAnchor="middle">{series.parameter}</text>
        {segments.map((s, i) => <polyline key={i} className="tk-chart__line" data-series={1} points={s} />)}
        {pts.map((p, i) => p.y !== null && <circle key={i} className="tk-chart__dot" data-series={1} cx={px(p.xv)} cy={py(p.y)} r={4}><title>{`${p.x}: ${fmtValue(p.y)}${p.n ? ` (n=${p.n})` : ''}`}</title></circle>)}
      </svg>;
    }}
  </ChartFrame>;
}
