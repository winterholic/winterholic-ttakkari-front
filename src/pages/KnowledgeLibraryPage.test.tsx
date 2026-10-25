import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  summary: vi.fn(), docs: vi.fn(), doc: vi.fn(), search: vi.fn(), evidence: vi.fn(), graph: vi.fn(), jobs: vi.fn(), retry: vi.fn(), ingest: vi.fn(), register: vi.fn(),
  conflicts: vi.fn(), entity: vi.fn(),
}));
vi.mock("../api/kb", async (orig) => ({
  ...(await orig<typeof import("../api/kb")>()),
  kbSummaryV3: (...a: unknown[]) => h.summary(...a),
  kbDocumentsV3: (...a: unknown[]) => h.docs(...a),
  kbDocumentV3: (...a: unknown[]) => h.doc(...a),
  kbSearchV3: (...a: unknown[]) => h.search(...a),
  kbEvidenceV3: (...a: unknown[]) => h.evidence(...a),
  kbGraph: (...a: unknown[]) => h.graph(...a),
  kbJobs: (...a: unknown[]) => h.jobs(...a),
  kbRetryJob: (...a: unknown[]) => h.retry(...a),
  kbIngest: (...a: unknown[]) => h.ingest(...a),
  kbConflicts: (...a: unknown[]) => h.conflicts(...a),
  kbEntity: (...a: unknown[]) => h.entity(...a),
}));
vi.mock("../api/client", async (orig) => ({ ...(await orig<typeof import("../api/client")>()), kbRegister: (...a: unknown[]) => h.register(...a) }));
import { ApiError } from "../api/client";
import { KnowledgeLibraryPage } from "./KnowledgeLibraryPage";
import { FEATURES } from "../shell/features";
import { splitHighlights } from "../features/kb/labels";
import { detail, docList, entity, evidence, graph, jobDegraded, jobFailed, jobHeld, jobRunning, searchResult, summaryLegacy, summaryV3 } from "../features/kb/kbFixtures";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});

const notFound = () => new ApiError(404, { code: "http_404", message: "Not Found" });
const where = () => screen.getByTestId("where").textContent ?? "";
function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(path = "/knowledge-library") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><KnowledgeLibraryPage /><Where /></MemoryRouter>
  </QueryClientProvider>);
}
beforeEach(() => {
  h.summary.mockResolvedValue(summaryV3);
  h.docs.mockResolvedValue(docList());
  h.doc.mockResolvedValue(detail);
  h.search.mockResolvedValue(searchResult());
  h.evidence.mockResolvedValue(evidence);
  h.graph.mockResolvedValue(graph);
  h.entity.mockResolvedValue(entity);
  h.jobs.mockResolvedValue({ items: [jobRunning, jobFailed, jobHeld, jobDegraded] });
  h.retry.mockResolvedValue(jobFailed);
  h.conflicts.mockResolvedValue({ items: [] });
  h.ingest.mockResolvedValue({ batch_id: "b1", items: [{ document_id: "d9", revision_id: "r9", job_id: "j9", status: "registered", name: "a.md" }] });
  h.register.mockResolvedValue({ document_id: "d1", revision_id: "r1", rev_no: 1, created: true, passage_count: 2 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const search = async (q: string) => {
  fireEvent.change(await screen.findByRole("searchbox", { name: "지식 도서관 검색" }), { target: { value: q } });
  fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "검색" }));
};

it("부가 기능에서 발견되고 개인 맥락 도서관과 다른 경로를 쓴다", () => {
  expect(FEATURES.find((x) => x.root === "knowledge-library")?.to).toBe("/knowledge-library");
  expect(FEATURES.find((x) => x.root === "context-library")?.to).toBe("/context-library");
});

it("개인/회사 선택 없이 네 탭과 서버가 준 현황 숫자를 보여 준다", async () => {
  mount();
  expect(await screen.findByRole("list", { name: "도서관 현황" })).toBeTruthy();
  const metrics = within(screen.getByRole("list", { name: "도서관 현황" }));
  expect(metrics.getByText("열린 충돌").nextSibling?.textContent).toBe("2");
  expect(screen.queryByRole("button", { name: "개인" })).toBeNull();
  expect(screen.queryByRole("button", { name: "회사" })).toBeNull();
  const tabs = within(screen.getByRole("navigation", { name: "보기 방식" })).getAllByRole("button").map((b) => b.textContent);
  expect(tabs).toEqual(["지식 탐색", "개념 그래프", "문서·처리", "충돌·품질"]);
  expect(screen.getByRole("button", { name: /처리 진행 1 · 실패 1/ })).toBeTruthy();
  expect(h.summary).toHaveBeenCalledWith();
});

it("v3 숫자가 없는 서버에서는 통합이라 말하지 않고 개인 범위 한계를 알리며, 없는 숫자는 만들지 않는다", async () => {
  h.summary.mockResolvedValue(summaryLegacy);
  mount();
  expect((await screen.findByText(/개인 범위만일 수 있어서/)).textContent).toContain("v3 API");
  expect(screen.queryByRole("list", { name: "도서관 현황" })?.textContent ?? "").not.toContain("열린 충돌");
  expect(screen.queryByText(/통합 도서관/)).toBeNull();
  expect(screen.getByRole("button", { name: "처리 현황" })).toBeTruthy();
});

it("메인은 최근 자료·주제 분류·주요 개념과 관계·처리 현황을 보여 주고 누르면 탐색으로 이어진다", async () => {
  mount();
  const recent = await screen.findByRole("list", { name: "최근 자료" });
  expect(within(recent).getByText("Kubernetes Deployment 가이드")).toBeTruthy();
  expect(within(recent).getByText("완료")).toBeTruthy();
  expect(screen.getByText("진행 중 1건")).toBeTruthy();
  expect(screen.getByText("실패 1건")).toBeTruthy();
  const relations = await screen.findByRole("list", { name: "주요 관계" });
  expect(within(relations).getAllByText("manages →").length).toBe(2);
  fireEvent.click(await screen.findByRole("button", { name: "개발·인프라 1" }));
  expect(where()).toContain("domain=dev-infra");
  await waitFor(() => expect(h.graph).toHaveBeenLastCalledWith(expect.objectContaining({ domain: "dev-infra", limit: 12 })));
  fireEvent.click(await screen.findByRole("button", { name: /^Deployment/ }));
  expect(where()).toContain("concept=e-dep");
  expect(where()).toContain("q=Deployment");
  await waitFor(() => expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ q: "Deployment", entity_id: "e-dep" })));
});

