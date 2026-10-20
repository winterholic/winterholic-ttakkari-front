import { describe, expect, it } from "vitest";
import { clipFiles } from "./recordBridge";
import type { ClipSelection } from "./recordBridge";
const dataUrl = "data:image/jpeg;base64,/9j/2Q==";
const clip: ClipSelection = { buildId: "b1", buildSeq: 1, startMs: 0, endMs: 1000, frames: [{ tMs: 0, dataUrl }, { tMs: 1000, dataUrl }] };
describe("전송 전 구간 검증", () => {
  it("선택한 프레임만 JPEG 파일로 바꾼다", () => {
    const files = clipFiles(clip, "b1");
    expect(files.map(f => [f.type, f.size])).toEqual([["image/jpeg", 4], ["image/jpeg", 4]]);
  });
  it.each([
    { startMs: -1 }, { endMs: 0 }, { endMs: 15001 }, { endMs: NaN }, { startMs: 0.5 },
    { frames: [] }, { frames: Array.from({length: 9}, (_,i) => ({ tMs: i, dataUrl })) },
    { frames: [{ tMs: 1000, dataUrl }, { tMs: 0, dataUrl }] },
    { frames: [{ tMs: 0, dataUrl }, { tMs: 0, dataUrl }] },
    { frames: [{ tMs: 1001, dataUrl }] }, { frames: [{ tMs: 0.5, dataUrl }] },
    { frames: [{ tMs: 0, dataUrl: "data:image/jpeg;base64,YmFk" }] },
  ])("잘못된 구간/프레임을 거부한다 %j", (patch) => {
    expect(() => clipFiles({ ...clip, ...patch }, "b1")).toThrow();
  });
  it("장당 1MB와 전체 6MB 상한을 각각 거부한다", () => {
    const jpeg = (n: number) => "data:image/jpeg;base64," + btoa("\xff\xd8" + "x".repeat(n - 4) + "\xff\xd9");
    expect(() => clipFiles({ ...clip, frames: [{ tMs: 0, dataUrl: jpeg(1024*1024+1) }] }, "b1")).toThrow(/1MB/);
    expect(() => clipFiles({ ...clip, frames: Array.from({length: 8}, (_,i) => ({tMs:i,dataUrl:jpeg(900*1024)})) }, "b1")).toThrow(/6MB/);
  });
});
