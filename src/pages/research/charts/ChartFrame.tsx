import { useEffect, useRef, useState, type ReactNode } from 'react';

const FALLBACK_WIDTH = 560;

/** 차트 SVG 를 실제 화면 폭으로 그린다. viewBox 를 늘리면 글자가 같이 커지고 줄어 12px 아래로 떨어진다. */
export function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setWidth(w); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export interface TableData { columns: string[]; rows: Array<Array<string | number>> }

interface FrameProps {
  title: string; sub?: ReactNode; summary: string; height: number; legend?: ReactNode; readout?: string; table?: TableData; note?: ReactNode;
  children: (width: number) => ReactNode;
}

/** 디자인 시스템 .tk-chart 틀: 제목·범례·그림(role=img+한 문장 요약)·값 읽기 줄·데이터 표 대안. */
export function ChartFrame({ title, sub, summary, height, legend, readout, table, note, children }: FrameProps) {
  const [ref, width] = useChartWidth();
  return <figure className="tk-chart rs-chart">
    <div className="tk-chart__head"><h4 className="tk-chart__title">{title}</h4>{legend}</div>
    {sub && <p className="tk-chart__sub">{sub}</p>}
    <div className="tk-chart__plot rs-chart__plot" ref={ref} role="img" aria-label={summary} style={{ height }}>{children(width)}</div>
    {readout !== undefined && <p className="tk-chart__readout" role="status">{readout}</p>}
    {note}
    {table && <details className="tk-chart__data"><summary>데이터 표로 보기</summary>
      <div className="tk-datatable"><div className="tk-datatable__scroll" role="region" aria-label={`${title} 데이터 표 (가로로 스크롤)`} tabIndex={0}>
        <table><thead><tr>{table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j} className="tk-datatable__num">{v}</td>)}</tr>)}</tbody></table>
      </div></div></details>}
  </figure>;
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

export function clip(text: string, max: number) { return text.length > max ? `${text.slice(0, max - 1)}…` : text; }
