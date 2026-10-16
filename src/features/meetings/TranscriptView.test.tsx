import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import type { MeetingDetail, SttJob, SttSegment, SttUtterance } from "../../api/client";

const h = vi.hoisted(() => ({ listMeetingSttJobs: vi.fn(), listMeetingSttSegments: vi.fn(), listMeetingSttUtterances: vi.fn(), listMeetings: vi.fn(), getMeeting: vi.fn(), meetingProviders: vi.fn(), listPmsProjects: vi.fn(), listEntities: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  listMeetingSttJobs: (...a: unknown[]) => h.listMeetingSttJobs(...a),
  listMeetingSttSegments: (...a: unknown[]) => h.listMeetingSttSegments(...a),
  listMeetingSttUtterances: (...a: unknown[]) => h.listMeetingSttUtterances(...a),
  getMeeting: (...a: unknown[]) => h.getMeeting(...a),
  listMeetings: (...a: unknown[]) => h.listMeetings(...a),
  meetingProviders: (...a: unknown[]) => h.meetingProviders(...a),
  listPmsProjects: (...a: unknown[]) => h.listPmsProjects(...a),
  listEntities: (...a: unknown[]) => h.listEntities(...a),
}));
vi.mock("../../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));

import { MeetingDetailPage } from "../../pages/MeetingDetailPage";
import { TranscriptView } from "./TranscriptView";

const job = (over: Partial<SttJob> = {}): SttJob => ({
  id: "j1", meeting_id: "m1", status: "succeeded", parent_job_id: null, candidate_only: false, error: null, metadata: { diarization_status: "succeeded", speaker_count: 2 },
  created_at: "2026-10-15T01:00:00Z", finished_at: "2026-10-15T01:10:00Z", ...over,
});
const seg = (position: number, start: number, end: number, text: string, over: Partial<SttSegment> = {}): SttSegment => ({
  id: `g${position}`, position, start, end, original_text: text, corrected_text: null, speaker_id: null, identified_person: null,
  overlap: null, verification_status: "unverified", flags: [], ...over,
});
const meeting = (over: Partial<MeetingDetail> = {}): MeetingDetail => ({
  id: "m1", title: "주간 회의", scope: "personal", status: "analyzed", failed_stage: null, error: null, project: null, held_at: "2026-10-15T00:00:00+09:00",
  participants: ["민수", "지영"], source: "audio", provider: "local_whisper", audio: null, transcript_chars: 100, transcript_source: "provider:local_whisper",
  summary: "릴리스 일정을 정했다.", counts: { discussion: 0, decision: 1, action: 0, open_issue: 0, pending_proposals: 0 }, analysis_run_id: null, analysis_session_id: null,
  created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", analyzed_at: null,
  transcript: "릴리스는 목요일로 하죠 네 좋아요", items: [], proposals: [], analysis_context: [], ...over,
});

const talk: SttSegment[] = [
  seg(0, 5, 8, "릴리스는 목요일로 하죠", { speaker_id: "SPEAKER_00" }),
  seg(1, 8, 10, "고객 일정도 맞습니다", { speaker_id: "SPEAKER_00" }),
  seg(2, 12, 14, "네 목요일 좋아요", { speaker_id: "SPEAKER_01", overlap: true }),
  seg(3, 15, 17, "음 그러니까 그러니까 그러니까 그러니까 그러니까 그러니까", { speaker_id: "SPEAKER_00", flags: ["repetition"] }),
];

function wrap(ui: React.ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  h.listMeetingSttJobs.mockResolvedValue({ jobs: [job()] });
  h.listMeetingSttSegments.mockResolvedValue({ segments: talk, offset: 0 });
  // 발화 API가 아직 없는 서버는 404. 기본은 그 상태로 두고 구간 API로 대신하는 경로를 본다.
  h.listMeetingSttUtterances.mockRejectedValue(new Error("not found"));
  h.listMeetings.mockResolvedValue({ meetings: [] });
  h.meetingProviders.mockResolvedValue({ providers: [] });
  h.listPmsProjects.mockResolvedValue({ projects: [] });
  h.listEntities.mockResolvedValue({ entities: [] });
});
afterEach(cleanup);

