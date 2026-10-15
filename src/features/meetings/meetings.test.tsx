import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { MeetingDetail, MeetingSummary } from "../../api/client";

const h = vi.hoisted(() => ({
  listMeetings: vi.fn(), getMeeting: vi.fn(), createMeeting: vi.fn(), analyzeMeeting: vi.fn(), meetingProviders: vi.fn(),
  resolveMeetingProposal: vi.fn(), requestMeetingTranscription: vi.fn(), putMeetingTranscript: vi.fn(), patchMeetingItem: vi.fn(),
  patchMeeting: vi.fn(), deleteMeeting: vi.fn(), cancelMeetingAnalysis: vi.fn(), listEntities: vi.fn(), uploadFile: vi.fn(),
  getDefaultWorkspace: vi.fn(), listPmsProjects: vi.fn(),
}));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  listMeetings: (...a: unknown[]) => h.listMeetings(...a),
  getMeeting: (...a: unknown[]) => h.getMeeting(...a),
  createMeeting: (...a: unknown[]) => h.createMeeting(...a),
  analyzeMeeting: (...a: unknown[]) => h.analyzeMeeting(...a),
  meetingProviders: (...a: unknown[]) => h.meetingProviders(...a),
  resolveMeetingProposal: (...a: unknown[]) => h.resolveMeetingProposal(...a),
  requestMeetingTranscription: (...a: unknown[]) => h.requestMeetingTranscription(...a),
  putMeetingTranscript: (...a: unknown[]) => h.putMeetingTranscript(...a),
  patchMeetingItem: (...a: unknown[]) => h.patchMeetingItem(...a),
  patchMeeting: (...a: unknown[]) => h.patchMeeting(...a),
  deleteMeeting: (...a: unknown[]) => h.deleteMeeting(...a),
  cancelMeetingAnalysis: (...a: unknown[]) => h.cancelMeetingAnalysis(...a),
  listEntities: (...a: unknown[]) => h.listEntities(...a),
  listPmsProjects: (...a: unknown[]) => h.listPmsProjects(...a),
  uploadFile: (...a: unknown[]) => h.uploadFile(...a),
  getDefaultWorkspace: (...a: unknown[]) => h.getDefaultWorkspace(...a),
}));
vi.mock("../../shell/PageHeader", () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

import { MeetingDetailPage } from "../../pages/MeetingDetailPage";
import { MeetingNewPage } from "../../pages/MeetingNewPage";
import { MeetingsPage } from "../../pages/MeetingsPage";
import { FEATURES, moreFeatures } from "../../shell/features";

const counts = { discussion: 1, decision: 2, action: 1, open_issue: 1, pending_proposals: 2 };
const summary = (over: Partial<MeetingSummary> = {}): MeetingSummary => ({
  id: "m1", title: "주간 회의", scope: "personal", status: "review", failed_stage: null, error: null,
  project: { id: "p1", name: "Alpha" }, held_at: "2026-10-13T00:00:00+09:00", participants: ["민수"], source: "text", provider: null,
  audio: null, transcript_chars: 120, transcript_source: "paste", summary: "릴리스 일정을 논의했다.", counts,
  analysis_run_id: "r1", analysis_session_id: "s1", created_at: "2026-10-13T01:00:00Z", updated_at: "2026-10-13T01:00:00Z", analyzed_at: "2026-10-13T01:01:00Z", ...over,
});
const detail = (over: Partial<MeetingDetail> = {}): MeetingDetail => ({
  ...summary(), transcript: "민수: 목요일에 내자",
  items: [
    { id: "i1", kind: "decision", position: 0, text: "릴리스는 목요일로 앞당긴다", detail: "고객 일정", owner: null, due: null, evidence: "목요일에 내자", status: "open",
      conflicts: [{ ref: "M1", type: "memory", target_id: "x", text: "릴리스는 금요일", reason: "날짜가 다름", change: "supersede", new_text: null }] },
    { id: "i2", kind: "action", position: 0, text: "체크리스트 작성", detail: null, owner: "민수", due: "수요일", evidence: null, status: "open", conflicts: [] },
    { id: "i3", kind: "discussion", position: 0, text: "릴리스 일정", detail: "목요일 논의", owner: null, due: null, evidence: null, status: "open", conflicts: [] },
    { id: "i4", kind: "open_issue", position: 0, text: "데이터 이전 시점", detail: null, owner: null, due: null, evidence: null, status: "open", conflicts: [] },
  ],
  proposals: [
    { id: "pr1", item_id: "i1", kind: "supersede_memory", status: "pending", reason: "날짜가 다름", result: {}, created_at: "2026-10-13T01:01:00Z", resolved_at: null,
      payload: { content: "[회의 2026-10-13 '주간 회의'] 릴리스는 목요일로 앞당긴다", targets: [{ id: "x", content: "릴리스는 금요일" }] } },
    { id: "pr2", item_id: "i2", kind: "update_action_item", status: "pending", reason: "필요 없어짐", result: {}, created_at: "2026-10-13T01:01:00Z", resolved_at: null,
      payload: { target_text: "금요일 배포 준비", change: "cancel", target_meeting_title: "지난 회의" } },
  ],
  analysis_context: [{ ref: "M1", type: "memory", text: "릴리스는 금요일", kind: "decision" }],
  ...over,
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname}{l.search}</p>;
}
function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/new" element={<MeetingNewPage />} />
          <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.meetingProviders.mockResolvedValue({ default_provider: "local_whisper", providers: [{ id: "local_whisper", label: "로컬 Whisper large-v3", state: "unconfigured", message: "모델을 준비해 주세요." }] });
  h.listEntities.mockResolvedValue({ entities: [
    { id: "p1", type: "project", name: "Alpha", aliases: [], summary: null, pinned: false, scope: "personal" },
    { id: "p2", type: "project", name: "WorkOnly", aliases: [], summary: null, pinned: false, scope: "work" },
  ] });
  h.listPmsProjects.mockImplementation(({ scope }) => Promise.resolve({ projects: [
    { id: "pms-personal", name: "PMS 개인 프로젝트", scope: "personal" },
    { id: "pms-work", name: "WorkOnly", scope: "work" },
  ].filter(p => p.scope === scope) }));
  h.getDefaultWorkspace.mockResolvedValue({ id: "ws1" });
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
afterEach(cleanup);

describe("기능 목록", () => {
  it("회의록이 부가 기능에 있고 모바일 더보기에도 나온다(탭 자리는 차지하지 않는다)", () => {
    const f = FEATURES.find((x) => x.root === "meetings");
    expect(f).toMatchObject({ to: "/meetings", label: "회의록" });
    expect(f?.mobileTab).toBeFalsy();
    expect(moreFeatures().map((x) => x.root)).toContain("meetings");
  });
});

describe("회의록 목록", () => {
  it("상태·프로젝트·결정/액션 수·승인 대기를 보여 주고 범위로 거른다", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [summary(), summary({ id: "m2", title: "분석 중 회의", status: "analyzing", summary: null, counts: { ...counts, decision: 0, action: 0, open_issue: 0, pending_proposals: 0 } })] });
    renderAt("/meetings");
    const list = await screen.findByRole("list", { name: "회의록 목록" });
    const first = within(list).getByRole("link", { name: /주간 회의/ });
    expect(first.getAttribute("href")).toBe("/meetings/m1");
    expect(within(first).getByText("승인 대기")).toBeTruthy();
    expect(within(first).getByText("Alpha")).toBeTruthy();
    expect(within(first).getByText(/결정 2 · 액션 1 · 미해결 1/)).toBeTruthy();
    expect(within(list).getByText("분석 중")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "회사" }));
    await waitFor(() => expect(h.listMeetings).toHaveBeenLastCalledWith({ scope: "work", q: "" }));
  });

  it("비어 있으면 안내와 새 회의록 버튼", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [] });
    renderAt("/meetings");
    expect(await screen.findByText("아직 회의록이 없어요")).toBeTruthy();
    expect(screen.queryByText(/클로바노트/)).toBeNull();
    expect(screen.getAllByRole("link", { name: /새 회의록/ })[0].getAttribute("href")).toBe("/meetings/new");
  });
});