it("메인에서 그래프로 이어진다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "개념 그래프에서 펼쳐 보기" }));
  expect(where()).toContain("view=graph");
});

it("메인의 한 섹션이 이 서버에서 미지원이어도 나머지는 계속 쓸 수 있다", async () => {
  h.graph.mockRejectedValue(notFound());
  mount();
  expect(await screen.findByRole("list", { name: "최근 자료" })).toBeTruthy();
  expect((await screen.findAllByText(/아직 이 기능을 지원하지 않아요/)).length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
});

it("통합 검색: 정본 개념 카드, 구조·위치 배지, 충돌 경고, 근거 원문 보기까지 이어진다", async () => {
  mount();
  await search("디플로이먼트");
  await waitFor(() => expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ q: "디플로이먼트", mode: "hybrid", offset: 0 })));
  expect(where()).toContain("q=%EB%94%94");
  const card = await screen.findByRole("article", { name: "개념 Deployment" });
  expect(within(card).getByText(/선언적 업데이트/)).toBeTruthy();
  expect(within(card).getByText("롤링 업데이트를 기본으로 한다.")).toBeTruthy();
  expect(within(card).getByText(/디플로이먼트 · k8s Deployment/)).toBeTruthy();
  expect(within(card).getByRole("button", { name: "충돌 1건 감지됨" })).toBeTruthy();
  const list = await screen.findByRole("list", { name: "검색 결과" });
  const crumbs = within(list).getByRole("navigation", { name: "문서 안 위치" });
  expect(Array.from(crumbs.querySelectorAll("li")).map((x) => x.textContent)).toEqual(["Kubernetes", "Workloads", "Deployments"]);
  for (const t of ["p.14", "Slide 5", "2:15", "1-hop 확장", "단어", "충돌 있음", "현재 버전"]) expect(within(list).getByText(t)).toBeTruthy();
  expect(Array.from(list.querySelectorAll("mark")).map((m) => m.textContent)).toEqual(["ReplicaSet"]);
  fireEvent.click(within(list).getByRole("button", { name: "근거 원문 보기" }));
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  expect(h.evidence).toHaveBeenCalledWith("p1");
});

