import { describe, expect, it } from "vitest";
import { HIGHLIGHT_MAX_CHARS, languageFor, tokenizeLines } from "./highlight";

const join = (lines: ReturnType<typeof tokenizeLines>) => lines.map((l) => l.map((t) => t.text).join("")).join("\n");
const classesOf = (lines: ReturnType<typeof tokenizeLines>, text: string) =>
  lines.flat().filter((t) => t.text === text).map((t) => t.cls);

describe("tokenizeLines", () => {
  it("원문을 한 글자도 바꾸지 않는다", () => {
    const src = 'import { a } from "b";\n\n/* 여러\n줄 */\nconst x = `t\n${1}`; // 끝\n';
    expect(join(tokenizeLines(src, "a.ts"))).toBe(src);
  });

  it("주석·문자열·키워드·숫자를 칠한다", () => {
    const lines = tokenizeLines('const n = 42; // 메모\nreturn "hi";', "a.tsx");
    expect(classesOf(lines, "const")).toEqual(["keyword"]);
    expect(classesOf(lines, "42")).toEqual(["number"]);
    expect(classesOf(lines, "// 메모")).toEqual(["comment"]);
    expect(classesOf(lines, '"hi"')).toEqual(["string"]);
  });

  it("여러 줄 주석은 줄마다 같은 색으로 나뉜다", () => {
    const lines = tokenizeLines("/* a\nb */ x", "a.css");
    expect(lines).toHaveLength(2);
    expect(lines[0][0]).toEqual({ text: "/* a", cls: "comment" });
    expect(lines[1][0]).toEqual({ text: "b */", cls: "comment" });
  });

  it("파이썬 # 주석과 삼중 따옴표 문자열", () => {
    const lines = tokenizeLines('def f():\n    """doc\n    """\n    # c\n', "x.py");
    expect(classesOf(lines, "def")).toEqual(["keyword"]);
    expect(classesOf(lines, "# c")).toEqual(["comment"]);
    expect(lines[1].some((t) => t.cls === "string")).toBe(true);
  });

  it("모르는 확장자와 큰 파일은 칠하지 않고 줄만 나눈다", () => {
    expect(tokenizeLines("a\nb", "notes.log")).toEqual([[{ text: "a" }], [{ text: "b" }]]);
    const big = "const a = 1;\n".repeat(Math.ceil(HIGHLIGHT_MAX_CHARS / 13) + 1);
    expect(tokenizeLines(big, "a.ts").flat().every((t) => t.cls === undefined)).toBe(true);
  });

  it("닫히지 않은 문자열·주석에서도 멈추지 않는다", () => {
    const src = 'x = "열린 문자열\ny = /* 끝 없음';
    expect(join(tokenizeLines(src, "a.js"))).toBe(src);
  });
});

describe("languageFor", () => {
  it("확장자로 이름을 고른다", () => {
    expect(languageFor("Dialog.tsx")).toBe("typescript");
    expect(languageFor("service.py")).toBe("python");
    expect(languageFor("shell.css")).toBe("css");
    expect(languageFor("README")).toBe("plaintext");
  });
});