describe("새 회의록", () => {
  it("맥락 도서관 대신 PMS 프로젝트를 선택해 회의록을 만든다", async () => {
    h.createMeeting.mockResolvedValue(detail({ id: "m-pms" }));
    renderAt("/meetings/new");
    fireEvent.click(await screen.findByRole("combobox", { name: /프로젝트/ }));
    fireEvent.click(await screen.findByRole("option", { name: "PMS 개인 프로젝트" }));
    expect(h.listEntities).not.toHaveBeenCalled();
    expect(h.listPmsProjects).toHaveBeenCalledWith({ scope: "personal" });
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "PMS 회의" } });
    fireEvent.change(screen.getByRole("textbox", { name: "전사 텍스트" }), { target: { value: "프로젝트 점검" } });
    fireEvent.click(screen.getByRole("button", { name: "분석 시작" }));
    await waitFor(() => expect(h.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ project_id: "pms-personal" })));
  });

  it("전사 텍스트로 만들면 바로 분석을 시작하고 상세로 간다", async () => {
    h.createMeeting.mockResolvedValue(detail({ id: "m9", status: "transcribed" }));
    h.analyzeMeeting.mockResolvedValue(detail({ id: "m9", status: "analyzing" }));
    renderAt("/meetings/new");
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "킥오프" } });
    fireEvent.change(screen.getByRole("textbox", { name: "전사 텍스트" }), { target: { value: "민수: 시작합시다" } });
    fireEvent.click(screen.getByRole("button", { name: "분석 시작" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/meetings/m9"));
    // 분석은 서버가 만들자마자 건다(auto_process). 화면이 따로 부르지 않는다.
    expect(h.createMeeting).toHaveBeenCalledWith({ title: "킥오프", scope: "personal", project_id: null, held_at: null, transcript: "민수: 시작합시다", transcript_source: "paste", auto_process: true });
    expect(h.analyzeMeeting).not.toHaveBeenCalled();
  });

  it("제목·전사가 없으면 보낼 수 없다", async () => {
    renderAt("/meetings/new");
    expect((screen.getByRole("button", { name: "분석 시작" }) as HTMLButtonElement).disabled).toBe(true);
    expect(h.createMeeting).not.toHaveBeenCalled();
  });



  it("로컬 전사를 선택해 녹음을 만들면 provider_id를 전송한다", async () => {
    h.meetingProviders.mockResolvedValue({ providers: [
      { id: "local_whisper", label: "로컬 Whisper large-v3", state: "ready", message: "이 Mac에서 전사해요" },
    ] });
    h.uploadFile.mockResolvedValue({ id: "a1" });
    h.createMeeting.mockResolvedValue(detail({ id: "m8", status: "transcribing", provider: "local_whisper" }));
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "녹음 파일" }));
    const provider = await screen.findByRole("combobox", { name: /전사 엔진/ });
    fireEvent.click(provider);
    fireEvent.click(await screen.findByRole("option", { name: "로컬 Whisper large-v3" }));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "로컬 회의" } });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [new File(["x"], "a.wav", { type: "audio/wav" })] } });
    fireEvent.click(screen.getByRole("button", { name: "녹음 올리기" }));
    await waitFor(() => expect(h.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ provider_id: "local_whisper", auto_process: true })));
  });



  it("범위를 회사로 바꾸면 개인 프로젝트는 선택지에서 빠진다", async () => {
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "회사" }));
    fireEvent.click(await screen.findByRole("combobox", { name: /프로젝트/ }));
    expect(await screen.findByRole("option", { name: "WorkOnly" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Alpha" })).toBeNull();
  });
});