it("정본 카드의 이웃 개념을 누르면 그 개념으로 좁혀 다시 검색하고, 충돌 배지는 충돌 탭으로 보낸다", async () => {
  mount("/knowledge-library?q=%EB%94%94");
  fireEvent.click(await screen.findByRole("button", { name: /manages → ReplicaSet/ }));
  expect(where()).toContain("concept=e-rs");
  expect(where()).toContain("cn=ReplicaSet");
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ entity_id: "e-rs" })));
  expect(screen.getByText("개념: ReplicaSet")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "개념 필터 해제" }));
  expect(where()).not.toContain("concept=");
  fireEvent.click(await screen.findByRole("button", { name: "충돌 1건 감지됨" }));
  expect(where()).toContain("view=conflicts");
  expect(where()).toContain("ent=e-dep");
});

it("근거가 약하거나 없으면 그렇게 말하고, 실패하면 오류와 다시 시도를 보여 준다", async () => {
  h.search.mockResolvedValueOnce(searchResult({ coverage: "weak" }));
  mount("/knowledge-library?q=x");
  expect((await screen.findByText(/근거가 약해요/)).getAttribute("role")).toBe("status");
  cleanup();
  h.search.mockResolvedValueOnce(searchResult({ coverage: "none", items: [], matched_entities: [] }));
  mount("/knowledge-library?q=y");
  expect(await screen.findByText(/맞는 근거를 찾지 못했어요/)).toBeTruthy();
  cleanup();
  h.search.mockRejectedValueOnce(new ApiError(500, { code: "internal", message: "서버 오류가 발생했습니다." }));
  mount("/knowledge-library?q=abc");
  expect((await screen.findByRole("alert")).textContent).toContain("서버 오류");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("list", { name: "검색 결과" })).toBeTruthy();
});

it("서버가 거르지 않는 필터는 불러온 결과 안에서만 거른다고 밝힌다", async () => {
  mount("/knowledge-library?q=x&type=file");
  expect(await screen.findByText(/불러온 결과 중 필터에 맞는 것이 없어요/)).toBeTruthy();
  expect(screen.getByText("불러온 1건 중 0건")).toBeTruthy();
  expect(screen.getByText(/서버가 아직 거르지 않아/)).toBeTruthy();
  expect(h.search).toHaveBeenCalledWith(expect.not.objectContaining({ type: "file" }));
});

it("더 볼 결과가 있으면 offset 을 넘겨 이어서 가져온다", async () => {
  h.search.mockResolvedValueOnce(searchResult({ has_more: true }));
  h.search.mockResolvedValueOnce(searchResult({ offset: 20, matched_entities: [] }));
  mount("/knowledge-library?q=qq");
  fireEvent.click(await screen.findByRole("button", { name: "결과 더 보기" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 })));
});

it("자료 추가: 잘못된 주소는 보내기 전에 알리고, 파일·주소·글을 한 번에 제출한 뒤 처리 현황으로 이어진다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "+ 자료 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  const scope = within(dialog);
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: "not a url\nhttps://example.test/a" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("not a url");
  expect(h.ingest).not.toHaveBeenCalled();
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: "https://example.test/a\nhttps://example.test/a" } });
  const file = new File(["# a"], "a.md", { type: "text/markdown" });
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [file] } });
  expect(scope.getByText("a.md")).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.ingest).toHaveBeenCalledTimes(1));
  const arg = h.ingest.mock.calls[0][0];
  expect(arg.files).toEqual([file]);
  expect(arg.urls).toEqual(["https://example.test/a"]);
  expect(await scope.findByText(/1건을 접수했어요/)).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "처리 현황 보기" }));
  expect(await screen.findByRole("dialog", { name: "자동 처리 현황" })).toBeTruthy();
  await waitFor(() => expect(h.jobs).toHaveBeenCalled());
});

