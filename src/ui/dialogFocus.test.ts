import { afterEach, describe, expect, it } from "vitest";
import { focusDialogBox } from "./dialogFocus";

function make(html: string): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.tabIndex = -1;
  d.setAttribute("open", ""); // 닫힌 dialog 는 jsdom 에서 포커스를 못 받는다
  d.innerHTML = html;
  document.body.append(d);
  return d;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusDialogBox", () => {
  it("첫 포커스 요소가 버튼이면 상자 자신에 포커스를 둔다", () => {
    const d = make('<button id="x">닫기</button><input type="text">');
    focusDialogBox(d);
    expect(document.activeElement).toBe(d);
  });

  it("첫 포커스 요소가 글자 입력 칸이면 건드리지 않는다", () => {
    const d = make('<input id="name" type="text"><button>확인</button>');
    document.getElementById("name")!.focus();
    focusDialogBox(d);
    expect(document.activeElement?.id).toBe("name");
  });
});
