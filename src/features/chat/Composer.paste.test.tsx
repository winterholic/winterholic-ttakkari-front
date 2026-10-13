import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";
import { MAX_CONTEXT_FILES, MAX_UPLOAD_BYTES, checkAttachFiles, filesFromClipboard, nameClipboardFiles } from "./clipboardFiles";

const png = (name = "image.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

/** jsdom 에는 DataTransfer 가 없어 필요한 모양만 흉내 낸다. */
function clip(files: File[], types: string[] = ["Files"]) {
  return { types, files, items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })) } as unknown as DataTransfer;
}

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

function setup(onAttach = vi.fn()) {
  render(<Composer draftKey="t" running={false} queued={0} onSubmit={() => {}} onAttach={onAttach} />);
  return { onAttach, box: screen.getByLabelText("지시") };
}

function paste(box: HTMLElement, data: DataTransfer) {
  const ev = createEvent.paste(box, { clipboardData: data });
  fireEvent(box, ev);
  return ev;
}

describe("Composer 붙여넣기", () => {
  it("스크린샷(이름 없는 이미지)은 paste-날짜.png 로 첨부하고 기본 붙여넣기를 막는다", () => {
    const { onAttach, box } = setup();
    const ev = paste(box, clip([png("image.png")]));
    expect(ev.defaultPrevented).toBe(true);
    const files = onAttach.mock.calls[0][0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(/^paste-\d{8}-\d{6}\.png$/);
    expect(files[0].type).toBe("image/png");
  });

  it("여러 장을 한 번에 붙여넣으면 모두 넘기고 이름이 겹치지 않는다", () => {
    const { onAttach, box } = setup();
    paste(box, clip([png(""), png(""), png("보고서.png")]));
    const names = (onAttach.mock.calls[0][0] as File[]).map((f) => f.name);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    expect(names[2]).toBe("보고서.png");
  });

  it("파일 이름 text/plain 과 함께 온 이미지(Finder 복사)도 첨부한다", () => {
    const { onAttach, box } = setup();
    const ev = paste(box, clip([png("사진.png")], ["text/plain", "Files"]));
    expect(ev.defaultPrevented).toBe(true);
    expect(onAttach).toHaveBeenCalledTimes(1);
  });

  it("text/html 이 같이 있으면(웹페이지 복사) 텍스트 붙여넣기를 막지 않는다", () => {
    const { onAttach, box } = setup();
    const ev = paste(box, clip([png()], ["text/plain", "text/html", "Files"]));
    expect(ev.defaultPrevented).toBe(false);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("이미지 복사에 HTML img 형식이 함께 있어도 실제 PNG를 첨부한다", () => {
    const { onAttach, box } = setup();
    const data = {
      ...clip([png()], ["text/html", "Files"]),
      getData: (type: string) => type === "text/html" ? '<img src="https://example.com/photo.png">' : "",
    } as unknown as DataTransfer;
    expect(paste(box, data).defaultPrevented).toBe(true);
    expect(onAttach).toHaveBeenCalledTimes(1);
    expect((onAttach.mock.calls[0][0] as File[])[0].type).toBe("image/png");
  });

  it("HTML에 본문이 있는 복사는 이미지 파일이 있어도 텍스트를 보존한다", () => {
    const { onAttach, box } = setup();
    const data = {
      ...clip([png()], ["text/html", "Files"]),
      getData: (type: string) => type === "text/html" ? '<p>복사한 본문</p><img src="https://example.com/photo.png">' : "",
    } as unknown as DataTransfer;
    expect(paste(box, data).defaultPrevented).toBe(false);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("파일 없는 일반 텍스트는 건드리지 않는다", () => {
    const { onAttach, box } = setup();
    const ev = paste(box, clip([], ["text/plain"]));
    expect(ev.defaultPrevented).toBe(false);
    expect(onAttach).not.toHaveBeenCalled();
  });

  it("files 가 비고 items 에만 파일이 있어도 읽는다", () => {
    const data = { types: ["Files"], files: [], items: [{ kind: "file", type: "image/png", getAsFile: () => png() }] } as unknown as DataTransfer;
    expect(filesFromClipboard(data)).toHaveLength(1);
  });

  it("onAttach 가 없으면(작업 공간 미선택) 붙여넣기를 가로채지 않는다", () => {
    render(<Composer draftKey="n" running={false} queued={0} onSubmit={() => {}} />);
    const box = screen.getByLabelText("지시");
    expect(paste(box, clip([png()])).defaultPrevented).toBe(false);
  });
});

describe("파일 이름·제한 규칙", () => {
  it("같은 초에 여러 장이면 -2, -3 을 붙인다", () => {
    const out = nameClipboardFiles([png(""), png("image.png")], new Date(2026, 9, 12, 14, 5, 9));
    expect(out.map((f) => f.name)).toEqual(["paste-20261012-140509.png", "paste-20261012-140509-2.png"]);
  });

  it("크기 초과·빈 파일·개수 초과는 걸러서 이유를 돌려준다", () => {
    const big = { size: MAX_UPLOAD_BYTES + 1, name: "big.bin" } as File;
    const empty = new File([], "dir");
    const ok = png("a.png");
    const r = checkAttachFiles([big, empty, ok], 0);
    expect(r.accepted).toEqual([ok]);
    expect(r.problems).toHaveLength(2);
    expect(checkAttachFiles([ok], MAX_CONTEXT_FILES).accepted).toHaveLength(0);
  });
});
