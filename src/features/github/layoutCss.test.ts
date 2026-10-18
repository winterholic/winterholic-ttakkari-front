// jsdom 은 레이아웃을 계산하지 못해서 아래 CSS 규칙은 실제 브라우저에서만 깨짐이 보인다(실제 검사는 scripts/ui-sweep/github-layout.mjs).
// 그 검사는 브라우저가 있어야 돌아서, 같은 규칙이 지워지지 않았는지를 원문으로 한 번 더 지킨다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** 선택자로 시작하는 규칙 한 줄(중괄호 안 전체). 없으면 빈 문자열. */
const rule = (src: string, selector: string) => {
  const start = src.indexOf(selector + " {");
  if (start < 0) return "";
  return src.slice(start, src.indexOf("}", start) + 1);
};

describe("GitHub 화면 CSS 회귀 규칙", () => {
  it("바로가기 타일은 border-box 라 height:100% 가 칸을 넘지 않는다", () => {
    const r = rule(css("./repo/github-repo.css"), ".gh-tile");
    expect(r).toContain("height: 100%");
    expect(r).toContain("box-sizing: border-box");
  });

  it("본문 안 알림 띠는 <p> 여백을 없애고 아이콘을 글자와 같은 줄에 둔 카드 모양이다", () => {
    const r = rule(css("./github.css"), ".gh .tk-banner");
    expect(r).toContain("margin: 0");
    expect(r).toContain("flex-wrap: nowrap");
    expect(r).toContain("border-radius");
    expect(r).toMatch(/border: var\(--tk-border-width-hairline\) solid/);
  });

  it("코드·diff 칸은 오른쪽 안쪽 여백을 되살린다(디자인 시스템 td padding 0 이 덮어씀)", () => {
    expect(rule(css("./code/github-code.css"), ".gh .tk-diff__code")).toMatch(/padding-right: var\(--tk-space-\d/);
  });

  it("줄바꿈을 켜면 hunk 머리글도 줄바꿈한다", () => {
    const r = rule(css("./pulls/github-pulls.css"), ".gh-diff[data-wrap] .tk-diff__hunk > td");
    expect(r).toContain("white-space: pre-wrap");
    expect(r).toContain("overflow-wrap: anywhere");
  });

  it("터치 기기에서 필터 입력과 diff 파일 머리 버튼은 44px 이상이다", () => {
    expect(css("./github.css")).toMatch(/@media \(pointer: coarse\) \{ \.gh \.tk-input, \.gh-branchlist \.tk-input \{ min-height: var\(--tk-size-touch-target-min\)/);
    expect(css("./pulls/github-pulls.css")).toMatch(/@media \(pointer: coarse\) \{ \.gh-diff \.tk-diff__file > button \{ min-height: var\(--tk-size-touch-target-min\)/);
  });
});
