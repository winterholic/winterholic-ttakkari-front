import { useState } from 'react';
import { Badge } from '../../../ui/Badge';
import { fmtValue, DIRECTION_TEXT } from '../format';
import type { ParetoSeries } from '../types';
import { ChartFrame, niceTicks } from './ChartFrame';

const H = 300;
const M = { l: 52, r: 16, t: 14, b: 40 };

/**
 * 두 지표의 trade-off 산점도. 파레토 프론티어(두 축 모두에서 다른 점에게 밀리지 않는 점)를 선으로 잇는다.
 * 그림(role=img)의 점은 마우스·터치로 누를 수 있고, 키보드·스크린 리더는 아래 번호 목록의 버튼으로 같은 점을 고른다.
 */
export function ParetoScatterPlot({ series }: { series: ParetoSeries }) {
  const [active, setActive] = useState<string | null>(null);
  const pts = series.points;
  const frontier = pts.filter(p => p.is_pareto_optimal).sort((a, b) => a.x - b.x);
  const xs = niceTicks(Math.min(...pts.map(p => p.x)), Math.max(...pts.map(p => p.x)), 4);
  const ys = niceTicks(Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.y)), 4);
  const [x0, x1] = [xs[0], xs[xs.length - 1]];
  const [y0, y1] = [ys[0], ys[ys.length - 1]];
  const sel = pts.find(p => p.configuration_id === active);
  const betterX = series.x_direction === 'higher_is_better' ? '오른쪽' : '왼쪽';
  const betterY = series.y_direction === 'higher_is_better' ? '위' : '아래';
  const unitX = series.x_unit ? ' ' + series.x_unit : '';
  const unitY = series.y_unit ? ' ' + series.y_unit : '';
  const summary = series.x_label + ' 대 ' + series.y_label + ' 산점도. 점 ' + pts.length + '개, 파레토 최적 ' + frontier.length + '개: ' + (frontier.map(p => p.label).join(', ') || '없음');
  const legend = <ol className="rs-pareto__legend" aria-label="점 목록">
    {pts.map((p, i) => <li key={p.configuration_id}>
      <button type="button" className="tk-chip" aria-pressed={p.configuration_id === active} onClick={() => setActive(p.configuration_id)}>
        <span className="rs-pareto__no">{i + 1}</span> {p.label}</button>
      {p.is_pareto_optimal && <Badge tone="success">파레토 최적</Badge>}
    </li>)}
  </ol>;
  return <ChartFrame title={series.x_label + ' × ' + series.y_label} height={H}
    sub={'가로 ' + series.x_label + '(' + DIRECTION_TEXT[series.x_direction] + '), 세로 ' + series.y_label + '(' + DIRECTION_TEXT[series.y_direction] + ') · 좋은 쪽은 ' + betterX + '·' + betterY}
    summary={summary} note={legend}
    readout={sel ? sel.label + ' · ' + series.x_label + ' ' + fmtValue(sel.x) + unitX + ' · ' + series.y_label + ' ' + fmtValue(sel.y) + unitY + (sel.is_pareto_optimal ? ' · 파레토 최적' : ' · 다른 설정에 밀림') : '점이나 아래 목록의 설정을 눌러 값을 확인하세요'}
    table={{ columns: ['설정', series.x_label + (series.x_unit ? ' (' + series.x_unit + ')' : ''), series.y_label + (series.y_unit ? ' (' + series.y_unit + ')' : ''), '파레토'], rows: pts.map(p => [p.label, fmtValue(p.x), fmtValue(p.y), p.is_pareto_optimal ? '최적' : '—']) }}>
    {width => {
      const w = Math.max(120, width - M.l - M.r);
      const h = H - M.t - M.b;
      const px = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * w;
      const py = (v: number) => M.t + h - ((v - y0) / (y1 - y0 || 1)) * h;
      return <svg width={width} height={H} aria-hidden="true">
        {ys.map(t => <g key={'y' + t}><line className="tk-chart__grid" x1={M.l} x2={M.l + w} y1={py(t)} y2={py(t)} /><text className="tk-chart__tick" x={M.l - 6} y={py(t) + 4} textAnchor="end">{fmtValue(t)}</text></g>)}
        {xs.map(t => <g key={'x' + t}><line className="tk-chart__grid" x1={px(t)} x2={px(t)} y1={M.t} y2={M.t + h} /><text className="tk-chart__tick" x={px(t)} y={M.t + h + 16} textAnchor="middle">{fmtValue(t)}</text></g>)}
        <line className="tk-chart__axis" x1={M.l} x2={M.l + w} y1={M.t + h} y2={M.t + h} />
        <line className="tk-chart__axis" x1={M.l} x2={M.l} y1={M.t} y2={M.t + h} />
        <text className="tk-chart__tick" x={M.l + w / 2} y={H - 4} textAnchor="middle">{series.x_label}{unitX && ' (' + series.x_unit + ')'}</text>
        {frontier.length > 1 && <polyline className="tk-chart__line rs-pareto__front" data-dash={1} points={frontier.map(p => px(p.x) + ',' + py(p.y)).join(' ')} />}
        {pts.map((p, i) => {
          const on = p.configuration_id === active;
          return <g key={p.configuration_id} className="rs-pareto__pt" data-pareto={p.is_pareto_optimal ? 'true' : 'false'} data-active={on ? 'true' : undefined} onClick={() => setActive(p.configuration_id)}>
            <circle cx={px(p.x)} cy={py(p.y)} r={on ? 11 : 9} className="rs-pareto__dot" />
            <text x={px(p.x)} y={py(p.y) + 4} textAnchor="middle" className="rs-pareto__no">{i + 1}</text>
          </g>;
        })}
      </svg>;
    }}
  </ChartFrame>;
}
