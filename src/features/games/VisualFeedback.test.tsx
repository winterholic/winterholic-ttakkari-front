import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { acceptCaptureMessage, pngBlobFromDataUrl } from "./captureBridge";
import { arrowFromDrag, boxFromDrag, buildPayload, freehandFromPoints, normalizePoint, MAX_FREEHAND_POINTS } from "./feedback";
import type { Annotation, Screenshot } from "./feedback";
import { VisualFeedback } from "./VisualFeedback";

afterEach(cleanup);

const shot: Screenshot = {
  blob: new Blob(["x"], { type: "image/png" }), url: "blob:x", width: 390, height: 844, source: "bridge-postmessage",
  capturedAt: "2026-10-19T01:00:00.000Z", buildId: "b2", buildSeq: 2, bundleSha256: "abcdef0123456789abcdef",
};

describe("정규화 좌표", () => {
  const rect = { left: 10, top: 20, width: 200, height: 400 };
  it("포인터 위치를 이미지 기준 0~1 로 바꾸고 영역 밖은 가장자리에 붙인다", () => {
    expect(normalizePoint(110, 220, rect)).toEqual([0.5, 0.5]);
    expect(normalizePoint(-500, 9999, rect)).toEqual([0, 1]);
    expect(normalizePoint(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual([0, 0]);
  });
  it("너무 작은 상자·화살표는 실수 터치로 버린다", () => {
    expect(boxFromDrag([0.5, 0.5], [0.505, 0.505])).toBeNull();
    expect(arrowFromDrag([0.5, 0.5], [0.505, 0.5])).toBeNull();
    expect(boxFromDrag([0.6, 0.7], [0.2, 0.1])).toEqual({ type: "box", x: 0.2, y: 0.1, w: 0.4, h: 0.6 });
  });
  it("자유 그리기는 점을 솎되 시작·끝점을 남긴다", () => {
    const pts: [number, number][] = Array.from({ length: 500 }, (_, i) => [i / 499, 0.5]);
    const a = freehandFromPoints(pts);
    expect(a?.type === "freehand" && a.points.length).toBe(MAX_FREEHAND_POINTS);
    expect(a?.type === "freehand" && a.points[0]).toEqual([0, 0.5]);
    expect(a?.type === "freehand" && a.points[a.points.length - 1]).toEqual([1, 0.5]);
    expect(freehandFromPoints([[0, 0]])).toBeNull();
  });
});

describe("payload", () => {
  it("빌드 ID·캡처 출처·정규화 좌표 공간·코멘트를 담는다", () => {
    const annotations: Annotation[] = [{ type: "box", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }];
    const p = buildPayload({ gameId: "g1", build: { id: "b2", seq: 2 }, screenshot: shot, annotations, comment: "  점프를 가볍게  " });
    expect(p).toMatchObject({
      version: 1, kind: "visual_feedback", game_id: "g1", build_id: "b2", build_seq: 2, coordinate_space: "normalized-0-1-top-left", comment: "점프를 가볍게",
      capture: { source: "bridge-postmessage", width: 390, height: 844, bundle_sha256: "abcdef0123456789abcdef" }, annotations,
    });
    expect(buildPayload({ gameId: "g1", build: { id: "b2", seq: 2 }, screenshot: null, annotations: [], comment: "글만" }).capture).toBeNull();
  });
});

describe("캡처 메시지 검증", () => {
  const png = "data:image/png;base64," + btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3));
  const frameWindow = {} as Window;
  const ctx = { frameWindow, gameOrigin: "http://127.0.0.1:18795", expectedId: "req1" };
  const good = { type: "ttakkari:capture:result", id: "req1", width: 390, height: 844, dataUrl: png };
  it("우리 iframe 이 보낸 올바른 응답만 받는다(sandbox 의 origin 은 'null')", () => {
    expect(acceptCaptureMessage({ origin: "null", source: frameWindow, data: good }, ctx)?.width).toBe(390);
    expect(acceptCaptureMessage({ origin: ctx.gameOrigin, source: frameWindow, data: good }, ctx)).not.toBeNull();
  });
  it.each([
    ["다른 창", { origin: "null", source: {} as Window, data: good }],
    ["다른 origin", { origin: "https://evil.example", source: frameWindow, data: good }],
    ["다른 id", { origin: "null", source: frameWindow, data: { ...good, id: "old" } }],
    ["다른 type", { origin: "null", source: frameWindow, data: { ...good, type: "x" } }],
    ["PNG 가 아닌 data URL", { origin: "null", source: frameWindow, data: { ...good, dataUrl: "data:text/html;base64,PHNjcmlwdD4=" } }],
    ["비정상 크기", { origin: "null", source: frameWindow, data: { ...good, width: 99999 } }],
    ["소수 크기", { origin: "null", source: frameWindow, data: { ...good, height: 1.5 } }],
    ["배열", { origin: "null", source: frameWindow, data: [good] }],
    ["문자열", { origin: "null", source: frameWindow, data: "hi" }],
  ])("%s 는 버린다", (_n, ev) => {
    expect(acceptCaptureMessage(ev, ctx)).toBeNull();
  });
  it("PNG 서명이 아닌 바이트는 Blob 으로 만들지 않는다", () => {
    expect(pngBlobFromDataUrl(png).type).toBe("image/png");
    expect(() => pngBlobFromDataUrl("data:image/png;base64," + btoa("<script>"))).toThrow();
  });
});

function Harness({ onChange }: { onChange?: (a: Annotation[]) => void }) {
  const [a, setA] = useState<Annotation[]>([]);
  return <VisualFeedback screenshot={shot} annotations={a} onChange={(n) => { setA(n); onChange?.(n); }} onDiscard={vi.fn()} />;
}

function drag(surface: HTMLElement, from: [number, number], to: [number, number], mid: [number, number][] = []) {
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400, right: 200, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(surface, { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
  for (const m of mid) fireEvent.pointerMove(surface, { clientX: m[0], clientY: m[1], pointerId: 1 });
  fireEvent.pointerUp(surface, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

describe("VisualFeedback 화면", () => {
  it("영역 박스·화살표·자유 그리기를 정규화 좌표 주석으로 만들고 되돌릴 수 있다", () => {
    const changes: Annotation[][] = [];
    render(<Harness onChange={(n) => changes.push(n)} />);
    const surface = screen.getByTestId("vf-surface");

    drag(surface, [20, 40], [120, 240]);
    expect(changes.at(-1)).toEqual([{ type: "box", x: 0.1, y: 0.1, w: 0.5, h: 0.5 }]);

    fireEvent.click(screen.getByRole("radio", { name: "화살표" }));
    drag(surface, [0, 0], [200, 400]);
    expect(changes.at(-1)?.[1]).toEqual({ type: "arrow", x1: 0, y1: 0, x2: 1, y2: 1 });

    fireEvent.click(screen.getByRole("radio", { name: "자유 그리기" }));
    drag(surface, [100, 100], [100, 300], [[100, 200]]);
    expect(changes.at(-1)?.[2]).toEqual({ type: "freehand", points: [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75]] });
    expect(surface.querySelectorAll("[data-annotation]").length).toBe(3);
    expect(screen.getByText(/표시 3\/20개/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "마지막 표시 지우기" }));
    expect(changes.at(-1)?.length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "표시 모두 지우기" }));
    expect(changes.at(-1)).toEqual([]);
  });
});
