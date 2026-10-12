import { afterEach, describe, expect, it } from "vitest";
import { hasUnsavedInput } from "./pwaUpdate";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("hasUnsavedInput", () => {
  it("입력 칸이 없거나 비어 있고 포커스도 없으면 거짓", () => {
    document.body.innerHTML = '<textarea></textarea><input type="text" value="  ">';
    expect(hasUnsavedInput()).toBe(false);
  });

  it("글자 입력 칸에 포커스가 있으면 비어 있어도 참", () => {
    document.body.innerHTML = "<textarea></textarea>";
    document.querySelector("textarea")!.focus();
    expect(hasUnsavedInput()).toBe(true);
  });

  it("내용이 있는 입력 칸이 있으면 참", () => {
    document.body.innerHTML = "<textarea>초안</textarea>";
    expect(hasUnsavedInput()).toBe(true);
  });

  it("컴포저에 첨부가 붙어 있으면 참", () => {
    document.body.innerHTML = '<form class="tk-composer" data-has-context=""><textarea></textarea></form>';
    expect(hasUnsavedInput()).toBe(true);
  });

  it("체크박스·파일 입력은 초안으로 보지 않는다", () => {
    document.body.innerHTML = '<input type="checkbox" checked><input type="file">';
    expect(hasUnsavedInput()).toBe(false);
  });
});
