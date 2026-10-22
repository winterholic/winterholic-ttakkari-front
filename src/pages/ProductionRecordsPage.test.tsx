import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import type { ProductionRecord, RecordList, RecordSummary } from "../api/productionRecords";
import { ProductionRecordDetailPage, ProductionRecordsPage } from "./ProductionRecordsPage";

vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, meta }: { title: string; meta?: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{meta}</p>
    </header>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const summary = (over: Partial<RecordSummary>): RecordSummary => ({
  id: "lab-remotion-intro",
  source: "lab",
  source_label: "lab 실험",
  title: "따까리 소개 모션그래픽",
  kind: "motion_graphics",
  summary: "",
  status: "completed",
  verdict: "conditional",
  engines: ["Remotion"],
  tags: [],
  duration_seconds: 16,
  created_at: "2026-10-21T21:44:00+09:00",
  shot_count: 5,
  media_count: 8,
  thumbnail_media_id: "thumb",
  thumbnail_url: "/api/creative/records/lab-remotion-intro/media/thumb?token=t",
  complete_media: true,
  ...over,
});

const list = (items: RecordSummary[]): RecordList => ({
  items,
  total: items.length,
  counts: { g0: items.filter((i) => i.source === "g0").length, v1: 0, lab: items.filter((i) => i.source === "lab").length },
  kinds: [...new Set(items.map((i) => i.kind))],
  engines: [...new Set(items.flatMap((i) => i.engines))].sort(),
  lab: { configured: true, available: true, skipped: [] },
  skipped: [],
});

const record: ProductionRecord = {
  id: "lab-remotion-intro",
  source: "lab",
  source_label: "lab 실험",
  title: "따까리 소개 모션그래픽",
  kind: "motion_graphics",
  summary: "프레임을 보고 결함을 고친 1회전",
  status: "completed",
  created_at: "2026-10-21T21:44:00+09:00",
  updated_at: null,
  brief: "카피 맡기면, 끝나 있다.",
  style: "연속 지오메트리",
  engines: ["Remotion"],
  tags: [],
  duration_seconds: 16,
  thumbnail_media_id: "thumb",
  stages: [
    { key: "brief", label: "브리프", status: "done", summary: "카피 확정", seconds: null, details: [] },
    { key: "review", label: "검수", status: "partial", summary: "프레임 검수", seconds: 3, details: ["디코드 오류 0"] },
  ],
  shots: [
    {
      id: "hook", label: "훅", engine: "Remotion", model: "IntroV2", prompt: "마침표가 되는 점", seed: null, seconds: null,
      start_seconds: null, end_seconds: null, status: "ok", keyframe_media_id: "thumb", output_media_id: "v2", params: {}, note: "",
    },
  ],
  tools: [{ name: "Remotion", kind: "renderer", version: "4.0.537", role: "렌더", license: null }],
  metrics: [
    { key: "render", label: "렌더 소요", value: 21.6, unit: "초", source: "report", note: "" },
    { key: "mem", label: "시스템 피크 메모리", value: null, unit: null, source: null, note: "측정 안 함" },
  ],
  tables: [{ title: "렌더 측정", columns: ["작업", "초"], rows: [["IntroV2", 21.6]], source: "report" }],
  cost: { usd: 0, paid_services: [], note: "로컬" },
  media: [
    { id: "thumb", kind: "image", role: "keyframe", label: "프레임", caption: "", duration_seconds: null, width: null, height: null, available: true, url: "/api/creative/records/lab-remotion-intro/media/thumb?token=a" },
    { id: "v2", kind: "video", role: "result", label: "IntroV2", caption: "", duration_seconds: 16, width: 1920, height: 1080, available: true, url: "/api/creative/records/lab-remotion-intro/media/v2?token=b" },
    { id: "v1", kind: "video", role: "before", label: "IntroV1", caption: "", duration_seconds: 16, width: 1920, height: 1080, available: true, url: "/api/creative/records/lab-remotion-intro/media/v1?token=c" },
    { id: "gone", kind: "video", role: "compare", label: "사라진 비교", caption: "", duration_seconds: null, width: null, height: null, available: false, url: null },
    { id: "doc", kind: "document", role: "document", label: "연구 보고서", caption: "", duration_seconds: null, width: null, height: null, available: true, url: "/api/creative/records/lab-remotion-intro/media/doc?token=d" },
  ],
  revisions: [
    { label: "v1 → v2", summary: "결함 수정", media_ids: [], defects: [{ id: "A1", location: "f258", symptom: "퇴장 없음", fix: "퇴장 12프레임", status: "fixed" }] },
  ],
  review: {
    verdict: "conditional", reviewer: "자체 검수", independent: false, summary: "기계 검사 통과",
    criteria: [{ name: "디코드 오류 0", result: "pass", evidence: "ffmpeg" }, { name: "사람 시청", result: "unknown", evidence: "" }],
    limitations: ["합성 음원이라 단순함"],
  },
  warnings: [],
};

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stub = (handler: (url: string) => Response) => vi.stubGlobal("fetch", vi.fn(async (url: string) => handler(String(url))));
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/creative/records" element={<ProductionRecordsPage />} />
          <Route path="/creative/records/:rid" element={<ProductionRecordDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test("목록은 출처 배지·엔진·판정과 필터를 보여 준다", async () => {
  const items = [
    summary({}),
    summary({ id: "g0-1", source: "g0", source_label: "G0 제작", kind: "production", title: "새벽 제작", engines: ["cpu-fake"], status: "partial", verdict: "unreviewed", thumbnail_url: null, thumbnail_media_id: null }),
    summary({ id: "lab-ace", title: "ACE-Step 곡", kind: "audio", engines: ["ACE-Step"], verdict: "fail", duration_seconds: 30 }),
  ];
  stub(() => reply(list(items)));
  renderAt("/creative/records");
  await screen.findByText("따까리 소개 모션그래픽");
  expect(screen.getByText("새벽 제작")).toBeTruthy();
  expect(screen.getByText("3건")).toBeTruthy();
  const cards = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/creative/records/"));
  expect(cards).toHaveLength(3);
  expect(within(cards[0]).getByText("lab 실험")).toBeTruthy();
  expect(within(cards[0]).getByText("Remotion")).toBeTruthy();
  expect(within(cards[0]).getByText("조건부 통과")).toBeTruthy();
  expect(within(cards[1]).getByText("검수 전")).toBeTruthy();
  expect(within(cards[2]).getByText("검수 실패")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "G0 제작 1" }));
  expect(screen.getByText("1 / 3건")).toBeTruthy();
  expect(screen.queryByText("ACE-Step 곡")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "G0 제작 1" }));
  fireEvent.click(screen.getByRole("button", { name: "오디오" }));
  expect(screen.getByText("ACE-Step 곡")).toBeTruthy();
  expect(screen.queryByText("새벽 제작")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "오디오" }));
  fireEvent.click(screen.getByRole("button", { name: "cpu-fake" }));
  expect(screen.getByText("1 / 3건")).toBeTruthy();
  expect(screen.getByRole("button", { name: "cpu-fake" }).getAttribute("aria-pressed")).toBe("true");
});

