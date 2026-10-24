// 재현 고정: 결과물 뷰어(.tk-split)를 넓게 끌어 두면 홈의 왼쪽 칸(primary)이 오른쪽 패널 폭(32vw, 최대 560)보다 좁아진다.
// 패널이 flex-shrink:0 이면 칸 밖으로 넘쳐 뷰어 위로 겹쳤다(대화 본문 잘림, 입력창·닫기 버튼이 뷰어 툴바 위에 얹힘).
// jsdom 은 레이아웃을 계산하지 못해 규칙 자체를 불변식으로 검사한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "canvas.css"), "utf8");

function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.\\]/g, "\\$&");
  const m = css.match(new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}"));
  if (!m) throw new Error("규칙을 찾지 못함: " + selector);
  const out: Record<string, string> = {};
  for (const part of m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** `flex: <grow> <shrink> <basis>` 에서 shrink 를 꺼낸다(clamp() 안의 공백은 괄호 깊이로 건너뛴다). */
function flexShrink(flex: string): number {
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of flex) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0) {
      if (cur) tokens.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) tokens.push(cur);
  return Number(tokens[1]);
}

describe("홈 패널이 좁은 칸에서 넘치지 않는다", () => {
  it("패널은 줄어들 수 있고 폭 하한이 칸을 넘지 않는다", () => {
    const panel = declarations(".home__panel");
    expect(flexShrink(panel.flex)).toBeGreaterThan(0);
    expect(panel["min-width"]).toBe("0");
  });

  it("판(canvas)은 남는 폭만 쓰고 패널보다 먼저 양보한다", () => {
    const canvas = declarations(".home__canvas");
    expect(canvas.flex).toMatch(/^1 1 0(px|%)?$/);
    expect(canvas["min-width"]).toBe("0");
  });
});
