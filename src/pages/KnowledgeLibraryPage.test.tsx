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
import { detail, docList, entity, evidence, graph, ingestMixed, jobDegraded, jobFailed, jobHeld, jobHeldRetriable, jobList, jobRunning, searchResult, summaryLegacy, summaryV3 } from "../features/kb/kbFixtures";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});

// 실서버는 FastAPI 기본 404 도 {code, message} 로 감싸 code 는 not_found 이다.
const notFound = () => new ApiError(404, { code: "not_found", message: "Not Found" });
const retried = (job: typeof jobFailed, from: string | null = "extracting") => ({ ...job, retry: { requeued: true, from_stage: from, reason: null, reset_stages: from ? [from] : [] } });
const pipelineButton = () => screen.getByRole("button", { name: /^처리 현황 열기: 진행/ });
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
  // 주제별 문서 수는 domain 을 붙인 limit=1 요청의 total 로 센다. dev-infra 만 1건이다.
  h.docs.mockImplementation((p: { domain?: string; limit?: number }) => Promise.resolve(p.domain && p.limit === 1 ? (p.domain === "dev-infra" ? { ...docList(), limit: 1 } : { items: [], total: 0, limit: 1, offset: 0 }) : docList()));
  h.doc.mockResolvedValue(detail);
  h.search.mockResolvedValue(searchResult());
  h.evidence.mockResolvedValue(evidence);
  h.graph.mockResolvedValue(graph);
  h.entity.mockResolvedValue(entity);
  h.jobs.mockImplementation((p: { status?: string }) => Promise.resolve(p.status === "failed" ? jobList([jobFailed]) : p.status === "held" ? jobList([jobHeld]) : jobList([jobRunning, jobFailed, jobHeld, jobHeldRetriable, jobDegraded])));
  h.retry.mockResolvedValue(retried(jobFailed));
  h.conflicts.mockResolvedValue({ items: [], total: 0 });
  h.ingest.mockResolvedValue({ batch_id: "b1", items: [{ document_id: "d9", revision_id: "r9", job_id: "j9", status: "registered", name: "a.md", detected_type: "md", created: true }] });
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
  expect(pipelineButton().textContent).toBe("처리 진행 1 · 실패 1 · 보류 1");
  expect(pipelineButton().getAttribute("aria-label")).toBe("처리 현황 열기: 진행 1건, 실패 1건, 보류 1건, 부분 완료 1건");
  expect(h.summary).toHaveBeenCalledWith();
});

it("v3 숫자가 없는 서버에서는 통합이라 말하지 않고 개인 범위 한계를 알리며, 없는 숫자는 만들지 않는다", async () => {
  h.summary.mockResolvedValue(summaryLegacy);
  mount();
  expect((await screen.findByText(/개인 범위만일 수 있어서/)).textContent).toContain("v3 API");
  expect(screen.queryByRole("list", { name: "도서관 현황" })?.textContent ?? "").not.toContain("열린 충돌");
  expect(screen.queryByText(/통합 도서관/)).toBeNull();
  expect(screen.getAllByRole("button", { name: "처리 현황 열기" })[0].textContent).toBe("처리 현황");
});

