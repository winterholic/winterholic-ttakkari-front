import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CodeView from "./CodeView";

const SRC = 'import os\n\ndef main():\n    print("안녕")  # 끝\n';

describe("CodeView", () => {
  afterEach(cleanup);

  it("줄마다 한 행으로 그리고 번호는 글자가 아니라 data-ln 이다", () => {
    const { container } = render(<CodeView text={SRC} filename="a.py" />);
    const rows = container.querySelectorAll(".tk-code__row");
    expect(rows).toHaveLength(4);
    expect(Array.from(container.querySelectorAll<HTMLElement>(".tk-code__no")).map((b) => b.dataset.ln)).toEqual(["1", "2", "3", "4"]);
    // 찾기·복사에 번호가 섞이지 않는다: 본문 텍스트는 원문 그대로.
    expect(Array.from(rows).map((r) => r.querySelector(".tk-code__text")!.textContent).join("\n")).toBe(SRC.trimEnd());
    expect(container.querySelector(".token.keyword")?.textContent).toBe("import");
    expect(screen.getByText("4줄")).toBeTruthy();
  });

  it("번호를 누르면 그 줄이 표시되고 다시 누르면 풀린다", () => {
    const { container } = render(<CodeView text={SRC} filename="a.py" />);
    fireEvent.click(screen.getByRole("button", { name: "3번 줄 표시" }));
    expect(container.querySelectorAll(".tk-code__row[data-marked]")).toHaveLength(1);
    expect(container.querySelectorAll(".tk-code__row")[2].hasAttribute("data-marked")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "3번 줄 표시" }));
    expect(container.querySelector(".tk-code__row[data-marked]")).toBeNull();
  });

  it("줄 바꿈 토글", () => {
    const { container } = render(<CodeView text={SRC} filename="a.py" />);
    const fig = container.querySelector("figure")!;
    const before = fig.hasAttribute("data-wrap");
    fireEvent.click(screen.getByRole("button", { name: "줄 바꿈" }));
    expect(fig.hasAttribute("data-wrap")).toBe(!before);
  });

  it("빈 파일은 안내만 보여 준다", () => {
    const { container } = render(<CodeView text="" filename="a.py" />);
    expect(screen.getByText("비어 있는 파일이에요.")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("줄이 아주 많으면 앞부분만 그리고 알린다", () => {
    const text = Array.from({ length: 8_100 }, (_, i) => `l${i}`).join("\n");
    const { container } = render(<CodeView text={text} filename="a.txt" />);
    expect(container.querySelectorAll(".tk-code__row")).toHaveLength(8_000);
    expect(screen.getByText(/앞의 8,000줄만 보여 드려요 \(전체 8,100줄\)/)).toBeTruthy();
  });

  it("모르는 확장자는 색 없이 글 그대로", () => {
    const { container } = render(<CodeView text={"hello\nworld"} filename="notes.xyz" />);
    expect(container.querySelector(".token")).toBeNull();
    expect(container.querySelectorAll(".tk-code__row")).toHaveLength(2);
  });
});
