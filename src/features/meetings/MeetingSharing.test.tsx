import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeetingDetail } from "../../api/client";
import { MeetingSharing } from "./MeetingSharing";
import type { SharePreview } from "../../api/sharingTypes";

const h = vi.hoisted(() => ({ preview: vi.fn(), list: vi.fn(), publish: vi.fn(), revoke: vi.fn(), export: vi.fn() }));
vi.mock("../../api/client", async (original) => ({ ...await original<typeof import("../../api/client")>(), previewMeetingShare: h.preview, listMeetingShares: h.list, publishMeetingShare: h.publish, revokeMeetingShare: h.revoke, exportMeetingDocument: h.export }));
export const preview: SharePreview = {
  source_revision: "sha256:revision", warnings: ["content_requires_owner_review"],
  format_options: [{ format: "txt", enabled: true, applicable: true, parts: ["document"], reason: null }, { format: "csv", enabled: true, applicable: false, parts: [], reason: "format_not_applicable" }],
  document: { schema_version: 1, kind: "meeting", title: "공유 테스트 회의", held_at: null, included_sections: ["summary"], section_states: { summary: "available", decisions: "empty", actions: "empty", discussions: "not_selected", open_issues: "not_selected", transcript: "not_selected" }, analysis_state: "available", participants: [], summary: "선택한 요약만", decisions: [], actions: [], discussions: [], open_issues: [], transcript: null },
};
function show(scope = "personal") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MeetingSharing m={{ id: "m1", scope } as MeetingDetail} /></QueryClientProvider>);
}
beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.preview.mockResolvedValue(preview); h.list.mockResolvedValue([]);
  HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shares nothing on open; requires a current preview and explicit publish", async () => {
  show(); fireEvent.click(screen.getByRole("button", { name: "공유" }));
  expect(h.preview).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "공개 링크 만들기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText("선택한 요약만");
  expect(h.publish).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "선택 바꾸기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "전사" }));
  expect(screen.queryByRole("button", { name: "공개 링크 만들기" })).toBeNull();
});
it("requires work-scope confirmation before previewing or publishing company content", async () => {
  show("work"); fireEvent.click(screen.getByRole("button", { name: "공유" }));
  expect((screen.getByRole("button", { name: "미리보기" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /회사 자료/ }));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await waitFor(() => expect(h.preview).toHaveBeenCalled());
  expect(h.preview.mock.calls[0][0].confirm_work_scope).toBe(true);
});
it("downloads reviewed content without creating a public share", async () => {
  h.export.mockResolvedValue(new Blob(["선택한 요약만"]));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:synthetic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  show(); fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText("선택한 요약만");
  expect(screen.queryByRole("button", { name: "공개 링크 만들기" })).toBeNull();
  expect((screen.getByRole("button", { name: "파일 저장" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "파일 저장" }));
  await waitFor(() => expect(h.export).toHaveBeenCalled());
  expect(h.export.mock.calls[0][0].expected_source_revision).toBe("sha256:revision");
  expect(h.export.mock.calls[0][0].selection.include_people).toBe(false);
  expect(h.publish).not.toHaveBeenCalled();
});
it("publishes the reviewed revision once and keeps the returned link out of web storage", async () => {
  const url = `https://ttakkari.winterholic.net/share/s1#key=ps1_${"a".repeat(43)}`;
  h.publish.mockResolvedValue({ id: "s1", capability_url: url });
  show(); fireEvent.click(screen.getByRole("button", { name: "공유" }));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText("선택한 요약만");
  fireEvent.click(screen.getByRole("button", { name: "공개 링크 만들기" }));
  await screen.findByRole("textbox", { name: "공유 링크" });
  expect(h.publish).toHaveBeenCalledTimes(1);
  expect(h.publish.mock.calls[0][0]).toMatchObject({ expected_source_revision: "sha256:revision", download_formats: ["txt"], selection: { include_people: false, include_evidence: false } });
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
  expect(screen.queryByRole("button", { name: "공개 링크 만들기" })).toBeNull();
});
it("blocks publication when the server reports sharing is disabled", async () => {
  h.preview.mockResolvedValue({ ...preview, public_sharing_enabled: false });
  show(); fireEvent.click(screen.getByRole("button", { name: "공유" }));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText(/서버 업데이트 후/);
  expect((screen.getByRole("button", { name: "공개 링크 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  expect(h.publish).not.toHaveBeenCalled();
});
const checked = (name: string | RegExp) => (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;
it("download dialog opens with every section included; names and evidence stay off by default", () => {
  show(); fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  for (const label of ["요약", "결정", "할 일", "논의", "미해결", "전사"]) expect(checked(label), label).toBe(true);
  expect(checked(/참석자·화자 이름/)).toBe(false);
  expect(checked("근거 발화 포함")).toBe(false);
});
it("share dialog opens with the analysis sections and every download format checked; transcript, names, evidence and work confirmation stay off", () => {
  show("work"); fireEvent.click(screen.getByRole("button", { name: "공유" }));
  for (const label of ["요약", "결정", "할 일", "논의", "미해결"]) expect(checked(label), label).toBe(true);
  for (const label of [/텍스트/, /Markdown/, /JSON/, /CSV/]) expect(checked(label), String(label)).toBe(true);
  expect(checked("전사")).toBe(false);
  expect(checked(/참석자·화자 이름/)).toBe(false);
  expect(checked("근거 발화 포함")).toBe(false);
  expect(checked(/회사 자료/)).toBe(false);
});
it("saves a one-file HTML copy of the reviewed document in the browser without calling the export API", async () => {
  const saved: Blob[] = [];
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((b: Blob) => { saved.push(b); return "blob:synthetic"; }) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  show(); fireEvent.click(screen.getByRole("button", { name: "다운로드" }));
  fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
  await screen.findByText("선택한 요약만");
  fireEvent.change(screen.getByRole("combobox", { name: "파일 형식" }), { target: { value: "html" } });
  expect(screen.queryByRole("combobox", { name: "CSV에 담을 목록" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "파일 저장" }));
  await waitFor(() => expect(saved.length).toBe(1));
  expect(h.export).not.toHaveBeenCalled(); expect(h.publish).not.toHaveBeenCalled();
  expect(saved[0].type).toBe("text/html;charset=utf-8");
  expect(click.mock.contexts[0] && (click.mock.contexts[0] as HTMLAnchorElement).download).toBe("meeting-export.html");
  const html = await saved[0].text();
  expect(html).toContain("공유 테스트 회의"); expect(html).toContain("선택한 요약만"); expect(html).toContain("meeting-data");
});