it("메인은 최근 자료·주제 분류·주요 개념과 관계·처리 현황을 보여 주고 누르면 탐색으로 이어진다", async () => {
  mount();
  const recent = await screen.findByRole("list", { name: "최근 자료" });
  expect(within(recent).getByText("Kubernetes Deployment 가이드")).toBeTruthy();
  expect(within(recent).getByText("완료")).toBeTruthy();
  expect(screen.getByText("진행 중 1건")).toBeTruthy();
  expect(screen.getAllByText("실패 1건").length).toBeGreaterThan(0);
  expect(screen.getByText("보류 1건")).toBeTruthy();
  expect(screen.getByText("부분 완료 1건")).toBeTruthy();
  // 부분 완료(AI 심층 추출만 빠짐)는 오류 목록에 섞지 않는다. 실패·보류만 올린다.
  const problems = await screen.findByRole("list", { name: "실패·보류 작업" });
  expect(within(problems).getByText("깨진 PDF")).toBeTruthy();
  expect(within(problems).getByText("스캔본.pdf")).toBeTruthy();
  expect(within(problems).queryByText("LLM 없이 처리된 문서")).toBeNull();
  expect(within(problems).getByText(/OCR 을 지원하지 않아/)).toBeTruthy();
  expect(h.docs).toHaveBeenCalledWith({ domain: undefined, limit: 6 });
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

it("정본 카드의 이웃 개념을 누르면 그 개념으로 좁혀 다시 검색하고, 후보 이웃과 충돌 배지를 표시한다", async () => {
  h.search.mockResolvedValue(searchResult({
    matched_entities: [{
      ...searchResult().matched_entities![0],
      neighbors: [
        { entity_id: "e-rs", name: "ReplicaSet", predicate: "manages", direction: "out" },
        { entity_id: "e-pod", name: "Pod", predicate: "part_of", direction: "in", candidate: true },
      ],
    }],
  }));
  mount("/knowledge-library?q=%EB%94%94");
  const card = await screen.findByRole("article", { name: "개념 Deployment" });
  expect(within(card).getByText(/\(후보\)/)).toBeTruthy();
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
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
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
  expect(await scope.findByText(/접수했어요\. .*처리 대기 1건/)).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "처리 현황 보기" }));
  expect(await screen.findByRole("dialog", { name: "자동 처리 현황" })).toBeTruthy();
  await waitFor(() => expect(h.jobs).toHaveBeenCalled());
});

it("자료 추가: 입력이 없으면 막고, 글만 있으면 제목 없이도 보낸다(서버가 본문 첫 줄로 제목을 만든다)", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const scope = within(await screen.findByRole("dialog", { name: "자료 추가" }));
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("하나는 넣어 주세요");
  expect(h.ingest).not.toHaveBeenCalled();
  fireEvent.change(scope.getByLabelText("직접 쓴 글"), { target: { value: "본문" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.ingest).toHaveBeenCalledTimes(1));
  expect(h.ingest.mock.calls[0][0]).toMatchObject({ files: [], urls: [], text: "본문", title: "" });
});

it("자료 추가: 한 번에 20건을 넘기거나 100MiB 를 넘는 파일은 보내기 전에 막는다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  const scope = within(dialog);
  const urls = Array.from({ length: 21 }, (_, i) => "https://example.test/" + i).join("\n");
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: urls } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("20건까지만");
  expect(h.ingest).not.toHaveBeenCalled();
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: "" } });
  const huge = new File(["x"], "huge.pdf", { type: "application/pdf" });
  Object.defineProperty(huge, "size", { value: 101 * 1024 * 1024 });
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [huge] } });
  expect(scope.getByText("100MiB 초과")).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("파일이 너무 커요");
  expect(h.ingest).not.toHaveBeenCalled();
});