test("조건에 맞는 기록이 없으면 빈 상태를 보여 준다", async () => {
  stub(() => reply(list([summary({})])));
  renderAt("/creative/records");
  await screen.findByText("따까리 소개 모션그래픽");
  fireEvent.click(screen.getByRole("button", { name: "G0 제작 0" }));
  expect(screen.getByText("조건에 맞는 기록이 없어요")).toBeTruthy();
});

test("API가 없는 운영 백엔드(404)는 배포 대기 안내를 보여 주고 기존 스튜디오 링크를 남긴다", async () => {
  stub(() => reply({ detail: "Not Found" }, 404));
  renderAt("/creative/records");
  expect(await screen.findByText("백엔드 배포 대기")).toBeTruthy();
  expect(screen.getByRole("link", { name: "콘텐츠 스튜디오로 돌아가기" }).getAttribute("href")).toBe("/creative");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("그 밖의 서버 오류는 오류 문장과 다시 불러오기를 보여 준다", async () => {
  stub(() => reply({ code: "boom", message: "서버가 고장 났어요" }, 500));
  renderAt("/creative/records");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeTruthy();
  expect(screen.queryByText("백엔드 배포 대기")).toBeNull();
});

test("상세는 단계 타임라인과 수정 이력, 미측정 값을 보여 준다", async () => {
  stub(() => reply(record));
  renderAt("/creative/records/lab-remotion-intro");
  await screen.findByText("단계 타임라인");
  expect(screen.getByText("카피 확정")).toBeTruthy();
  expect(screen.getByText("디코드 오류 0")).toBeTruthy();
  expect(screen.getByText("퇴장 없음")).toBeTruthy();
  expect(screen.getByText("수정됨")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "수치·도구" }));
  expect(screen.getByText("시스템 피크 메모리")).toBeTruthy();
  expect(screen.getAllByText("미측정").length).toBeGreaterThan(0);
  expect(screen.getByText("21.6 초")).toBeTruthy();
  expect(screen.getByText("4.0.537")).toBeTruthy(); // 도구 버전
  expect(screen.getByText("렌더")).toBeTruthy();
});

