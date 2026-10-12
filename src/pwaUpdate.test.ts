import { afterEach, describe, expect, it, vi } from "vitest";
import { hasUnsavedInput, isStaleChunkError, isUpdateReady, onStaleChunk, resetUpdateStateForTest, subscribeUpdate } from "./pwaUpdate";

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  resetUpdateStateForTest();
});

describe("isStaleChunkError", () => {
  it("배포 뒤 사라진 청크를 부른 오류를 브라우저마다 알아본다", () => {
    // WebKit(iOS) 실측: Vercel 이 없는 청크에 index.html 을 200 으로 준다.
    expect(isStaleChunkError(new TypeError("'text/html' is not a valid JavaScript MIME type for module script 'https://x/assets/CodeView-rIthwTs5.js'."))).toBe(true);
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/CodeView-CvcbKG96.css"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("onStaleChunk", () => {
  it("입력 중인 것이 없으면 바로 새 버전으로 다시 읽는다", () => {
    const reload = vi.fn();
    resetUpdateStateForTest(reload);
    onStaleChunk(1_000_000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("초안이 있으면 다시 읽지 않고 새 버전 안내를 띄운다", () => {
    const reload = vi.fn();
    resetUpdateStateForTest(reload);
    const seen = vi.fn();
    subscribeUpdate(seen);
    document.body.innerHTML = "<textarea>보내려던 지시</textarea>";
    onStaleChunk(1_000_000);
    expect(reload).not.toHaveBeenCalled();
    expect(isUpdateReady()).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("방금 같은 이유로 다시 읽었으면 반복하지 않는다", () => {
    const reload = vi.fn();
    resetUpdateStateForTest(reload);
    sessionStorage.setItem("tk-stale-reload-at", String(1_000_000));
    onStaleChunk(1_005_000);
    expect(reload).not.toHaveBeenCalled();
    expect(isUpdateReady()).toBe(true);
  });
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
