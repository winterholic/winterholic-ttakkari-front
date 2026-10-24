import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModalDialog } from "./ModalDialog";

afterEach(cleanup);

it("안쪽 다이얼로그가 닫혀도 바깥 다이얼로그(모바일 뷰어 시트)의 onClose 는 불리지 않는다", () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  const outer = vi.fn();
  const inner = vi.fn();
  render(
    <ModalDialog open onClose={outer} className="outer" label="바깥">
      <ModalDialog open onClose={inner} className="inner" label="안쪽">메뉴</ModalDialog>
    </ModalDialog>,
  );
  fireEvent(screen.getByLabelText("안쪽", { selector: "dialog" }), new Event("close", { bubbles: false }));
  expect(inner).toHaveBeenCalledTimes(1);
  expect(outer).not.toHaveBeenCalled();
});
