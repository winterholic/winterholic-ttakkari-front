import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ClovaJob, ClovaStatus, MeetingDetail, MeetingSummary } from "../../api/client";

const h = vi.hoisted(() => ({
  listMeetings: vi.fn(), getMeeting: vi.fn(), createMeeting: vi.fn(), analyzeMeeting: vi.fn(), meetingProviders: vi.fn(),
  resolveMeetingProposal: vi.fn(), requestMeetingTranscription: vi.fn(), putMeetingTranscript: vi.fn(), patchMeetingItem: vi.fn(),
  patchMeeting: vi.fn(), deleteMeeting: vi.fn(), cancelMeetingAnalysis: vi.fn(), listEntities: vi.fn(), uploadFile: vi.fn(),
  getDefaultWorkspace: vi.fn(), listPmsProjects: vi.fn(),
  clovaStatus: vi.fn(), clovaJobs: vi.fn(), clovaNotes: vi.fn(), clovaSync: vi.fn(), clovaOpenLogin: vi.fn(), clovaImport: vi.fn(), clovaRetryJob: vi.fn(),
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
  clovaStatus: (...a: unknown[]) => h.clovaStatus(...a),
  clovaJobs: (...a: unknown[]) => h.clovaJobs(...a),
  clovaNotes: (...a: unknown[]) => h.clovaNotes(...a),
  clovaSync: (...a: unknown[]) => h.clovaSync(...a),
  clovaOpenLogin: (...a: unknown[]) => h.clovaOpenLogin(...a),
  clovaImport: (...a: unknown[]) => h.clovaImport(...a),
  clovaRetryJob: (...a: unknown[]) => h.clovaRetryJob(...a),
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

const clovaReady = (over: Partial<ClovaStatus> = {}): ClovaStatus => ({
  state: "ready", message: "연결됨", checked_at: 1, account: { name: "김대선", email: null }, workspace: { id: "w", name: "w" },
  quota: { recognition_remain_minutes: 299, summary_remain: 15, refresh_at: null },
  login: { state: "idle", message: null, started_at: null, finished_at: null }, browser_running: false,
  active_jobs: 0, notes: 2, unimported: 1, last_sync_at: null, ...over,
});
const uploadJob = (over: Partial<ClovaJob> = {}): ClovaJob => ({
  id: "j1", kind: "upload", status: "running", stage: "recognize", progress: 40, message: "클로바노트가 전사하는 중 40%", error: null,
  note_id: "up-1", meeting_id: "m1", params: {}, result: {}, steps: [{ at: "2026-10-13T01:00:00Z", stage: "upload", message: "녹음 올리는 중" }],
  stages: [{ id: "connect", label: "연결" }, { id: "create", label: "노트 만들기" }, { id: "upload", label: "업로드" }, { id: "recognize", label: "전사" },
    { id: "fetch", label: "전사 받기" }, { id: "analyze", label: "분석 요청" }, { id: "done", label: "완료" }],
  created_at: "2026-10-13T01:00:00Z", started_at: null, finished_at: null, updated_at: "2026-10-13T01:00:00Z", ...over,
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
  h.meetingProviders.mockResolvedValue({ providers: [{ id: "clovanote", label: "클로바노트", state: "not_implemented", message: "클로바노트 연동 준비 중이에요.", profile_configured: false }] });
  h.listEntities.mockResolvedValue({ entities: [
    { id: "p1", type: "project", name: "Alpha", aliases: [], summary: null, pinned: false, scope: "personal" },
    { id: "p2", type: "project", name: "WorkOnly", aliases: [], summary: null, pinned: false, scope: "work" },
  ] });
  h.listPmsProjects.mockImplementation(({ scope }) => Promise.resolve({ projects: [
    { id: "pms-personal", name: "PMS 개인 프로젝트", scope: "personal" },
    { id: "pms-work", name: "WorkOnly", scope: "work" },
  ].filter(p => p.scope === scope) }));
  h.getDefaultWorkspace.mockResolvedValue({ id: "ws1" });
  h.clovaStatus.mockResolvedValue(clovaReady());
  h.clovaJobs.mockResolvedValue({ jobs: [] });
  h.clovaNotes.mockResolvedValue({ notes: [] });
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
    expect(screen.getAllByRole("link", { name: /새 회의록/ })[0].getAttribute("href")).toBe("/meetings/new");
  });
});

describe("클로바노트", () => {
  it("연결 줄에 계정·남은 변환 시간을 보이고, 노트 탭에서 가져오기를 건다", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [] });
    h.clovaNotes.mockResolvedValue({ notes: [
      { note_id: "n1", title: "제품 회의 녹음", state: "ready", remote_status: "DONE", duration_ms: 213520, recorded_at: "2026-10-13T01:00:00Z", remote_updated_at: null,
        speakers: ["민수", "지영"], has_transcript: true, transcript_chars: 300, summary: null, meeting_id: null, missing: false, sample: false, progress: 100,
        synced_at: null, transcript_fetched_at: null },
      { note_id: "n2", title: "가져온 회의", state: "ready", remote_status: "DONE", duration_ms: 60000, recorded_at: null, remote_updated_at: null,
        speakers: [], has_transcript: true, transcript_chars: 10, summary: null, meeting_id: "m5", missing: false, sample: false, progress: 100,
        synced_at: null, transcript_fetched_at: null, meeting: { id: "m5", title: "가져온 회의", status: "review" } },
    ] });
    h.clovaImport.mockResolvedValue(uploadJob({ kind: "import", status: "queued" }));
    renderAt("/meetings");
    expect(await screen.findByText("클로바노트 연결됨")).toBeTruthy();
    expect(screen.getByText("변환 299분 남음")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /클로바노트/ }));
    const list = await screen.findByRole("list", { name: "클로바노트 노트" });
    expect(within(list).getByText("3분 34초")).toBeTruthy();
    expect(within(list).getByRole("link", { name: /가져온 회의 회의록 열기/ }).getAttribute("href")).toBe("/meetings/m5");
    fireEvent.click(within(list).getByRole("button", { name: "가져오기" }));
    const dialog = await screen.findByRole("dialog", { name: "회의록으로 가져오기" });
    fireEvent.click(within(dialog).getByRole("combobox", { name: /프로젝트/ }));
    fireEvent.click(await screen.findByRole("option", { name: "PMS 개인 프로젝트" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "가져오기" }));
    await waitFor(() => expect(h.clovaImport).toHaveBeenCalledWith("n1", { scope: "personal", project_id: "pms-personal", analyze: true }));
  });

  it("처리 중인 동기화 작업이 있으면 목록 위에 진행을 보여 준다", async () => {
    h.listMeetings.mockResolvedValue({ meetings: [] });
    h.clovaStatus.mockResolvedValue(clovaReady({ active_jobs: 1 }));
    h.clovaJobs.mockResolvedValue({ jobs: [uploadJob({ id: "s1", kind: "sync", stage: "fetch", progress: 50, message: "전사 받는 중 (1/2)",
      stages: [{ id: "connect", label: "연결" }, { id: "list", label: "목록" }, { id: "fetch", label: "전사 받기" }, { id: "done", label: "완료" }] })] });
    renderAt("/meetings");
    const bar = await screen.findByRole("progressbar", { name: /노트 동기화 진행/ });
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(screen.getByText("전사 받는 중 (1/2)")).toBeTruthy();
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

  it("녹음 파일 방식은 클로바노트로 바로 처리한다고 알리고, 자동 처리로 만든다", async () => {
    h.uploadFile.mockResolvedValue({ id: "a1" });
    h.createMeeting.mockResolvedValue(detail({ id: "m8", status: "uploaded", source: "audio", transcript: null }));
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "녹음 파일" }));
    expect(await screen.findByText("올리면 바로 처리해요")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "녹음 회의" } });
    const file = new File(["x"], "회의.m4a", { type: "audio/mp4" });
    fireEvent.change(screen.getByRole("textbox", { name: "제목" }).ownerDocument.querySelector("input[type=file]") as HTMLInputElement, { target: { files: [file] } });
    const btn = screen.getByRole("button", { name: "녹음 올리기" });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/meetings/m8"));
    expect(h.uploadFile).toHaveBeenCalledWith(file, "ws1");
    expect(h.createMeeting.mock.calls[0][0]).toMatchObject({ audio_artifact_id: "a1", title: "녹음 회의", auto_process: true });
    expect(h.analyzeMeeting).not.toHaveBeenCalled();
  });

  it("클로바노트 로그인이 풀렸으면 녹음 방식에서 로그인 창 열기를 안내한다", async () => {
    h.clovaStatus.mockResolvedValue(clovaReady({ state: "login_required", message: "클로바노트 로그인이 풀렸어요." }));
    h.clovaOpenLogin.mockResolvedValue(clovaReady({ state: "login_window", login: { state: "waiting", message: "로그인해 주세요", started_at: 1, finished_at: null } }));
    renderAt("/meetings/new");
    fireEvent.click(screen.getByRole("radio", { name: "녹음 파일" }));
    expect(await screen.findByText("클로바노트 로그인이 필요해요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /로그인 창 열기/ }));
    await waitFor(() => expect(h.clovaOpenLogin).toHaveBeenCalled());
    expect(await screen.findByText("네이버 로그인을 기다리는 중")).toBeTruthy();
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

  it("녹음만 있는 회의는 클로바노트 전사 버튼을 주고, 요청이 거절되면 사유를 보여 준다", async () => {
    h.getMeeting.mockResolvedValue(detail({ status: "uploaded", source: "audio", transcript: null, transcript_chars: 0, summary: null, items: [], proposals: [],
      audio: { artifact_id: "a1", filename: "회의.m4a", size_bytes: 10 }, counts: { discussion: 0, decision: 0, action: 0, open_issue: 0, pending_proposals: 0 } }));
    h.requestMeetingTranscription.mockRejectedValue(Object.assign(new Error("클로바노트 로그인이 필요해요."), { code: "provider_unavailable" }));
    renderAt("/meetings/m1");
    expect(await screen.findByText("녹음이 전사를 기다려요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /분석 시작/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /클로바노트로 전사/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("클로바노트 로그인이 필요해요.");
  });

  it("클로바노트 전사 중이면 단계·진행률·지금 하는 일과 도서관 저장 상태를 보여 준다", async () => {
    h.getMeeting.mockResolvedValue(detail({ status: "transcribing", source: "audio", provider: "clovanote", transcript: null, summary: null, items: [], proposals: [],
      audio: { artifact_id: "a1", filename: "회의.m4a", size_bytes: 10 }, clovanote: { job: uploadJob(), note: null },
      vector: { status: "ready", chunks: 3, error: null, embedded_at: null } }));
    renderAt("/meetings/m1");
    const bar = await screen.findByRole("progressbar", { name: /클로바노트 전사 진행/ });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("클로바노트가 전사하는 중 40%")).toBeTruthy();
    const steps = screen.getByRole("list", { name: "처리 단계" });
    expect(within(steps).getByText("업로드").closest("li")?.getAttribute("data-state")).toBe("succeeded");
    expect(within(steps).getByText("전사").closest("li")?.getAttribute("data-state")).toBe("running");
    expect(screen.getByText(/맥락 도서관에 3조각 저장됨/)).toBeTruthy();
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
