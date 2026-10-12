import { describe, expect, it } from "vitest";
import { clipForView } from "./clip";

describe("clipForView", () => {
  it("마지막 개행 뒤 빈 줄은 줄로 세지 않고 CRLF 는 LF 로 맞춘다", () => {
    expect(clipForView("a\r\nb\r\n")).toEqual({ value: "a\nb", lines: 2, cut: null });
  });

  it("빈 파일은 0줄", () => {
    expect(clipForView("")).toEqual({ value: "", lines: 0, cut: null });
  });

  it("빈 줄도 한 줄로 센다", () => {
    expect(clipForView("a\n\nb").lines).toBe(3);
  });

  it("줄 수 한도를 넘으면 앞의 줄만 남기고 전체 줄 수를 알려 준다", () => {
    const c = clipForView("1\n2\n3\n4\n5\n", 1000, 3);
    expect(c).toEqual({ value: "1\n2\n3", lines: 3, cut: "lines", totalLines: 5 });
  });

  it("글자 한도에 걸리면 chars, 그 안에서 줄 한도도 넘으면 lines 와 원본 전체 줄 수", () => {
    expect(clipForView("abcdef", 3)).toEqual({ value: "abc", lines: 1, cut: "chars", totalLines: undefined });
    const c = clipForView("a\nb\nc\nd\ne\nf\n", 7, 2);
    expect(c.cut).toBe("lines");
    expect(c.value).toBe("a\nb");
    expect(c.totalLines).toBe(6);
  });

  it("한도와 같은 줄 수는 자르지 않는다", () => {
    expect(clipForView("1\n2\n3\n", 1000, 3)).toEqual({ value: "1\n2\n3", lines: 3, cut: null });
  });
});
