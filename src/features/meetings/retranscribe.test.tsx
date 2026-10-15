import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { MeetingDetail, MeetingSummary, SttJob } from "../../api/client";

const h = vi.hoisted(() => ({
  getMeeting: vi.fn(), probeRetranscribe: vi.fn(), retranscribeMeeting: vi.fn(), listMeetingSttJobs: vi.fn(), listMeetings: vi.fn(),
  meetingProviders: vi.fn(), listPmsProjects: vi.fn(), listEntities: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getMeeting: (...a: unknown[]) => h.getMeeting(...a),
  probeRetranscribe: (...a: unknown[]) => h.probeRetranscribe(...a),
  retranscribeMeeting: (...a: unknown[]) => h.retranscribeMeeting(...a),
  listMeetingSttJobs: (...a: unknown[]) => h.listMeetingSttJobs(...a),
  listMeetings: (...a: unknown[]) => h.listMeetings(...a),
  meetingProviders: (...a: unknown[]) => h.meetingProviders(...a),
  listPmsProjects: (...a: unknown[]) => h.listPmsProjects(...a),
  listEntities: (...a: unknown[]) => h.listEntities(...a),
}));
vi.mock("../../shell/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <header><h1>{title}</h1>{actions}</header>,
}));

import { ApiError } from "../../api/client";
import { MeetingDetailPage } from "../../pages/MeetingDetailPage";

const counts = { discussion: 0, decision: 0, action: 0, open_issue: 0, pending_proposals: 0 };
const audio = { artifact_id: "art1", filename: "회의.m4a", size_bytes: 10 };
const detail = (over: Partial<MeetingDetail> = {}): MeetingDetail => ({
  id: "m1", title: "주간 회의", scope: "personal", status: "analyzed", failed_stage: null, error: null, project: null, held_at: null, participants: [],
  source: "audio", provider: "local_whisper", audio, transcript_chars: 10, transcript_source: "provider:local_whisper", summary: "요약", counts,
  analysis_run_id: null, analysis_session_id: null, created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", analyzed_at: null,
  transcript: "본문입니다", items: [], proposals: [], analysis_context: [], ...over,
});
const summary = (over: Partial<MeetingSummary>): MeetingSummary => {
  const { transcript: _t, items: _i, proposals: _p, analysis_context: _a, ...rest } = detail();
  void _t; void _i; void _p; void _a;
  return { ...rest, ...over };
};
const job = (over: Partial<SttJob> = {}): SttJob => ({
  id: "j1", meeting_id: "m1", status: "succeeded", parent_job_id: null, candidate_only: false, error: null, metadata: null, created_at: "2026-10-15T00:00:00Z", finished_at: null, ...over,
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}</p>;
}
function renderAt(path = "/meetings/m1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/meetings/:meetingId" element={<MeetingDetailPage />} /></Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const openMenu = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "회의록 더보기" }));
};

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.getMeeting.mockResolvedValue(detail());
  h.probeRetranscribe.mockResolvedValue("yes");
  h.listMeetingSttJobs.mockResolvedValue({ jobs: [job()] });
  h.listMeetings.mockResolvedValue({ meetings: [] });
  h.meetingProviders.mockResolvedValue({ providers: [] });
  h.listPmsProjects.mockResolvedValue({ projects: [] });
  h.listEntities.mockResolvedValue({ entities: [] });
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

