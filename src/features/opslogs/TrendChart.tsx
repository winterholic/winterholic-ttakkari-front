import type { OpsTrend } from "../../api/opsLogTypes";

const W = 320;
const H = 72;

/** 발생 추이 막대. 값은 시간 단위 집계라 샘플링과 무관하다. 색은 한 가지, 정확한 값은 접근 가능한 요약 문장으로 준다. */
export function TrendChart({ trend }: { trend: OpsTrend }) {
  const points = trend.points;
  const max = Math.max(1, ...points.map((p) => p.count));
  const slot = W / Math.max(1, points.length);
  const label = `최근 ${trend.hours}시간 오류 ${trend.total}건`;
  return (
    <figure className="ops-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
        {points.map((p, i) => {
          const h = p.count === 0 ? 0 : Math.max(2, (p.count / max) * (H - 4));
          return <rect key={p.at} x={i * slot + slot * 0.12} y={H - h} width={Math.max(1, slot * 0.76)} height={h} rx={1.5} data-empty={p.count === 0 || undefined} />;
        })}
      </svg>
      <figcaption>
        <span>{label}</span>
        <span>최대 {max}건/{trend.unit === "hour" ? "시간" : "일"}</span>
      </figcaption>
    </figure>
  );
}