describe("회의록 상세", () => {
  it("탭마다 요약·결정(충돌 경고)·액션·미해결을 보여 준다", async () => {
    h.getMeeting.mockResolvedValue(detail());
    renderAt("/meetings/m1");
    expect(await screen.findByText("릴리스 일정을 논의했다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /결정/ }));
    expect(await screen.findByText("릴리스는 목요일로 앞당긴다")).toBeTruthy();
    expect(screen.getByText(/기존 결정과 충돌 가능/)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /액션/ }));
    expect(await screen.findByText("체크리스트 작성")).toBeTruthy();
    expect(screen.getByText("담당 민수")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /미해결/ }));
    expect(await screen.findByText("데이터 이전 시점")).toBeTruthy();
  });

  it("액션 완료 표시는 서버에 상태를 보낸다", async () => {
    h.getMeeting.mockResolvedValue(detail());
    h.patchMeetingItem.mockResolvedValue({});
    renderAt("/meetings/m1?tab=action");
    fireEvent.click(await screen.findByRole("button", { name: "완료" }));
    await waitFor(() => expect(h.patchMeetingItem).toHaveBeenCalledWith("m1", "i2", { status: "done" }));
  });

  it("제안은 승인·거절 전까지 대기이고, 승인하면 결과 상세로 바뀐다", async () => {
    h.getMeeting.mockResolvedValue(detail());
    const after = detail({ status: "review", counts: { ...counts, pending_proposals: 1 }, proposals: [
      { ...detail().proposals[0], status: "approved" }, detail().proposals[1],
    ] });
    h.resolveMeetingProposal.mockResolvedValue(after);
    renderAt("/meetings/m1?tab=proposals");
    const list = await screen.findByRole("list", { name: "승인 대기 제안" });
    expect(within(list).getAllByRole("button", { name: "승인" }).length).toBe(2);
    expect(within(list).getByText("릴리스는 금요일")).toBeTruthy(); // 바뀌는 기존 기억
    expect(h.resolveMeetingProposal).not.toHaveBeenCalled();
    fireEvent.click(within(list).getAllByRole("button", { name: "승인" })[0]);
    await waitFor(() => expect(h.resolveMeetingProposal).toHaveBeenCalledWith("m1", "pr1", "approve"));
    expect(await screen.findByRole("list", { name: "처리한 제안" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("list", { name: "승인 대기 제안" })).getByRole("button", { name: "거절" }));
    await waitFor(() => expect(h.resolveMeetingProposal).toHaveBeenLastCalledWith("m1", "pr2", "reject"));
  });



  it("기존 녹음을 로컬 엔진으로 전사할 수 있다", async () => {
    h.meetingProviders.mockResolvedValue({ providers: [{ id: "local_whisper", label: "로컬 Whisper large-v3", state: "ready", message: "준비됨" }] });
    h.getMeeting.mockResolvedValue(detail({ status: "uploaded", source: "audio", transcript: null,
      audio: { artifact_id: "a1", filename: "회의.m4a", size_bytes: 10 } }));
    h.requestMeetingTranscription.mockResolvedValue(detail({ status: "transcribing", provider: "local_whisper" }));
    renderAt("/meetings/m1");
    fireEvent.click(await screen.findByRole("button", { name: "로컬로 전사" }));
    await waitFor(() => expect(h.requestMeetingTranscription).toHaveBeenCalledWith("m1", "local_whisper"));
  });



  it("실패 상태는 오류를 보여 주고 다시 분석할 수 있다", async () => {
    h.getMeeting.mockResolvedValue(detail({ status: "failed", failed_stage: "analysis", error: "분석 결과에서 JSON 을 찾지 못했어요.", items: [], proposals: [], summary: null }));
    h.analyzeMeeting.mockResolvedValue(detail({ status: "analyzing" }));
    renderAt("/meetings/m1");
    expect(await screen.findByText("분석에 실패했어요")).toBeTruthy();
    expect(screen.getByText("분석 결과에서 JSON 을 찾지 못했어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /분석 시작/ }));
    await waitFor(() => expect(h.analyzeMeeting).toHaveBeenCalledWith("m1"));
  });
});

describe("로컬 전사", () => {
  it("회의 목록을 독립적으로 조회한다", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [] });
    renderAt("/meetings");
    await screen.findByText("아직 회의록이 없어요");
  });

  it("새 녹음은 로컬을 기본 선택한다", async () => {
    h.meetingProviders.mockResolvedValue({ default_provider: "clovanote", providers: [
      { id: "local_whisper", label: "로컬 Whisper large-v3", state: "ready", message: "준비됨" },
      { id: "clovanote", label: "클로바노트", state: "ready", message: "과거 서버" },
    ] });
    h.uploadFile.mockResolvedValue({ id: "a1" });
    h.createMeeting.mockResolvedValue(detail({ id: "m8", status: "transcribing", provider: "local_whisper" }));
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "녹음 파일" }));
    await screen.findByText("이 Mac에서 전사해요");
    fireEvent.click(screen.getByRole("combobox", { name: "전사 엔진" }));
    expect(screen.queryByRole("option", { name: "클로바노트" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "로컬 Whisper large-v3" }));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "로컬 기본" } });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [new File(["x"], "a.wav", { type: "audio/wav" })] } });
    fireEvent.click(screen.getByRole("button", { name: "녹음 올리기" }));
    await waitFor(() => expect(h.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ provider_id: "local_whisper" })));
  });

  it("로컬 미설정은 사유를 보여 주고 외부 엔진으로 바꾸지 않는다", async () => {
    h.meetingProviders.mockResolvedValue({ default_provider: "local_whisper", providers: [
      { id: "local_whisper", label: "로컬 Whisper large-v3", state: "unconfigured", message: "로컬 large-v3 모델 설치가 필요해요." },
    ] });
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "녹음 파일" }));
    await screen.findByText("로컬 large-v3 모델 설치가 필요해요.");
  });
});

describe("외부 연동 제거", () => {
  it("예전 노트 탭 주소도 보존된 회의록 목록을 연다", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [summary()] });
    renderAt("/meetings?view=clova");
    expect(await screen.findByRole("list", { name: "회의록 목록" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "클로바노트" })).toBeNull();
    expect(screen.queryByText("클로바노트 연결됨")).toBeNull();
  });
});