it("자료 추가: 입력이 없거나 글만 있고 제목이 없으면 막는다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "+ 자료 추가" }));
  const scope = within(await screen.findByRole("dialog", { name: "자료 추가" }));
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("하나는 넣어 주세요");
  fireEvent.change(scope.getByLabelText("직접 쓴 글"), { target: { value: "본문" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(scope.getByRole("alert").textContent).toContain("제목"));
  expect(h.ingest).not.toHaveBeenCalled();
});

it("자료 추가: 서버가 v3 ingest 를 모르면 미지원을 알리고, 글만 있을 때만 기존 저장 방식을 권한다", async () => {
  h.ingest.mockRejectedValue(notFound());
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "+ 자료 추가" }));
  const scope = within(await screen.findByRole("dialog", { name: "자료 추가" }));
  fireEvent.change(scope.getByLabelText("직접 쓴 글"), { target: { value: "본문" } });
  fireEvent.change(scope.getByLabelText("제목 (글만 올릴 때 필수)"), { target: { value: "메모" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("지원하지 않아요");
  fireEvent.click(scope.getByRole("button", { name: "기존 방식으로 글 저장" }));
  await waitFor(() => expect(h.register).toHaveBeenCalledWith({ title: "메모", text: "본문" }));
  expect(await scope.findByText(/자동 처리 현황은 이 서버가 아직 제공하지 않아요/)).toBeTruthy();
});

it("페이지에 파일을 끌어다 놓으면 자료 추가 창이 열리고 그 파일이 담긴다", async () => {
  const { container } = mount();
  await screen.findByRole("navigation", { name: "보기 방식" });
  const file = new File(["x"], "spec.pdf", { type: "application/pdf" });
  fireEvent.drop(container.querySelector(".tk-screen__body")!, { dataTransfer: { files: [file], types: ["Files"] } });
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  expect(within(dialog).getByText("spec.pdf")).toBeTruthy();
});

it("처리 현황: 단계 타임라인, 실패 단계부터 재시도, 보류 사유, 부분 완료의 심층 추출 재시도", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /처리 진행 1/ }));
  const dialog = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  const jobs = await within(dialog).findByRole("list", { name: "처리 작업" });
  const item = (title: string) => within(within(jobs).getByText(title).closest("li") as HTMLElement);
  expect(item("방금 올린 PDF").getByText("청킹 중")).toBeTruthy();
  expect(within(dialog).getByText(/3초마다 새로 읽어요/)).toBeTruthy();
  const failed = item("깨진 PDF");
  expect(failed.getByRole("alert").textContent).toContain("지식 추출 단계에서 실패했어요");
  fireEvent.click(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }));
  await waitFor(() => expect(h.retry).toHaveBeenCalledWith("j-fail", "extracting"));
  fireEvent.click(failed.getByRole("button", { name: "처음부터 다시" }));
  await waitFor(() => expect(h.retry).toHaveBeenLastCalledWith("j-fail", null));
  const held = item("스캔본.pdf");
  expect(held.getByText(/OCR 을 지원하지 않아/)).toBeTruthy();
  expect(held.queryByRole("button", { name: /재시도/ })).toBeNull();
  const degraded = item("LLM 없이 처리된 문서");
  expect(degraded.getByText(/패시지 검색은 바로 쓸 수 있고/)).toBeTruthy();
  fireEvent.click(degraded.getByRole("button", { name: "심층 추출만 다시" }));
  await waitFor(() => expect(h.retry).toHaveBeenLastCalledWith("j-deg", "extracting"));
});

it("처리 현황: 재시도가 실패하면 그 작업 안에 오류를 보여 준다", async () => {
  h.retry.mockRejectedValueOnce(new ApiError(409, { code: "kb_job_busy", message: "작업이 이미 실행 중이에요." }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /처리 진행 1/ }));
  const failed = within((await screen.findByText("깨진 PDF")).closest("li") as HTMLElement);
  fireEvent.click(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }));
  await waitFor(() => expect(failed.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("이미 실행 중"));
  // 오류가 나도 다시 누를 수 있다.
  expect(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }).hasAttribute("disabled")).toBe(false);
});

it("처리 현황: 이 서버에 jobs 가 없으면 빈 목록이 아니라 미지원으로 보여 준다", async () => {
  h.jobs.mockRejectedValue(notFound());
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /처리 진행 1/ }));
  const dialog = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  expect((await within(dialog).findByRole("alert")).textContent).toContain("지원하지 않아요");
  expect(within(dialog).queryByText(/처리된 작업이 없어요/)).toBeNull();
});

it("문서·처리 탭: 목록에서 문서를 열면 요약·처리 단계·개념·주장·버전 이력을 볼 수 있고 수집기 관리로 가는 링크가 있다", async () => {
  mount("/knowledge-library?view=docs");
  expect(screen.getByRole("link", { name: /외부 자동 수집기 관리/ }).getAttribute("href")).toBe("/collect");
  const row = await screen.findByRole("button", { name: /^Kubernetes Deployment 가이드/ });
  expect(within(row).getByText("완료")).toBeTruthy();
  expect(within(row).getByText("개발·인프라")).toBeTruthy();
  fireEvent.click(row);
  expect(where()).toContain("doc=d1");
  expect(await screen.findByRole("heading", { name: "Kubernetes Deployment 가이드" })).toBeTruthy();
  expect(screen.getByText(/선언적으로 배포하는 방법/)).toBeTruthy();
  expect(screen.getByRole("list", { name: "처리 단계" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "심층 추출만 다시" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "개념·주장" }));
  expect(where()).toContain("ds=knowledge");
  fireEvent.click(await screen.findByRole("button", { name: /^근거 원문 보기$/ }));
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "충돌 비교하러 가기" }));
  expect(where()).toContain("view=conflicts");
});

