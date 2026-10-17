import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Onboarding, onboardingSeen } from "./Onboarding";

beforeEach(() => {
  localStorage.clear();
  // jsdom 에는 dialog.showModal 이 없다. 계약(open 속성)만 흉내 낸다.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

function Host() {
  const [open, setOpen] = useState(true);
  return <><Onboarding open={open} onClose={() => setOpen(false)} /><p>{open ? "열림" : "닫힘"}</p></>;
}

it("처음에는 안 본 것으로 읽고, 세 장을 넘기면 마지막에 시작하기가 나온다", () => {
  expect(onboardingSeen()).toBe(false);
  render(<Host />);
  expect(screen.getByText("심부름은 제가 할게요")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "이전" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("이렇게 시켜요")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("결과는 폰으로")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
  expect(screen.getByText("닫힘")).toBeTruthy();
  expect(onboardingSeen()).toBe(true);
});

it("건너뛰면 닫히고 다시 뜨지 않는 것으로 기록한다", () => {
  render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));
  expect(screen.getByText("닫힘")).toBeTruthy();
  expect(onboardingSeen()).toBe(true);
});

it("일러스트는 장식이라 alt 가 비어 있다(컷이 없으면 자리만)", () => {
  const { container } = render(<Host />);
  const figure = container.querySelector("figure.tk-art");
  expect(figure?.getAttribute("data-art")).toBe("onboarding-01-intro");
  const img = figure?.querySelector("img");
  expect(img?.getAttribute("alt")).toBe("");
});
