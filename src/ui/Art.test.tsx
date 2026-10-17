import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Art } from "./Art";

afterEach(cleanup);

it("납품된 컷은 alt 가 빈 장식 이미지로 크기 속성과 2x 를 갖는다", () => {
  const { container } = render(<Art name="state-empty" size="sm" />);
  const figure = container.querySelector("figure")!;
  expect(figure.className).toBe("tk-art tk-art--sm");
  expect(figure.hasAttribute("data-pending")).toBe(false);
  const img = figure.querySelector("img")!;
  expect(img.getAttribute("alt")).toBe("");
  expect(img.getAttribute("width")).toBe("480");
  expect(img.getAttribute("srcset")).toBe("/art/state-empty-480.webp 480w, /art/state-empty-960.webp 960w");
  expect(img.getAttribute("sizes")).toBe("96px");
});

it("목록에 없는 키는 이미지를 요청하지 않고 같은 크기의 자리만 남긴다", () => {
  const { container } = render(<Art name="state-없는컷" />);
  const figure = container.querySelector("figure")!;
  expect(figure.hasAttribute("data-pending")).toBe(true);
  expect(figure.className).toBe("tk-art tk-art--md");
  expect(container.querySelector("img")).toBeNull();
});

it("이미지를 못 불러오면 자리로 바꿔 레이아웃을 지킨다", () => {
  const { container } = render(<Art name="state-error" />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("figure")!.hasAttribute("data-pending")).toBe(true);
  expect(container.querySelector("img")).toBeNull();
});