it("자료 추가: 접수 결과는 등록·중복·보류·실패를 구분하고, 보류·실패를 성공처럼 보이지 않으며, 실패한 입력만 남긴다", async () => {
  h.ingest.mockResolvedValue(ingestMixed);
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  const scope = within(dialog);
  const okFile = new File(["# a"], "a.md", { type: "text/markdown" });
  const sameFile = new File(["# s"], "same.md", { type: "text/markdown" });
  const hwp = new File(["x"], "legacy.hwp");
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [okFile, sameFile, hwp] } });
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: "http://127.0.0.1:9/none" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  const list = await scope.findByRole("list", { name: "접수 결과" });
  expect(scope.getByText(/처리 대기 1건 · 이미 있음 1건 · 보류 1건 · 실패 1건/)).toBeTruthy();
  const row = (name: string) => within(within(list).getByText(name).closest("li") as HTMLElement);
  expect(row("a.md").getByText("처리 대기")).toBeTruthy();
  expect(row("same.md").getByText("이미 있음")).toBeTruthy();
  expect(row("legacy.hwp").getByText("보류")).toBeTruthy();
  expect(row("legacy.hwp").getByText(/원본만 보관하고 지식으로 만들지 않았어요/)).toBeTruthy();
  expect(row("legacy.hwp").queryByText("처리 대기")).toBeNull();
  expect(row("http://127.0.0.1:9/none").getByText("실패")).toBeTruthy();
  expect(row("http://127.0.0.1:9/none").getByText(/공개 웹 주소만 가능해요/)).toBeTruthy();
  // 실패 항목은 문서가 없어 열 수 없다. id 가 null 이어도 화면이 깨지지 않는다.
  expect(row("http://127.0.0.1:9/none").queryByRole("button", { name: "열기" })).toBeNull();
  expect(row("legacy.hwp").getByRole("button", { name: "열기" })).toBeTruthy();
  // 실패한 주소만 입력에 남고, 성공·보류·중복으로 접수된 파일은 입력에서 빠진다.
  expect((scope.getByLabelText("웹 주소 (한 줄에 하나)") as HTMLTextAreaElement).value).toBe("http://127.0.0.1:9/none");
  expect(scope.queryByRole("list", { name: "선택한 파일" })).toBeNull();
  expect(scope.getByText(/실패한 항목은 입력에 남겨 뒀어요/)).toBeTruthy();
});

it("자료 추가: 등록된 것이 하나도 없으면 접수했다고 말하지 않는다", async () => {
  h.ingest.mockResolvedValue({ batch_id: "b2", items: [ingestMixed.items[2], ingestMixed.items[3]] });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  const scope = within(dialog);
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "legacy.hwp")] } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect(await scope.findByText(/새로 처리 대기에 올라간 항목이 없어요/)).toBeTruthy();
  expect(scope.queryByText(/^접수했어요/)).toBeNull();
});

