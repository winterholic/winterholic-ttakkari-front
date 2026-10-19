import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import {
  MAX_ANNOTATIONS, arrowFromDrag, boxFromDrag, freehandFromPoints, normalizePoint,
} from "./feedback";
import type { Annotation, AnnotationTool, Screenshot } from "./feedback";

const TOOLS: { id: AnnotationTool; label: string }[] = [
  { id: "box", label: "영역 박스" },
  { id: "arrow", label: "화살표" },
  { id: "freehand", label: "자유 그리기" },
];

type Draft = { tool: AnnotationTool; start: [number, number]; points: [number, number][] } | null;

/** 진행 중인 드래그를 미리 그리기 위한 임시 주석. */
function draftAnnotation(d: NonNullable<Draft>): Annotation | null {
  const end = d.points[d.points.length - 1] ?? d.start;
  if (d.tool === "box") return boxFromDrag(d.start, end);
  if (d.tool === "arrow") return arrowFromDrag(d.start, end);
  return freehandFromPoints([d.start, ...d.points]);
}

/** 정규화 좌표(0~1)를 viewBox 0..1 SVG 로 그린다. 선 두께는 vector-effect 로 화면 크기와 무관하게 일정하다. */
export function AnnotationShapes({ annotations }: { annotations: Annotation[] }) {
  return (
    <>
      {annotations.map((a, i) => {
        if (a.type === "box") return <rect key={i} className="vf-shape" x={a.x} y={a.y} width={a.w} height={a.h} data-annotation="box" />;
        if (a.type === "arrow") {
          const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
          const head = 0.035;
          const p = (d: number) => `${a.x2 - head * Math.cos(ang + d)},${a.y2 - head * Math.sin(ang + d)}`;
          return (
            <g key={i} data-annotation="arrow">
              <line className="vf-shape" x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
              <polygon className="vf-shape vf-shape--fill" points={`${a.x2},${a.y2} ${p(-0.45)} ${p(0.45)}`} />
            </g>
          );
        }
        return <polyline key={i} className="vf-shape" points={a.points.map(([x, y]) => `${x},${y}`).join(" ")} data-annotation="freehand" />;
      })}
    </>
  );
}

/**
 * 캡처한 스크린샷 위에 영역 박스·화살표·자유 주석을 그린다. 좌표는 이미지 기준 0~1 로만 저장해 기기 크기와 무관하다.
 * 터치와 마우스를 모두 포인터 이벤트로 받는다(touch-action: none 이라 그리는 동안 화면이 스크롤되지 않는다).
 */
export function VisualFeedback({
  screenshot,
  annotations,
  onChange,
  onDiscard,
}: {
  screenshot: Screenshot;
  annotations: Annotation[];
  onChange: (next: Annotation[]) => void;
  onDiscard: () => void;
}) {
  const [tool, setTool] = useState<AnnotationTool>("box");
  const [draft, setDraft] = useState<Draft>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const full = annotations.length >= MAX_ANNOTATIONS;

  const point = (e: ReactPointerEvent): [number, number] => {
    const rect = surfaceRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
    return normalizePoint(e.clientX, e.clientY, rect);
  };

  const down = (e: ReactPointerEvent) => {
    if (full || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDraft({ tool, start: point(e), points: [] });
  };
  const move = (e: ReactPointerEvent) => {
    if (!draft) return;
    const p = point(e);
    setDraft({ ...draft, points: draft.tool === "freehand" ? [...draft.points, p] : [p] });
  };
  const up = (e: ReactPointerEvent) => {
    if (!draft) return;
    const p = point(e);
    const finished = draftAnnotation({ ...draft, points: draft.tool === "freehand" ? [...draft.points, p] : [p] });
    setDraft(null);
    if (finished) onChange([...annotations, finished]);
  };

  const preview = draft ? draftAnnotation(draft) : null;
  const shown = preview ? [...annotations, preview] : annotations;

  return (
    <section className="vf" aria-label="화면에 표시하기">
      <div className="vf__bar">
        <div className="tk-segmented" role="radiogroup" aria-label="그리기 도구">
          {TOOLS.map((t) => (
            <label key={t.id}>
              <input type="radio" name="vf-tool" checked={tool === t.id} onChange={() => setTool(t.id)} />
              {t.label}
            </label>
          ))}
        </div>
        <div className="vf__actions">
          <Button size="xs" onClick={() => onChange(annotations.slice(0, -1))} disabled={annotations.length === 0} aria-label="마지막 표시 지우기">
            <Icon name="back" />
            <span>되돌리기</span>
          </Button>
          <Button size="xs" onClick={() => onChange([])} disabled={annotations.length === 0} aria-label="표시 모두 지우기">
            <Icon name="trash" />
            <span>모두 지우기</span>
          </Button>
        </div>
      </div>
      <div
        ref={surfaceRef}
        className="vf__surface"
        style={{ aspectRatio: `${screenshot.width} / ${screenshot.height}` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDraft(null)}
        data-testid="vf-surface"
      >
        <img className="vf__image" src={screenshot.url} alt="캡처한 게임 화면" draggable={false} width={screenshot.width} height={screenshot.height} />
        <svg className="vf__overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <AnnotationShapes annotations={shown} />
        </svg>
      </div>
      <p className="vf__meta">
        표시 {annotations.length}/{MAX_ANNOTATIONS}개 · v{screenshot.buildSeq} 빌드 캡처 · {screenshot.width}×{screenshot.height}
        {full && " · 더 그리려면 일부를 지워 주세요"}
        {" "}
        <button className="tk-link" type="button" onClick={onDiscard}>캡처 버리기</button>
      </p>
    </section>
  );
}
