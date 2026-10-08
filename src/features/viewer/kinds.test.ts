import { describe, expect, it } from "vitest";
import type { ArtifactOut } from "../../api/types";
import { downloadState, formatSize, resolveViewMode, shouldPollPreview, shouldSubmitOnEnter, stepZoom, toolsFor } from "./kinds";

const art = (o: Partial<ArtifactOut>) => ({ kind: "markdown", preview_status: "not_required", export_policy: "allow", downloadable: true, ...o }) as ArtifactOut;

describe("resolveViewMode: kind → 렌더러", () => {
  it.each([
    ["markdown", "markdown"],
    ["pdf", "pdf"],
    ["code", "code"],
    ["sheet", "sheet"],
    ["image", "image"],
    ["html", "html"],
    ["other", "other"],
  ] as const)("%s → %s", (kind, mode) => {
    expect(resolveViewMode(art({ kind }))).toBe(mode);
  });

  it("민감 자료는 kind 와 무관하게 열람 차단이다", () => {
    expect(resolveViewMode(art({ kind: "pdf", export_policy: "sensitive" }))).toBe("blocked");
  });
});

describe("resolveViewMode: pptx/docx 는 preview_status 로 갈린다", () => {
  it.each([
    ["ready", "preview-pdf"],
    ["pending", "preview-pending"],
    ["processing", "preview-converting"],
    ["failed", "preview-failed"],
    ["unavailable", "preview-unavailable"],
  ] as const)("%s → %s", (preview_status, mode) => {
    expect(resolveViewMode(art({ kind: "pptx", preview_status }))).toBe(mode);
    expect(resolveViewMode(art({ kind: "docx", preview_status }))).toBe(mode);
  });

  it("pending·processing 일 때만 5초 폴링 대상이다", () => {
    expect(shouldPollPreview({ kind: "pptx", preview_status: "pending" })).toBe(true);
    expect(shouldPollPreview({ kind: "docx", preview_status: "processing" })).toBe(true);
    expect(shouldPollPreview({ kind: "docx", preview_status: "ready" })).toBe(false);
    expect(shouldPollPreview({ kind: "pdf", preview_status: "pending" })).toBe(false);
  });
});

describe("downloadState: 다운로드 비활성 조건", () => {
  it("허용 + downloadable 이면 활성", () => {
    expect(downloadState({ downloadable: true, export_policy: "allow" })).toEqual({ enabled: true, reason: null });
  });
  it("downloadable false 면 이유와 함께 비활성", () => {
    const s = downloadState({ downloadable: false, export_policy: "allow" });
    expect(s.enabled).toBe(false);
    expect(s.reason).toBeTruthy();
  });
  it("sensitive·deny 는 downloadable 이 true 여도 비활성이고 이유가 다르다", () => {
    const a = downloadState({ downloadable: true, export_policy: "sensitive" });
    const b = downloadState({ downloadable: true, export_policy: "deny" });
    expect(a.enabled).toBe(false);
    expect(b.enabled).toBe(false);
    expect(a.reason).not.toBe(b.reason);
  });
});

describe("shouldSubmitOnEnter: docs/19 §3", () => {
  const base = { key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false, keyCode: 13, isComposing: false };
  it("조합 중 Enter 는 무시한다", () => {
    expect(shouldSubmitOnEnter({ ...base, isComposing: true }, false)).toBe(false);
  });
  it("keyCode 229 도 조합으로 본다", () => {
    expect(shouldSubmitOnEnter({ ...base, keyCode: 229 }, false)).toBe(false);
  });
  it("데스크톱 Enter 는 보내고 Shift+Enter 는 줄바꿈", () => {
    expect(shouldSubmitOnEnter(base, false)).toBe(true);
    expect(shouldSubmitOnEnter({ ...base, shiftKey: true }, false)).toBe(false);
  });
  it("터치 기기의 Enter 는 줄바꿈이고 Cmd/Ctrl+Enter 만 보낸다", () => {
    expect(shouldSubmitOnEnter(base, true)).toBe(false);
    expect(shouldSubmitOnEnter({ ...base, metaKey: true }, true)).toBe(true);
  });
  it("Enter 가 아닌 키는 무시한다", () => {
    expect(shouldSubmitOnEnter({ ...base, key: "a" }, false)).toBe(false);
  });
});

describe("툴바와 배율", () => {
  it("없는 기능은 버튼을 뺀다", () => {
    expect(toolsFor("pdf")).toEqual({ zoom: true, find: false, pages: true });
    expect(toolsFor("markdown")).toEqual({ zoom: false, find: true, pages: false });
    expect(toolsFor("other")).toEqual({ zoom: false, find: false, pages: false });
  });
  it("배율은 50~300 단계 안에서만 움직인다", () => {
    expect(stepZoom(100, "in")).toBe(125);
    expect(stepZoom(100, "out")).toBe(75);
    expect(stepZoom(300, "in")).toBe(300);
    expect(stepZoom(50, "out")).toBe(50);
  });
  it("크기 표기", () => {
    expect(formatSize(148 * 1024)).toBe("148 KB");
    expect(formatSize(12)).toBe("12 B");
  });
});