describe("다시 전사", () => {
  it("메뉴에서 열면 확인 대화상자가 먼저 뜨고, 확인 전에는 요청하지 않는다(원본 보존 안내 포함)", async () => {
    renderAt();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "다시 전사" }));
    const dlg = await screen.findByRole("dialog", { name: "다시 전사할까요?" });
    expect(within(dlg).getByText(/그대로 보존/)).toBeTruthy();
    expect(within(dlg).getByText(/\(재처리\)/)).toBeTruthy();
    expect(h.retranscribeMeeting).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: "취소" }));
    expect(h.retranscribeMeeting).not.toHaveBeenCalled();
  });

  it("확인하면 새 회의를 만들고 그 회의 화면으로 이동한다(기본은 분석 없이)", async () => {
    h.retranscribeMeeting.mockResolvedValue(detail({ id: "m2", title: "주간 회의 (재처리)", status: "transcribing", transcript: null, transcript_chars: 0, transcript_source: null, summary: null }));
    renderAt();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "다시 전사" }));
    const dlg = await screen.findByRole("dialog", { name: "다시 전사할까요?" });
    fireEvent.click(within(dlg).getByRole("button", { name: "다시 전사" }));
    await waitFor(() => expect(h.retranscribeMeeting).toHaveBeenCalledWith("m1", false));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/meetings/m2"));
  });

  it("분석 이어서 하기를 켜면 auto_analyze=true 로 보낸다", async () => {
    h.retranscribeMeeting.mockResolvedValue(detail({ id: "m2", title: "주간 회의 (재처리)", status: "transcribing" }));
    renderAt();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "다시 전사" }));
    const dlg = await screen.findByRole("dialog", { name: "다시 전사할까요?" });
    fireEvent.click(within(dlg).getByRole("checkbox", { name: /이어서 분석/ }));
    fireEvent.click(within(dlg).getByRole("button", { name: "다시 전사" }));
    await waitFor(() => expect(h.retranscribeMeeting).toHaveBeenCalledWith("m1", true));
  });

  it("서버에 재전사 API가 없으면(404) 메뉴를 잠그고 '서버 업데이트 후 사용 가능'이라고 알린다", async () => {
    h.probeRetranscribe.mockResolvedValue("no");
    renderAt();
    await openMenu();
    const item = await screen.findByRole("menuitem", { name: /서버 업데이트 후 사용 가능/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(item);
    expect(screen.queryByRole("dialog", { name: "다시 전사할까요?" })).toBeNull();
    expect(h.retranscribeMeeting).not.toHaveBeenCalled();
  });

  it("확인 후 요청이 404 로 실패하면 안내하고 메뉴도 잠근다", async () => {
    h.probeRetranscribe.mockResolvedValue("unknown");
    h.retranscribeMeeting.mockRejectedValue(new ApiError(404, { code: "http_404", message: "Not Found" }));
    renderAt();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "다시 전사" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "다시 전사할까요?" })).getByRole("button", { name: "다시 전사" }));
    expect(await screen.findByText("서버 업데이트 후 사용할 수 있어요.")).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toBe("/meetings/m1");
    expect(screen.getByRole("menuitem", { name: /서버 업데이트 후 사용 가능/, hidden: true })).toBeTruthy();
  });

  it("서버가 막은 사유(원음 없음 409)는 그대로 보여 준다", async () => {
    h.retranscribeMeeting.mockRejectedValue(new ApiError(409, { code: "conflict", message: "로컬 음성 인식 설정이 필요해요." }));
    renderAt();
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "다시 전사" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "다시 전사할까요?" })).getByRole("button", { name: "다시 전사" }));
    expect(await screen.findByText("로컬 음성 인식 설정이 필요해요.")).toBeTruthy();
  });

  it("녹음이 없는 텍스트 회의에는 더보기 메뉴가 없고 서버에 물어보지도 않는다", async () => {
    h.getMeeting.mockResolvedValue(detail({ source: "text", provider: null, audio: null, transcript_source: "paste" }));
    renderAt();
    await screen.findByRole("heading", { name: "주간 회의" });
    expect(screen.queryByRole("button", { name: "회의록 더보기" })).toBeNull();
    expect(h.probeRetranscribe).not.toHaveBeenCalled();
  });

  it("전사·분석이 도는 중에는 다시 전사를 잠근다", async () => {
    h.getMeeting.mockResolvedValue(detail({ status: "analyzing" }));
    renderAt();
    await openMenu();
    const item = await screen.findByRole("menuitem", { name: /진행이 끝난 뒤/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("원본 회의 ↔ 다시 전사한 버전", () => {
  it("다시 전사한 회의는 전사 작업의 source_meeting_id 로 원본 회의 링크를 보여 준다", async () => {
    h.getMeeting.mockResolvedValue(detail({ id: "m2", title: "주간 회의 (재처리)" }));
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ id: "j2", meeting_id: "m2", params: { source_meeting_id: "m1", profile: "robust" } })] });
    renderAt("/meetings/m2");
    const nav = await screen.findByRole("navigation", { name: "같은 녹음의 다른 회의" });
    expect(within(nav).getByText("원본 회의")).toBeTruthy();
    expect(within(nav).getByRole("link").getAttribute("href")).toBe("/meetings/m1");
  });

  it("같은 녹음을 쓰는 회의를 찾아 원본에서 '다시 전사한 버전'으로 이어 준다(제목으로 찾고 녹음 파일로 거른다)", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [
      summary({ id: "m1", title: "주간 회의" }),
      summary({ id: "m2", title: "주간 회의 (재처리)" }),
      summary({ id: "m3", title: "주간 회의 (재처리)", audio: { ...audio, artifact_id: "other" } }), // 다른 녹음
    ] });
    renderAt();
    const nav = await screen.findByRole("navigation", { name: "같은 녹음의 다른 회의" });
    expect(within(nav).getByText("다시 전사한 버전")).toBeTruthy();
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/meetings/m2");
    expect(h.listMeetings).toHaveBeenCalledWith({ q: "주간 회의" });
  });

  it("연결된 회의가 없으면 아무것도 그리지 않는다", async () => {
    renderAt();
    await screen.findByRole("heading", { name: "주간 회의" });
    await waitFor(() => expect(h.listMeetings).toHaveBeenCalled());
    expect(screen.queryByRole("navigation", { name: "같은 녹음의 다른 회의" })).toBeNull();
  });
});

describe("진행 상태", () => {
  const transcribing = () => detail({ status: "transcribing", transcript: null, transcript_chars: 0, transcript_source: null, summary: null });
  it("작업이 큐에서 기다리면 '대기 중', 돌고 있으면 '전사 중'이라고 구분한다", async () => {
    h.getMeeting.mockResolvedValue(transcribing());
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ status: "queued" })] });
    renderAt();
    expect(await screen.findByText("대기 중")).toBeTruthy();
    cleanup();
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ status: "running" })] });
    renderAt();
    expect(await screen.findByText("전사 중", { selector: "strong" })).toBeTruthy();
  });

  it("전사 실패는 오류와 함께 보이고, 완료된 회의에는 전사·분석 결과가 나온다", async () => {
    h.getMeeting.mockResolvedValue(detail({ status: "failed", failed_stage: "transcription", error: "로컬 전사에 실패했어요.", transcript: null }));
    renderAt();
    expect(await screen.findByText("전사에 실패했어요")).toBeTruthy();
    expect(screen.getByText("로컬 전사에 실패했어요.")).toBeTruthy();
  });
});