describe("전사 뷰: 화자 있음", () => {
  it("읽기 모드에서는 반복 검수 배지를 줄이고 검수 표시를 켜면 원래 위치에 보여 준다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    const toggle = screen.getByRole("checkbox", { name: /검수 표시/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(document.querySelector(".mt-tr")?.getAttribute("data-review")).toBeNull();
    fireEvent.click(toggle);
    expect(document.querySelector(".mt-tr")?.getAttribute("data-review")).toBe("true");
    expect(screen.getByText(/검증 필요/)).toBeTruthy();
  });
  it("화자별 차례로 묶고 라벨·시각을 붙이며 같은 화자의 연속 발화는 한 카드에 둔다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(turns).toHaveLength(3); // 화자1(2발화) · 화자2 · 화자1
    expect(within(turns[0]).getByRole("button", { name: "화자 1 이름 바꾸기" })).toBeTruthy();
    expect(within(turns[0]).getByText("00:05")).toBeTruthy();
    expect(turns[0].textContent).toContain("릴리스는 목요일로 하죠");
    expect(turns[0].textContent).toContain("고객 일정도 맞습니다");
    expect(within(turns[1]).getByRole("button", { name: "화자 2 이름 바꾸기" })).toBeTruthy();
    expect(turns[0].getAttribute("data-slot")).toBe("1");
    expect(turns[1].getAttribute("data-slot")).toBe("2");
    expect(turns[2].getAttribute("data-slot")).toBe("1"); // 같은 화자는 같은 색
    expect(screen.getByRole("list", { name: "화자" }).querySelectorAll("li")).toHaveLength(2);
    expect(h.listMeetingSttSegments).toHaveBeenCalledWith("m1", "j1", 0, 500);
  });

  it("중첩 발화와 확인이 필요한 구간을 은은하게 표시한다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(within(turns[1]).getByText("겹침")).toBeTruthy();
    expect(turns[1].querySelector("[data-overlap]")).toBeTruthy();
    expect(turns[2].querySelector("[data-uncertain]")?.textContent).toContain("그러니까");
    expect(turns[0].querySelector("[data-uncertain]")).toBeNull();
  });

  it("후보 시도(candidate_only)가 아니라 성공한 원본 작업의 구간을 쓴다", async () => {
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ id: "cand", parent_job_id: "j1", candidate_only: true }), job({ id: "bad", status: "failed" }), job({ id: "good" })] });
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    expect(h.listMeetingSttSegments).toHaveBeenCalledWith("m1", "good", 0, 500);
  });

  it("500개를 넘으면 다음 쪽을 이어 받는다", async () => {
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => seg(from + i, (from + i) * 2, (from + i) * 2 + 1, `문장 ${from + i}`, { speaker_id: "SPEAKER_00" }));
    h.listMeetingSttSegments.mockImplementation((_m: string, _j: string, offset: number) => Promise.resolve({ segments: offset === 0 ? page(500, 0) : page(20, 500), offset }));
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    await waitFor(() => expect(h.listMeetingSttSegments).toHaveBeenCalledTimes(2));
    expect(h.listMeetingSttSegments).toHaveBeenLastCalledWith("m1", "j1", 500, 500);
  });

  it("화자 이름을 바꾸면 모든 차례와 목록에 반영하고 이 기기에 저장한다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    fireEvent.click((await screen.findAllByRole("button", { name: "화자 1 이름 바꾸기" }))[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "민수" })); // 참석자에서 고르기
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "민수 이름 바꾸기" }).length).toBe(3)); // 목록 칩 1 + 차례 2
    expect(JSON.parse(window.localStorage.getItem("tk:meeting-speakers:m1") ?? "{}")).toEqual({ SPEAKER_00: "민수" });
    expect(screen.getAllByRole("button", { name: "화자 2 이름 바꾸기" }).length).toBe(2);
  });

  it("저장해 둔 이름이 있으면 처음부터 쓴다", async () => {
    window.localStorage.setItem("tk:meeting-speakers:m1", JSON.stringify({ SPEAKER_01: "지영" }));
    wrap(<TranscriptView m={meeting()} />);
    expect((await screen.findAllByRole("button", { name: "지영 이름 바꾸기" })).length).toBeGreaterThan(0);
  });
});

const utt = (id: string, start: number, end: number, text: string, over: Partial<SttUtterance> = {}): SttUtterance => ({
  id, start, end, speaker_id: null, speaker_label: null, text, verification_status: "unverified", overlap: null, flags: [], ...over,
});
const uttPage = (list: SttUtterance[], over: Record<string, unknown> = {}) => ({
  job_id: "j1", utterances: list, offset: 0, limit: 500, total: list.length, has_more: false, speaker_count: 2, diarization_status: "succeeded",
  overlap_detection_status: "unsupported", audio_artifact_id: "a1", ...over,
});

