import { describe, expect, it } from "vitest";
import { countDiffLines, parsePatch, PATCH_COLLAPSE_BYTES, patchBytes } from "./parsePatch";

describe("parsePatch", () => {
  it("hunk 머리와 줄 번호·종류를 계산한다", () => {
    const hunks = parsePatch("@@ -1,3 +1,4 @@ function a() {\n ctx\n-old\n+new1\n+new2\n tail");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe("@@ -1,3 +1,4 @@ function a() {");
    expect(hunks[0].lines.map((l) => [l.type, l.oldNo, l.newNo, l.text])).toEqual([
      ["ctx", 1, 1, "ctx"],
      ["del", 2, undefined, "old"],
      ["add", undefined, 2, "new1"],
      ["add", undefined, 3, "new2"],
      ["ctx", 3, 4, "tail"],
    ]);
  });

  it("개수를 생략한 머리(@@ -1 +1 @@)와 여러 hunk 를 읽는다", () => {
    const hunks = parsePatch("@@ -1 +1 @@\n-a\n+b\n@@ -10,2 +10,2 @@\n x\n-y\n+z");
    expect(hunks).toHaveLength(2);
    expect(hunks[0].lines[0]).toMatchObject({ type: "del", oldNo: 1 });
    expect(hunks[0].lines[1]).toMatchObject({ type: "add", newNo: 1 });
    expect(hunks[1].lines[0]).toMatchObject({ type: "ctx", oldNo: 10, newNo: 10 });
  });

  it("'\\ No newline' 은 번호 없는 안내 줄", () => {
    const hunks = parsePatch("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b");
    expect(hunks[0].lines[1]).toMatchObject({ type: "meta", text: "No newline at end of file" });
    expect(hunks[0].lines[2]).toMatchObject({ type: "add", newNo: 1 });
  });

  it("공백 접두가 잘려 빈 문자열이 된 문맥 줄도 문맥으로 센다", () => {
    const hunks = parsePatch("@@ -1,3 +1,3 @@\n a\n\n c");
    expect(hunks[0].lines.map((l) => l.type)).toEqual(["ctx", "ctx", "ctx"]);
    expect(hunks[0].lines[2]).toMatchObject({ oldNo: 3, newNo: 3 });
  });

  it("hunk 머리 앞의 글자와 빈 입력은 안전하게 처리한다", () => {
    expect(parsePatch("")).toEqual([]);
    expect(parsePatch("garbage without header")).toEqual([]);
  });

  it("+++/--- 로 시작하는 본문 줄도 추가·삭제 줄로 본다", () => {
    const hunks = parsePatch("@@ -1 +1 @@\n---- dash\n++++ plus");
    expect(hunks[0].lines.map((l) => l.type)).toEqual(["del", "add"]);
    expect(hunks[0].lines[0].text).toBe("--- dash");
  });
});

describe("크기 계산", () => {
  it("patch 바이트와 줄 수를 센다", () => {
    expect(patchBytes("가나")).toBe(6);
    const hunks = parsePatch("@@ -1,2 +1,2 @@\n a\n-b\n+c\n@@ -9 +9 @@\n-x\n+y");
    expect(countDiffLines(hunks)).toBe(5);
  });
  it("200KB 를 접힘 기준으로 쓴다", () => {
    expect(PATCH_COLLAPSE_BYTES).toBe(200 * 1024);
  });
});
