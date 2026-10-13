import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Dialog } from "./Dialog";

afterEach(cleanup);

it("명시적인 ID가 없어도 각 모달의 제목을 접근 가능한 이름으로 연결한다", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  render(<><Dialog open onClose={() => {}} title="계정 메뉴">메뉴</Dialog><Dialog open onClose={() => {}} title="계정 수정">입력</Dialog></>);
  const menu = screen.getByRole("dialog", { name: "계정 메뉴" });
  const edit = screen.getByRole("dialog", { name: "계정 수정" });
  expect(menu.getAttribute("aria-labelledby")).not.toBe(edit.getAttribute("aria-labelledby"));
});