test("결과 탭은 영상 플레이어·전후 비교·없는 파일 표시를 보여 준다", async () => {
  stub(() => reply(record));
  renderAt("/creative/records/lab-remotion-intro?tab=results");
  const after = await screen.findByLabelText("IntroV2");
  expect(after.tagName).toBe("VIDEO");
  expect(after.getAttribute("controls")).not.toBeNull();
  expect(after.getAttribute("src")).toContain("/api/creative/records/lab-remotion-intro/media/v2?token=b");
  expect(screen.getByLabelText("IntroV1").tagName).toBe("VIDEO");
  expect(screen.getByText("전후 비교")).toBeTruthy();
  expect(screen.getByText("파일을 찾을 수 없어요")).toBeTruthy();
});

test("샷 탭은 샷 카드(엔진·모델·시드·시간·프롬프트)와 결과 영상을 보여 준다", async () => {
  stub(() => reply(record));
  renderAt("/creative/records/lab-remotion-intro?tab=shots");
  await screen.findByText("훅");
  expect(screen.getByText("IntroV2")).toBeTruthy();
  expect(screen.getByText("마침표가 되는 점")).toBeTruthy();
  expect(screen.getByText("시드")).toBeTruthy();
  expect(screen.getByText("없음")).toBeTruthy(); // 시드 없음
  expect(screen.getByText("미측정")).toBeTruthy(); // 시간 근거 없음
  const video = screen.getByLabelText("훅 결과 영상");
  expect(video.tagName).toBe("VIDEO");
  expect(video.getAttribute("preload")).toBe("metadata");
  expect(video.getAttribute("poster")).toContain("/media/thumb?token=a");
});

test("긴 프롬프트는 접혀 있다가 전체 보기로 펼쳐진다", async () => {
  const long = { ...record, shots: [{ ...record.shots[0], prompt: "긴 프롬프트 ".repeat(30) }] };
  stub(() => reply(long));
  renderAt("/creative/records/lab-remotion-intro?tab=shots");
  const more = await screen.findByRole("button", { name: "전체 보기" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(more);
  expect(screen.getByRole("button", { name: "접기" }).getAttribute("aria-expanded")).toBe("true");
});

test("검수 탭은 판정·한계·원문 문서 링크를 보여 준다", async () => {
  stub(() => reply(record));
  renderAt("/creative/records/lab-remotion-intro?tab=review");
  await screen.findByText("남은 한계");
  expect(screen.getByText("합성 음원이라 단순함")).toBeTruthy();
  expect(screen.getByText("독립 검수 아님")).toBeTruthy();
  const link = screen.getByRole("link", { name: /연구 보고서/ });
  expect(link.getAttribute("href")).toContain("/media/doc?token=d");
  expect(link.getAttribute("target")).toBe("_blank");
});

test("상세 404는 오류 화면이 아니라 안내와 목록 링크를 보여 준다", async () => {
  stub(() => reply({ detail: "Not Found" }, 404));
  renderAt("/creative/records/lab-nope");
  expect(await screen.findByText("기록을 찾을 수 없어요")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("link", { name: "목록으로" }).getAttribute("href")).toBe("/creative/records"));
});
