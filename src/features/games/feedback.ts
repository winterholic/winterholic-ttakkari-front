// 시각적 피드백의 데이터 모델. 좌표는 캡처 이미지 기준 0~1 정규화(왼쪽 위가 0,0)라 화면 크기와 무관하게 같은 위치를 가리킨다.
import type { ArtifactOut } from "../../api/types";
import type { GameBuild } from "../../api/gameTypes";

export type Annotation =
  | { type: "box"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "freehand"; points: [number, number][] };

export type AnnotationTool = "box" | "arrow" | "freehand";
export type CaptureSource = "bridge-postmessage";

export interface Screenshot {
  blob: Blob;
  /** 화면에 보일 object URL. 화면이 닫히면 해제해야 한다. */
  url: string;
  width: number;
  height: number;
  source: CaptureSource;
  capturedAt: string;
  buildId: string;
  buildSeq: number;
  bundleSha256: string;
}

export interface FeedbackPayload {
  version: 1;
  kind: "visual_feedback";
  game_id: string;
  build_id: string;
  build_seq: number;
  capture: null | {
    source: CaptureSource;
    width: number;
    height: number;
    captured_at: string;
    bundle_sha256: string;
    artifact_id?: string;
    annotated_artifact_id?: string;
  };
  coordinate_space: "normalized-0-1-top-left";
  annotations: Annotation[];
  comment: string;
}

export const MAX_FREEHAND_POINTS = 80;
export const MAX_ANNOTATIONS = 20;
const MIN_BOX = 0.01;

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const round4 = (v: number): number => Math.round(clamp01(v) * 10000) / 10000;

/** 포인터 위치(px)를 이미지 영역 안 0~1 좌표로. 영역 밖으로 끌어도 가장자리에 붙는다. */
export function normalizePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number] {
  if (rect.width <= 0 || rect.height <= 0) return [0, 0];
  return [round4((clientX - rect.left) / rect.width), round4((clientY - rect.top) / rect.height)];
}

/** 너무 작은 상자·화살표는 실수 터치로 보고 버린다(null). */
export function boxFromDrag(a: [number, number], b: [number, number]): Annotation | null {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  const w = Math.abs(a[0] - b[0]);
  const h = Math.abs(a[1] - b[1]);
  if (w < MIN_BOX || h < MIN_BOX) return null;
  return { type: "box", x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
}

export function arrowFromDrag(a: [number, number], b: [number, number]): Annotation | null {
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < MIN_BOX * 2) return null;
  return { type: "arrow", x1: round4(a[0]), y1: round4(a[1]), x2: round4(b[0]), y2: round4(b[1]) };
}

/** 점이 너무 많으면 균등하게 솎는다. 시작·끝점은 남긴다. */
export function freehandFromPoints(points: [number, number][]): Annotation | null {
  if (points.length < 2) return null;
  let pts = points;
  if (pts.length > MAX_FREEHAND_POINTS) {
    const step = (pts.length - 1) / (MAX_FREEHAND_POINTS - 1);
    pts = Array.from({ length: MAX_FREEHAND_POINTS }, (_, i) => points[Math.round(i * step)]);
  }
  return { type: "freehand", points: pts.map(([x, y]) => [round4(x), round4(y)]) };
}

export function buildPayload(input: {
  gameId: string;
  build: Pick<GameBuild, "id" | "seq">;
  screenshot: Screenshot | null;
  annotations: Annotation[];
  comment: string;
  artifact?: ArtifactOut | null;
  annotatedArtifact?: ArtifactOut | null;
}): FeedbackPayload {
  const { screenshot: s } = input;
  return {
    version: 1,
    kind: "visual_feedback",
    game_id: input.gameId,
    build_id: input.build.id,
    build_seq: input.build.seq,
    capture: s && {
      source: s.source,
      width: s.width,
      height: s.height,
      captured_at: s.capturedAt,
      bundle_sha256: s.bundleSha256,
      ...(input.artifact ? { artifact_id: input.artifact.id } : {}),
      ...(input.annotatedArtifact ? { annotated_artifact_id: input.annotatedArtifact.id } : {}),
    },
    coordinate_space: "normalized-0-1-top-left",
    annotations: input.annotations.slice(0, MAX_ANNOTATIONS),
    comment: input.comment.trim(),
  };
}

/**
 * worker 에게 갈 요청 문장. back 의 요청 계약에는 구조화 필드가 없어(RequestIn: kind·instruction·build_id) 사람이 읽는 문장과
 * 같은 내용의 JSON 을 함께 싣는다. 스크린샷은 Artifact ID 로만 가리킨다.
 */
export function composeInstruction(payload: FeedbackPayload, artifacts: { original?: ArtifactOut | null; annotated?: ArtifactOut | null }): string {
  const lines = ["[시각적 피드백] 게임 화면을 보고 사용자가 남긴 수정 요청입니다.", `- 대상 빌드: v${payload.build_seq} (build_id=${payload.build_id})`];
  if (payload.capture) {
    lines.push(`- 캡처: 게임 bridge(postMessage)가 만든 ${payload.capture.width}×${payload.capture.height} PNG, 번들 sha256 ${payload.capture.bundle_sha256.slice(0, 16)}`);
    if (artifacts.original) lines.push(`- 스크린샷 Artifact: ${artifacts.original.id} (${artifacts.original.filename}, sha256 ${artifacts.original.sha256.slice(0, 16)})`);
    if (artifacts.annotated) lines.push(`- 주석을 그린 스크린샷 Artifact: ${artifacts.annotated.id} (${artifacts.annotated.filename})`);
    lines.push(`- 주석 ${payload.annotations.length}개. 좌표는 이미지 왼쪽 위가 (0,0), 오른쪽 아래가 (1,1)인 0~1 비율입니다.`);
  } else {
    lines.push("- 캡처 없음: 글로만 남긴 요청입니다.");
  }
  lines.push("", "[사용자 지시]", payload.comment, "", "[구조화 payload]", "```json", JSON.stringify(payload), "```");
  return lines.join("\n");
}

/** 주석을 그린 PNG. 브라우저 canvas 가 있을 때만 만든다(테스트 환경에는 없다). */
export async function renderAnnotatedPng(shot: Screenshot, annotations: Annotation[]): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  const canvas = document.createElement("canvas");
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const bmp = await createImageBitmap(shot.blob);
  ctx.drawImage(bmp, 0, 0, shot.width, shot.height);
  bmp.close();
  const unit = Math.max(2, Math.round(Math.min(shot.width, shot.height) / 120));
  ctx.lineWidth = unit;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // 화면 주석과 같은 위험색(토큰). 토큰을 못 읽는 환경(테스트)에서는 기본 빨강.
  const color = getComputedStyle(document.documentElement).getPropertyValue("--tk-color-action-danger-bg").trim() || "red";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const X = (v: number) => v * shot.width;
  const Y = (v: number) => v * shot.height;
  for (const a of annotations) {
    ctx.beginPath();
    if (a.type === "box") ctx.strokeRect(X(a.x), Y(a.y), X(a.w), Y(a.h));
    else if (a.type === "arrow") {
      const [x1, y1, x2, y2] = [X(a.x1), Y(a.y1), X(a.x2), Y(a.y2)];
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = unit * 5;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    } else {
      a.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(X(px), Y(py)) : ctx.lineTo(X(px), Y(py))));
      ctx.stroke();
    }
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}