it("문서 상세: 패시지 위치 배지와 목차, 이전 버전 선택과 안내", async () => {
  mount("/knowledge-library?view=docs&doc=d1&ds=passages");
  const passages = await screen.findByRole("list", { name: "패시지" });
  expect(within(passages).getByText("p.3")).toBeTruthy();
  expect(within(passages).getAllByRole("navigation", { name: "문서 안 위치" }).length).toBe(2);
  expect(screen.getByText("목차 2개 절")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "버전·이력" }));
  h.doc.mockResolvedValue({ ...detail, selected_revision_id: "r1" });
  fireEvent.click(await screen.findByRole("button", { name: "이 버전 보기" }));
  await waitFor(() => expect(h.doc).toHaveBeenLastCalledWith("d1", expect.objectContaining({ revision_id: "r1" })));
  expect(where()).toContain("rev=r1");
  expect(await screen.findByText(/이전 버전이에요/)).toBeTruthy();
});

it("문서 상세: 서버가 요약·개념·주장을 안 주면 없다고 말하고, 처리 기록은 jobs 에서 찾는다", async () => {
  const { summary: _s, entities: _e, assertions: _a, conflicts: _c, pipeline: _p, ...bare } = detail;
  void [_s, _e, _a, _c, _p];
  h.doc.mockResolvedValue(bare);
  h.jobs.mockResolvedValue({ items: [jobRunning] });
  mount("/knowledge-library?view=docs&doc=d1");
  expect(await screen.findByText(/문서 요약을 아직 주지 않아요/)).toBeTruthy();
  await waitFor(() => expect(h.jobs).toHaveBeenCalledWith({ document_id: "d1", limit: 1 }));
  expect(await screen.findByText("청킹 중")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "개념·주장" }));
  expect(screen.getByText(/개념 목록을 아직 주지 않아요/)).toBeTruthy();
  expect(screen.getByText(/주장 목록을 아직 주지 않아요/)).toBeTruthy();
});

it("문서 목록: 처리 상태 필터는 서버에 보내고 실패하면 다시 시도할 수 있다", async () => {
  h.docs.mockRejectedValueOnce(new ApiError(500, { code: "internal", message: "서버 오류가 발생했습니다." }));
  mount("/knowledge-library?view=docs&status=failed");
  expect((await screen.findByRole("alert")).textContent).toContain("서버 오류");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(h.docs).toHaveBeenLastCalledWith(expect.objectContaining({ pipeline_status: "failed", offset: 0 })));
  expect(await screen.findByRole("list", { name: "문서 목록" })).toBeTruthy();
});

it("문서가 없으면 추가 안내가 나온다", async () => {
  h.docs.mockResolvedValue(docList([]));
  mount("/knowledge-library?view=docs");
  expect(await screen.findByText("아직 등록된 문서가 없어요.")).toBeTruthy();
});

it("예전 주소: view=collect 는 수집 관리로, view=add·search 는 지식 탐색으로 옮기고 scope 는 버린다", async () => {
  mount("/knowledge-library?view=collect&scope=work");
  await waitFor(() => expect(where()).toBe("/collect?scope=work"));
  cleanup();
  mount("/knowledge-library?view=add&scope=work");
  const tab = await screen.findByRole("button", { name: "지식 탐색" });
  expect(tab.getAttribute("aria-pressed")).toBe("true");
  await search("격리");
  await waitFor(() => expect(where()).toContain("q="));
  expect(where()).not.toContain("scope");
});

it("splitHighlights 는 코드포인트 기준 구간을 나누고 잘못된 구간은 건너뛴다", () => {
  expect(splitHighlights("가나다라", [[1, 3]])).toEqual([{ text: "가", hit: false }, { text: "나다", hit: true }, { text: "라", hit: false }]);
  expect(splitHighlights("😀ab", [[1, 2]])).toEqual([{ text: "😀", hit: false }, { text: "a", hit: true }, { text: "b", hit: false }]);
  expect(splitHighlights("abc", [[0, 2], [1, 3], [5, 9]])).toEqual([{ text: "ab", hit: true }, { text: "c", hit: false }]);
  expect(splitHighlights("abc", [])).toEqual([{ text: "abc", hit: false }]);
});