describe("전사 뷰: 화자별 발화 API", () => {
  it("발화 API가 있으면 구간 API 대신 쓰고 화자별 차례·라벨·시각을 그린다", async () => {
    h.listMeetingSttUtterances.mockResolvedValue(uttPage([
      utt("0", 3, 9, "발화 API의 첫 발언입니다", { speaker_id: "SPEAKER_00", speaker_label: "화자 1" }),
      utt("1", 10, 14, "이어지는 발언입니다", { speaker_id: "SPEAKER_00", speaker_label: "화자 1" }),
      utt("2", 15, 20, "다른 사람의 발언입니다", { speaker_id: "SPEAKER_01", speaker_label: "화자 2", overlap: true }),
    ]));
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(turns[0].textContent).toContain("이어지는 발언입니다");
    expect(within(turns[1]).getByText("겹침")).toBeTruthy();
    expect(within(turns[1]).getByText("00:15")).toBeTruthy();
    expect(h.listMeetingSttUtterances).toHaveBeenCalledWith("m1", "j1", 0, 500);
    expect(h.listMeetingSttSegments).not.toHaveBeenCalled();
  });

  it("검증 필요·반복을 접은 발화에는 배지를 붙이고, 모르는 상태값도 검증 필요로 본다", async () => {
    h.listMeetingSttUtterances.mockResolvedValue(uttPage([
      utt("0", 0, 5, "보통 발언", { speaker_id: "A" }),
      utt("1", 5, 10, "검증이 필요한 발언", { speaker_id: "B", verification_status: "needs_review" }),
      utt("2", 10, 15, "반복을 접은 발언", { speaker_id: "A", flags: ["repetition_folded"] }),
      utt("3", 15, 20, "새로 생긴 상태값 발언", { speaker_id: "B", verification_status: "future_status" }),
      utt("4", 20, 25, "경고 플래그만", { speaker_id: "A", flags: ["speaker_ambiguous"] }),
    ]));
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    expect(screen.getAllByText("검증 필요")).toHaveLength(3);
    expect(document.querySelectorAll("[data-uncertain]")).toHaveLength(4); // 배지 3 + 경고 플래그 1(배지 없이 점선만)
    expect(screen.getByText("보통 발언").closest("[data-uncertain]")).toBeNull();
  });

  it("화자 분리가 안 된 발화(speaker 없음)는 라벨 없이 시각별로 보이고 사유를 안내한다", async () => {
    h.listMeetingSttUtterances.mockResolvedValue(uttPage([utt("0", 0, 4, "화자 없는 발언 하나"), utt("1", 40, 44, "한참 뒤 발언")], { diarization_status: "unavailable", speaker_count: null }));
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "화자" })).toBeNull();
    expect(screen.getByText(/화자 구분을 하지 못해서/)).toBeTruthy();
  });

  it("일부 발화만 화자가 없으면 '화자 미상'으로 표시한다", async () => {
    h.listMeetingSttUtterances.mockResolvedValue(uttPage([utt("0", 0, 4, "화자 있음", { speaker_id: "A" }), utt("1", 5, 9, "화자 없음")]));
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(within(turns[1]).getByText("화자 미상")).toBeTruthy();
  });

  it("has_more 이면 다음 쪽을 이어 받는다", async () => {
    h.listMeetingSttUtterances.mockImplementation((_m: string, _j: string, offset: number) =>
      Promise.resolve(offset === 0
        ? uttPage([utt("0", 0, 4, "첫쪽", { speaker_id: "A" })], { has_more: true, total: 2 })
        : uttPage([utt("1", 5, 9, "둘째쪽", { speaker_id: "B" })], { offset: 500 })));
    wrap(<TranscriptView m={meeting()} />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(h.listMeetingSttUtterances).toHaveBeenLastCalledWith("m1", "j1", 500, 500);
  });

  it("발화 API가 빈 목록이면 구간 API로 대신한다", async () => {
    h.listMeetingSttUtterances.mockResolvedValue(uttPage([]));
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    expect(h.listMeetingSttSegments).toHaveBeenCalled();
  });
});