it("자료 추가: 서버가 v3 ingest 를 모르면 미지원을 알리고, 글만 있을 때만 기존 저장 방식을 권한다", async () => {
  h.ingest.mockRejectedValue(notFound());
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const scope = within(await screen.findByRole("dialog", { name: "자료 추가" }));
  fireEvent.change(scope.getByLabelText("직접 쓴 글"), { target: { value: "본문" } });
  fireEvent.change(scope.getByLabelText(/^제목/), { target: { value: "메모" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("지원하지 않아요");
  fireEvent.click(scope.getByRole("button", { name: "기존 방식으로 글 저장" }));
  await waitFor(() => expect(h.register).toHaveBeenCalledWith({ title: "메모", text: "본문" }));
  expect(await scope.findByText(/자동 처리를 하지 않아 문서로만 저장돼요/)).toBeTruthy();
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
  fireEvent.click(await screen.findByRole("button", { name: /^처리 현황 열기: 진행 1건/ }));
  const dialog = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  const jobs = await within(dialog).findByRole("list", { name: "처리 작업" });
  const item = (title: string) => within(within(jobs).getByText(title).closest("li") as HTMLElement);
  expect(item("방금 올린 PDF").getByText("청킹 중")).toBeTruthy();
  expect(within(dialog).getByText(/3초마다 새로 읽어요/)).toBeTruthy();
  const failed = item("깨진 PDF");
  expect(failed.getByRole("alert").textContent).toContain("지식 추출 단계에서 실패했어요");
  fireEvent.click(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }));
  await waitFor(() => expect(h.retry).toHaveBeenCalledWith("j-fail", "extracting"));
  // 재시도 결과는 카드 밖(드로어 위쪽)에도 남는다. 필터된 목록에서는 재시도한 작업이 곧 목록에서 빠지기 때문이다.
  expect(await within(dialog).findByText(/깨진 PDF: 지식 추출 단계부터 다시 대기열에 넣었어요/)).toBeTruthy();
  h.retry.mockResolvedValueOnce(retried(jobFailed, null));
  fireEvent.click(failed.getByRole("button", { name: "처음부터 다시" }));
  await waitFor(() => expect(h.retry).toHaveBeenLastCalledWith("j-fail", null));
  const held = item("스캔본.pdf");
  expect(held.getByText(/OCR 을 지원하지 않아/)).toBeTruthy();
  expect(held.getByText(/재시도를 막아 뒀어요/)).toBeTruthy();
  expect(held.queryByRole("button", { name: /재시도/ })).toBeNull();
  // 영구 사유가 아닌 보류는 재시도할 수 있다.
  const retriable = item("구조 갱신이 필요한 수집 문서");
  expect(retriable.getByText(/제목 구조를 살리려면 새 버전으로/)).toBeTruthy();
  expect(retriable.getByRole("button", { name: "파싱 단계부터 재시도" })).toBeTruthy();
  const degraded = item("LLM 없이 처리된 문서");
  // 실서버는 부분 완료 단계에 l2_disabled 같은 코드를 그대로 담는다. 코드가 아니라 문장으로 보여 준다.
  expect(degraded.getAllByText(/AI 심층 추출이 꺼져 있어/).length).toBeGreaterThan(0);
  expect(degraded.queryByText("l2_disabled")).toBeNull();
  expect(degraded.getByText(/패시지 검색은 바로 쓸 수 있고/)).toBeTruthy();
  fireEvent.click(degraded.getByRole("button", { name: "심층 추출만 다시" }));
  await waitFor(() => expect(h.retry).toHaveBeenLastCalledWith("j-deg", "extracting"));
});

it("처리 현황: 상태 필터는 서버에 보내고, 총 건수와 더 보기를 쓴다", async () => {
  h.jobs.mockImplementation((p: { status?: string; offset?: number }) => Promise.resolve(p.offset ? jobList([jobDegraded], 31) : { ...jobList([jobFailed], 31), limit: 30 }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /^처리 현황 열기: 진행 1건/ }));
  const dialog = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  await within(dialog).findByText("31건 중 1건");
  fireEvent.click(within(dialog).getByRole("button", { name: "실패" }));
  await waitFor(() => expect(h.jobs).toHaveBeenLastCalledWith({ status: "failed", limit: 30, offset: 0 }));
  fireEvent.click(within(dialog).getByRole("button", { name: "주의 필요" }));
  await waitFor(() => expect(h.jobs).toHaveBeenLastCalledWith({ status: "attention", limit: 30, offset: 0 }));
  fireEvent.click(await within(dialog).findByRole("button", { name: "작업 더 보기" }));
  await waitFor(() => expect(h.jobs).toHaveBeenLastCalledWith({ status: "attention", limit: 30, offset: 30 }));
});

it("처리 현황: 재시도가 실패하면 그 작업 안에 오류를 보여 준다", async () => {
  // 실서버: 실행 중인 작업은 409 job_running. 코드가 아니라 문장으로 보여 준다.
  h.retry.mockRejectedValueOnce(new ApiError(409, { code: "conflict", message: "job_running" }));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /^처리 현황 열기: 진행 1건/ }));
  const drawer = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  const failed = within((await within(drawer).findByText("깨진 PDF")).closest("li") as HTMLElement);
  fireEvent.click(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }));
  await waitFor(() => expect(failed.getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("지금 처리 중인 작업이에요"));
  // 오류가 나도 다시 누를 수 있다.
  expect(failed.getByRole("button", { name: "지식 추출 단계부터 재시도" }).hasAttribute("disabled")).toBe(false);
});

