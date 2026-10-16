import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublicMeetingPage } from "./PublicMeetingPage";
import type { PublicMeetingShare } from "../api/sharingTypes";

const h = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn() }));
vi.mock("../api/client", async (orig) => ({ ...await orig<typeof import("../api/client")>(), getPublicMeetingShare: h.get, downloadPublicMeetingShare: h.download }));
const share: PublicMeetingShare = { share_id: "s1", publication_revision: 2, published_at: "2026-10-16T00:00:00Z", expires_at: "2026-10-23T00:00:00Z", included_sections: ["summary"], downloads: [], document: { schema_version: 1, kind: "meeting", title: "공개한 회의", held_at: null, included_sections: ["summary"], section_states: { summary: "available", decisions: "not_selected", actions: "not_selected", discussions: "not_selected", open_issues: "not_selected", transcript: "not_selected" }, analysis_state: "available", participants: [], summary: "외부에 선택한 요약", decisions: [], actions: [], discussions: [], open_issues: [], transcript: null } };
const path = `/share/s1#key=ps1_${"a".repeat(43)}`;
function show(entry = path) { const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[entry]}><Routes><Route path="/share/:shareId" element={<PublicMeetingPage />} /></Routes></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.get.mockResolvedValue(share); });
afterEach(cleanup);
it("renders without AuthProvider and shows only published sections", async () => {
  show(); await screen.findByText("외부에 선택한 요약");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("공개한 회의");
  expect(screen.queryByText("전사")).toBeNull();
  expect(screen.queryByRole("button", { name: /편집|다시 분석|로그인/ })).toBeNull();
  expect(screen.queryByText(/owner/)).toBeNull();
});
it("missing capability never fetches data and explains the full link is needed", async () => {
  show("/share/s1"); await screen.findByText(/전체 공유 링크/);
  expect(h.get).not.toHaveBeenCalled();
});
it("moves within the document without replacing the capability fragment", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  show(); await screen.findByText("외부에 선택한 요약");
  fireEvent.click(screen.getByRole("button", { name: "요약" }));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  expect(screen.getByText("외부에 선택한 요약")).toBeTruthy();
  expect(h.get).toHaveBeenCalledTimes(1);
});
it("a failed revalidation clears the previously displayed snapshot", async () => {
  show(); await screen.findByText("외부에 선택한 요약");
  h.get.mockRejectedValue(new Error("revoked"));
  fireEvent.click(screen.getByRole("button", { name: "새로 확인" }));
  await screen.findByText("공유를 열 수 없어요");
  expect(screen.queryByText("외부에 선택한 요약")).toBeNull();
});