describe("전사 뷰: 화자 없음", () => {
  it("화자 분리를 안 돌린 구간은 라벨 없이 시각별 블록으로 보여 주고 안내한다", async () => {
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ metadata: { diarization_status: "not_run" } })] });
    h.listMeetingSttSegments.mockResolvedValue({ segments: [seg(0, 0, 3, "첫 블록입니다"), seg(1, 30, 33, "한참 뒤 블록입니다")], offset: 0 });
    wrap(<TranscriptView m={meeting()} />);
    const turns = await screen.findAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "화자" })).toBeNull();
    expect(within(turns[1]).getByText("00:30")).toBeTruthy();
    expect(screen.getByText(/화자 구분 정보가 없어서/)).toBeTruthy();
    expect(screen.queryByText(/화자 \d/)).toBeNull();
  });
});

describe("전사 뷰: 평문 대체", () => {
  it("붙여넣은 전사는 구간 API를 부르지 않고 문단 블록으로 보여 준다", async () => {
    const m = meeting({ source: "text", provider: null, transcript_source: "paste", transcript: "첫 문단입니다.\n\n둘째 문단입니다.", transcript_chars: 20 });
    wrap(<TranscriptView m={m} />);
    const turns = await screen.findAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(h.listMeetingSttJobs).not.toHaveBeenCalled();
    expect(screen.getByText("붙여넣음")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "화자" })).toBeNull();
  });

  it("옛 외부 서비스 전사는 이름 없이 '가져온 전사'로 표시한다", async () => {
    const m = meeting({ source: "audio", provider: "clovanote", transcript_source: "provider:clovanote", transcript: "한 덩어리 텍스트입니다.", transcript_chars: 12 });
    wrap(<TranscriptView m={m} />);
    await screen.findAllByRole("article");
    expect(screen.getByText("가져온 전사")).toBeTruthy();
    expect(screen.queryByText(/클로바/)).toBeNull();
    expect(h.listMeetingSttJobs).not.toHaveBeenCalled();
  });

  it("구간 조회가 실패하면 본문 텍스트로 대신하고 알린다", async () => {
    h.listMeetingSttJobs.mockRejectedValue(new Error("boom"));
    wrap(<TranscriptView m={meeting()} />);
    expect(await screen.findByText(/본문 텍스트로 보여 드려요/)).toBeTruthy();
    expect(screen.getAllByRole("article")[0].textContent).toContain("릴리스는 목요일로 하죠");
  });

  it("성공한 작업이 없으면(구간 없음) 본문 텍스트로 대신한다", async () => {
    h.listMeetingSttJobs.mockResolvedValue({ jobs: [job({ status: "failed" })] });
    wrap(<TranscriptView m={meeting()} />);
    expect((await screen.findAllByRole("article"))[0].textContent).toContain("릴리스는 목요일로 하죠");
  });

  it("'참석자 1 00:03' 내보내기 형식은 이름과 시각을 살린다", async () => {
    const m = meeting({ source: "text", provider: null, transcript_source: "file", transcript: "참석자 1 00:03\n안녕하세요\n참석자 2 01:05\n반갑습니다" });
    wrap(<TranscriptView m={m} />);
    const turns = await screen.findAllByRole("article");
    expect(within(turns[0]).getByText("참석자 1")).toBeTruthy();
    expect(within(turns[1]).getByText("01:05")).toBeTruthy();
  });
});

describe("전사 뷰: 검색", () => {
  it("검색어를 강조하고 n/m 으로 세며 다음·이전으로 옮긴다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    fireEvent.change(screen.getByRole("searchbox", { name: "전사에서 찾기" }), { target: { value: "목요일" } });
    await waitFor(() => expect(document.querySelectorAll("mark[data-hit]")).toHaveLength(2));
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(document.querySelector("mark[aria-current]")?.closest("article")?.getAttribute("data-slot")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "다음 결과" }));
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(document.querySelector("mark[aria-current]")?.closest("article")?.getAttribute("data-slot")).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "다음 결과" }));
    expect(screen.getByText("1/2")).toBeTruthy(); // 처음으로 돌아간다
    fireEvent.click(screen.getByRole("button", { name: "이전 결과" }));
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("없는 단어는 0건이고 지우면 강조가 사라진다", async () => {
    wrap(<TranscriptView m={meeting()} />);
    await screen.findAllByRole("article");
    const box = screen.getByRole("searchbox", { name: "전사에서 찾기" });
    fireEvent.change(box, { target: { value: "없는말" } });
    expect(await screen.findByText("0건")).toBeTruthy();
    expect((screen.getByRole("button", { name: "다음 결과" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "고객" } });
    await waitFor(() => expect(document.querySelectorAll("mark[data-hit]")).toHaveLength(1));
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(document.querySelectorAll("mark[data-hit]")).toHaveLength(0));
  });

  it("평문 전사 안에서도 찾는다", async () => {
    const m = meeting({ source: "text", provider: null, transcript_source: "paste", transcript: "배포는 목요일\n회고는 금요일" });
    wrap(<TranscriptView m={m} />);
    await screen.findAllByRole("article");
    fireEvent.change(screen.getByRole("searchbox", { name: "전사에서 찾기" }), { target: { value: "금요일" } });
    await waitFor(() => expect(document.querySelectorAll("mark[data-hit]")).toHaveLength(1));
  });
});