it("처리 현황: 이 서버에 jobs 가 없으면 빈 목록이 아니라 미지원으로 보여 준다", async () => {
  h.jobs.mockRejectedValue(notFound());
  mount();
  fireEvent.click((await screen.findAllByRole("button", { name: /^처리 현황 열기/ }))[0]);
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

  fireEvent.click(screen.getByRole("button", { name: "개념·관계·주장" }));
  expect(where()).toContain("ds=knowledge");
  // 관계(확정·후보)와 근거 인용, 주장 근거가 각각 원문 위치로 이어진다.
  const relations = await screen.findByRole("list", { name: "문서의 관계" });
  expect(within(relations).getByText("확정")).toBeTruthy();
  expect(within(relations).getByText("후보 · 확정 전")).toBeTruthy();
  expect(within(relations).getByText("Deployment 는 ReplicaSet 을 관리한다.")).toBeTruthy();
  fireEvent.click(within(relations).getByRole("button", { name: "ReplicaSet" }));
  expect(where()).toContain("ent=e-rs");
  expect(where()).toContain("view=graph");
});

it("문서 상세: 주장 근거 원문과 충돌, 처리 이력까지 이어진다", async () => {
  mount("/knowledge-library?view=docs&doc=d1&ds=knowledge");
  const claims = await screen.findByRole("list", { name: "추출된 주장" });
  fireEvent.click(within(claims).getByRole("button", { name: "근거 원문 보기" }));
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "열린 충돌 1건 비교하러 가기" }));
  expect(where()).toContain("view=conflicts");
  cleanup();
  mount("/knowledge-library?view=docs&doc=d1&ds=history");
  const history = await screen.findByRole("list", { name: "처리 이력" });
  expect(within(history).getByText("부분 완료")).toBeTruthy();
  expect(within(history).getByText(/부분 완료 사유: AI 심층 추출이 꺼져 있어/)).toBeTruthy();
  expect(within(history).getByText("완료")).toBeTruthy();
});

it("문서 상세: 패시지 위치 배지와 목차, 이전 버전 선택과 안내", async () => {
  mount("/knowledge-library?view=docs&doc=d1&ds=passages");
  const passages = await screen.findByRole("list", { name: "패시지" });
  expect(within(passages).getByText("p.3")).toBeTruthy();
  expect(within(passages).getAllByRole("navigation", { name: "문서 안 위치" }).length).toBe(2);
  expect(screen.getByText("목차 2개 절")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "버전·처리 이력" }));
  h.doc.mockResolvedValue({ ...detail, selected_revision_id: "r1" });
  fireEvent.click(await screen.findByRole("button", { name: "이 버전 보기" }));
  await waitFor(() => expect(h.doc).toHaveBeenLastCalledWith("d1", expect.objectContaining({ revision_id: "r1" })));
  expect(where()).toContain("rev=r1");
  expect(await screen.findByText(/이전 버전이에요/)).toBeTruthy();
});

it("문서 상세: 서버가 요약·개념·주장을 안 주면 없다고 말하고, 처리 기록은 jobs 에서 찾는다", async () => {
  const { summary: _s, entities: _e, assertions: _a, conflicts: _c, pipeline: _p, relations: _r, history: _h, ...bare } = detail;
  void [_s, _e, _a, _c, _p, _r, _h];
  h.doc.mockResolvedValue(bare);
  h.jobs.mockResolvedValue(jobList([jobRunning]));
  mount("/knowledge-library?view=docs&doc=d1");
  expect(await screen.findByText(/문서 요약을 아직 주지 않아요/)).toBeTruthy();
  await waitFor(() => expect(h.jobs).toHaveBeenCalledWith({ document_id: "d1", limit: 1 }));
  expect(await screen.findByText("청킹 중")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "개념·관계·주장" }));
  expect(screen.getByText(/개념 목록을 아직 주지 않아요/)).toBeTruthy();
  expect(screen.getByText(/관계 목록을 아직 주지 않아요/)).toBeTruthy();
  expect(screen.getByText(/주장 목록을 아직 주지 않아요/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "버전·처리 이력" }));
  expect(screen.getByText(/처리 이력을 아직 주지 않아요/)).toBeTruthy();
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
