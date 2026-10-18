import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GhContext } from "./GithubContext";
import { GhMarkdown } from "./GhMarkdown";

afterEach(cleanup);

function md(text: string, base?: { owner: string; repo: string; ref?: string; file: string }) {
  return render(
    <MemoryRouter>
      <GhContext.Provider value={{ account: "alice", accounts: [], switchAccount: () => {} }}>
        <GhMarkdown base={base}>{text}</GhMarkdown>
      </GhContext.Provider>
    </MemoryRouter>,
  );
}

it("원시 HTML 은 렌더하지 않고 스크립트·이벤트 속성이 DOM 에 없다", () => {
  const { container } = md("<script>window.__x=1</script>\n\n<img src=x onerror=alert(1)>\n\n<b>굵게</b>");
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("b")).toBeNull();
  expect(container.innerHTML).not.toMatch(/onerror/i);
});

it("이미지는 인라인으로 불러오지 않고 이름만 보인다", () => {
  const { container } = md("![로고](https://example.org/logo.png)");
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText(/이미지: 로고/)).toBeTruthy();
});

it("github.com 이미지는 새 탭으로 여는 링크가 된다", () => {
  md("![스크린샷](https://github.com/o/r/assets/1.png)");
  const a = screen.getByRole("link", { name: /이미지: 스크린샷/ });
  expect(a.getAttribute("href")).toBe("https://github.com/o/r/assets/1.png");
  expect(a.getAttribute("target")).toBe("_blank");
  expect(a.getAttribute("rel")).toContain("noopener");
  expect(a.getAttribute("rel")).toContain("noreferrer");
});

it("외부 링크는 https github.com 만 눌리고 나머지는 글자로만 남는다", () => {
  md("[깃허브](https://github.com/o/r) [다른곳](https://example.org/x) [피싱](https://github.com.evil.com/x) [js](javascript:alert(1)) [http](http://github.com/o)");
  expect(screen.getByRole("link", { name: "깃허브" }).getAttribute("href")).toBe("https://github.com/o/r");
  for (const name of ["다른곳", "피싱", "js", "http"]) expect(screen.queryByRole("link", { name })).toBeNull();
  expect(screen.getByText("다른곳").getAttribute("title")).toContain("example.org");
});

it("저장소 안 상대 링크는 같은 계정·ref 로 코드 화면에 연결한다", () => {
  md("[가이드](guide/a.md) [위](../top.md) [앵커](#x)", { owner: "o", repo: "r", ref: "feat/x", file: "docs/README.md" });
  expect(screen.getByRole("link", { name: "가이드" }).getAttribute("href")).toBe("/github/o/r/code?as=alice&ref=feat%2Fx&path=docs%2Fguide%2Fa.md");
  expect(screen.getByRole("link", { name: "위" }).getAttribute("href")).toBe("/github/o/r/code?as=alice&ref=feat%2Fx&path=top.md");
  expect(screen.queryByRole("link", { name: "앵커" })).toBeNull();
});

it("상대 링크 기준(base)이 없으면 링크를 만들지 않는다", () => {
  md("[가이드](guide/a.md)");
  expect(screen.queryByRole("link", { name: "가이드" })).toBeNull();
});

it("표는 가로 스크롤 상자 안에 둔다", () => {
  const { container } = md("| a | b |\n|---|---|\n| 1 | 2 |");
  expect(container.querySelector(".tk-table-wrap > table")).not.toBeNull();
});