describe("긴 회의", () => {
  it("2만 자가 넘는 전사도 차례 단위로 그리고 검색이 모든 일치를 센다", async () => {
    const segments = Array.from({ length: 1500 }, (_, i) => seg(i, i * 4, i * 4 + 3, i % 50 === 0 ? `릴리스 일정 ${i}번 안건입니다 그리고 다음으로 넘어갑니다` : `이것은 ${i}번째 발언이고 내용은 계속 이어집니다`, { speaker_id: `SPEAKER_0${(i >> 2) % 3}` }));
    h.listMeetingSttSegments.mockImplementation((_m: string, _j: string, offset: number) => Promise.resolve({ segments: segments.slice(offset, offset + 500), offset }));
    const m = meeting({ transcript_chars: segments.reduce((n, s) => n + s.original_text.length, 0) });
    expect(m.transcript_chars).toBeGreaterThan(20000);
    wrap(<TranscriptView m={m} />);
    const turns = await screen.findAllByRole("article");
    expect(turns.length).toBeGreaterThan(300);
    fireEvent.change(screen.getByRole("searchbox", { name: "전사에서 찾기" }), { target: { value: "릴리스" } });
    expect(await screen.findByText("1/30")).toBeTruthy();
  });
});

describe("요약 → 전사 이동", () => {
  const withEvidence = () => meeting({
    items: [
      { id: "i1", kind: "decision", position: 0, text: "릴리스는 목요일", detail: null, owner: null, due: null, evidence: "네 목요일 좋아요", status: "open", conflicts: [] },
      { id: "i2", kind: "decision", position: 1, text: "근거를 못 찾는 결정", detail: null, owner: null, due: null, evidence: "전사에 없는 바꿔 쓴 문장입니다", status: "open", conflicts: [] },
      { id: "i3", kind: "action", position: 0, text: "시각으로 연결", detail: null, owner: "민수", due: "수요일", evidence: null, evidence_start: 15.4, status: "open", conflicts: [] },
    ],
  });
  const renderPage = () => wrap(
    <Routes><Route path="/meetings/:meetingId" element={<MeetingDetailPage />} /></Routes>,
    "/meetings/m1",
  );

  it("근거 발화 시각이 있는 항목만 링크가 생기고, 누르면 전사 탭의 그 발화로 이동한다", async () => {
    h.getMeeting.mockResolvedValue(withEvidence());
    renderPage();
    const decisions = await screen.findByRole("list", { name: "결정 사항" });
    const link = await within(decisions).findByRole("button", { name: /근거 발화 00:12로 이동/ });
    expect(within(decisions).getAllByRole("button", { name: /근거 발화/ })).toHaveLength(1); // 못 찾은 인용문은 생략
    const byTime = await within(screen.getByRole("list", { name: "액션 아이템" })).findByRole("button", { name: /근거 발화 00:15로 이동/ });
    expect(byTime).toBeTruthy();
    fireEvent.click(link);
    await waitFor(() => expect((screen.getByRole("radio", { name: "전사" }) as HTMLInputElement).checked).toBe(true));
    await waitFor(() => expect(document.querySelector('[data-uid="s2"]')?.hasAttribute("data-flash")).toBe(true));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("근거 데이터가 없는 회의는 링크 없이 그대로 보인다(구간도 부르지 않는다)", async () => {
    h.getMeeting.mockResolvedValue(meeting({ items: [{ id: "i1", kind: "decision", position: 0, text: "결정", detail: null, owner: null, due: null, evidence: null, status: "open", conflicts: [] }] }));
    renderPage();
    await screen.findByText("결정");
    expect(screen.queryByRole("button", { name: /근거 발화/ })).toBeNull();
    // 구간·발화는 근거 링크가 필요할 때만 받는다(작업 목록은 상태 표시용으로 따로 읽는다).
    expect(h.listMeetingSttSegments).not.toHaveBeenCalled();
    expect(h.listMeetingSttUtterances).not.toHaveBeenCalled();
  });
});
