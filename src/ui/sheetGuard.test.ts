import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 바텀 시트·전체 화면 패널은 쓰지 않기로 했다(모달이 기본). 앱 코드에 다시 들어오지 못하게 막는다.
// vendor 는 디자인 시스템 산출물이라 검사하지 않는다. 금지어가 이 파일에 그대로 적히지 않게 이어 붙인다.
const FORBIDDEN = [`tk-${"sheet"}`, `kind="${"sheet"}"`, `kind="${"panel"}"`, `tk-${"panel"}`];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (p.includes(`${join("src", "vendor")}`)) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe("바텀 시트 금지", () => {
  it("앱 코드에 시트·패널 변형이 없다", () => {
    const hits = walk("src")
      .filter((f) => !f.endsWith("sheetGuard.test.ts"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        return FORBIDDEN.filter((w) => text.includes(w)).map((w) => `${f}: ${w}`);
      });
    expect(hits).toEqual([]);
  });
});
