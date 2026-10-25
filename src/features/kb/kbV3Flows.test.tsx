// 실서버 계약 대조 뒤에 추가한 화면 규칙: 충돌 해결 결과 표시, 후보 관계, 이웃 페이지, 관계 근거, 보류 문서. API 는 목업(kbFixtures)이다.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({ summary: vi.fn(), docs: vi.fn(), doc: vi.fn(), graph: vi.fn(), entity: vi.fn(), alias: vi.fn(), evidence: vi.fn(), conflicts: vi.fn(), jobs: vi.fn() }));
vi.mock("../../api/kb", async (orig) => ({
  ...(await orig<typeof import("../../api/kb")>()),
  kbSummaryV3: (...a: unknown[]) => h.summary(...a),
  kbDocumentsV3: (...a: unknown[]) => h.docs(...a),
  kbDocumentV3: (...a: unknown[]) => h.doc(...a),
  kbGraph: (...a: unknown[]) => h.graph(...a),
  kbEntity: (...a: unknown[]) => h.entity(...a),
  kbAddAlias: (...a: unknown[]) => h.alias(...a),
  kbEvidenceV3: (...a: unknown[]) => h.evidence(...a),
  kbConflicts: (...a: unknown[]) => h.conflicts(...a),
  kbJobs: (...a: unknown[]) => h.jobs(...a),
}));
import { ApiError } from "../../api/client";
import { KnowledgeLibraryPage } from "../../pages/KnowledgeLibraryPage";
import {
  claimConflict, detail, docList, entity, evidence, expansion, graph, jobHeld, jobList, summaryV3, supersededBothConflict, supersededOneSideConflict, userBothValidConflict,
  userKeptSeparateEntity,
} from "./kbFixtures";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
const where = () => screen.getByTestId("where").textContent ?? "";
function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(path: string) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><KnowledgeLibraryPage /><Where /></MemoryRouter>
  </QueryClientProvider>);
}
const narrow = (on: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("max-width: 767px"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));

beforeEach(() => {
  h.summary.mockResolvedValue(summaryV3);
  h.docs.mockResolvedValue(docList());
  h.doc.mockResolvedValue(detail);
  h.graph.mockImplementation((q: { center_entity_id?: string }) => Promise.resolve(q.center_entity_id ? { ...expansion, center_entity_id: q.center_entity_id } : graph));
  h.entity.mockResolvedValue(entity);
  h.evidence.mockResolvedValue(evidence);
  h.conflicts.mockResolvedValue({ items: [], total: 0 });
  h.jobs.mockResolvedValue(jobList([]));
  h.alias.mockResolvedValue({ alias: { alias: "배포", lang: "ko", source: "user_verified" }, relinked_count: 0, created: true });
  narrow(false);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("해결된 충돌: 시스템이 새 버전으로 닫은 kept_separate 는 '양쪽 모두 옳음'이 아니고, 사람이 고른 둘 다 유효와 구분된다", async () => {
  h.conflicts.mockResolvedValue({ items: [supersededBothConflict, supersededOneSideConflict, userBothValidConflict, userKeptSeparateEntity, claimConflict], total: 5 });
  mount("/knowledge-library?view=conflicts&cs=all");
  await waitFor(() => expect(h.conflicts).toHaveBeenCalledWith({ status: "all", kind: undefined, limit: 30, offset: 0 }));
  const both = within(await screen.findByLabelText("Valkey 기본 포트 값이 다른 주장", { selector: "li[data-status='kept_separate']" }));
  expect(both.getByText("새 버전이 양쪽 주장을 대체해 종결")).toBeTruthy();
  expect(both.getByText("자동 종결")).toBeTruthy();
  expect(both.getByText(/양쪽이 옳다는 뜻도 아니에요/)).toBeTruthy();
  expect(both.queryByText(/둘 다 유효/)).toBeNull();
  // 시스템 종결 메모(영문 코드)는 사람 메모처럼 보이지 않게 숨긴다.
  expect(both.queryByText(/both_parties_superseded/)).toBeNull();
  const oneSide = within(screen.getByLabelText("Valkey 기본 포트 값이 다른 주장", { selector: "li[data-status='resolved_b']" }));
  expect(oneSide.getByText("새 버전이 A를 대체해 종결")).toBeTruthy();
  const bothValid = within(screen.getByLabelText("Valkey 기본 포트 값이 다른 주장", { selector: "li[data-status='resolved_both_valid']" }));
  expect(bothValid.getByText(/둘 다 유효\(적용 조건 차이\)/)).toBeTruthy();
  expect(bothValid.getByText("메모: 버전별로 다름")).toBeTruthy();
  expect(bothValid.queryByText("자동 종결")).toBeNull();
  const entityDone = within(screen.getByLabelText("Service 같은 개념인지 불확실"));
  expect(entityDone.getByText("서로 다른 개념으로 분리 확정")).toBeTruthy();
  // 해결된 충돌에는 해결 버튼이 없고, 열린 충돌에만 있다.
  expect(both.queryByRole("button", { name: /채택/ })).toBeNull();
  expect(screen.getAllByRole("button", { name: "A를 정본으로 채택" }).length).toBe(1);
});

it("충돌 탭: 열린 것만/해결된 것 포함 전환이 서버 status 와 주소에 반영되고, 더 보기는 offset 으로 이어진다", async () => {
  h.conflicts.mockImplementation((p: { offset?: number }) => Promise.resolve(p.offset ? { items: [userBothValidConflict], total: 31, limit: 30, offset: 30 } : { items: [claimConflict], total: 31, limit: 30, offset: 0 }));
  mount("/knowledge-library?view=conflicts");
  await screen.findByText("31건 중 1건");
  fireEvent.click(screen.getByRole("button", { name: "해결된 것 포함" }));
  expect(where()).toContain("cs=all");
  await waitFor(() => expect(h.conflicts).toHaveBeenCalledWith({ status: "all", kind: undefined, limit: 30, offset: 0 }));
  fireEvent.click(await screen.findByRole("button", { name: "충돌 더 보기" }));
  await waitFor(() => expect(h.conflicts).toHaveBeenLastCalledWith({ status: "all", kind: undefined, limit: 30, offset: 30 }));
  expect(await screen.findByText("31건 중 2건")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "열린 것만" }));
  expect(where()).not.toContain("cs=all");
});

it("문서 상세의 충돌: 해결된 것은 해결 상태로 보이고, 열린 것이 없으면 해결 이력으로 보낸다", async () => {
  h.doc.mockResolvedValue({ ...detail, conflicts: [{ id: "c3", kind: "value_contradiction", status: "kept_separate", entity_name: "Valkey" }] });
  mount("/knowledge-library?view=docs&doc=d1&ds=knowledge");
  const list = await screen.findByRole("list", { name: "문서와 관련된 충돌" });
  expect(within(list).getByText("어느 쪽도 채택하지 않고 종결")).toBeTruthy();
  expect(within(list).getByText(/양쪽이 옳다는 뜻은 아니에요/)).toBeTruthy();
  expect(within(list).queryByText(/둘 다 유효/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "해결 이력 보러 가기" }));
  expect(where()).toContain("view=conflicts");
  expect(where()).toContain("cs=all");
});

it("후보 관계 보기: 켜면 서버에 include_candidates 를 보내고 후보 표시가 보인다", async () => {
  narrow(true);
  mount("/knowledge-library?view=graph&ent=e-rs&cand=1");
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith(expect.objectContaining({ q: "", include_candidates: true })));
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith(expect.objectContaining({ center_entity_id: "e-rs", include_candidates: true })));
  expect((screen.getByLabelText(/후보 관계도 보기/) as HTMLInputElement).checked).toBe(true);
  expect(h.entity).toHaveBeenCalledWith("e-rs", { include_candidates: true });
  const tree = await screen.findByRole("region", { name: "선택한 개념의 이웃" });
  await waitFor(() => expect(within(tree).getByText("후보")).toBeTruthy());
  fireEvent.click(screen.getByLabelText(/후보 관계도 보기/));
  expect(where()).not.toContain("cand=1");
});

it("이웃이 많으면 일부만 불러왔다고 알리고 더 불러오기는 offset 으로 이어 받는다", async () => {
  h.graph.mockImplementation((q: { center_entity_id?: string; offset?: number }) => {
    if (!q.center_entity_id) return Promise.resolve(graph);
    return Promise.resolve(q.offset
      ? { ...expansion, center_entity_id: q.center_entity_id, has_more: false, total_neighbors: 45, offset: 30, limit: 30 }
      : { ...expansion, center_entity_id: q.center_entity_id, has_more: true, total_neighbors: 45, offset: 0, limit: 30 });
  });
  mount("/knowledge-library?view=graph&ent=e-rs");
  expect(await screen.findByText(/ReplicaSet의 이웃 45개 중 일부만 불러왔어요/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "이웃 더 불러오기" }));
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith(expect.objectContaining({ center_entity_id: "e-rs", offset: 30 })));
  await waitFor(() => expect(screen.queryByRole("button", { name: "이웃 더 불러오기" })).toBeNull());
});

it("개념 상세: 관계마다 확정·후보와 근거 인용을 보여 주고, 원문 위치와 문서로 이동한다", async () => {
  h.entity.mockResolvedValue({
    ...entity,
    relations: [
      { id: "rel1", predicate: "manages", direction: "out", entity_id: "e-rs", name: "ReplicaSet", status: "active", candidate: false, evidence_count: 1 },
      { id: "rel2", predicate: "part_of", direction: "in", entity_id: "e-pod", name: "Pod", status: "candidate", candidate: true, evidence_count: 2 },
      { id: "rel3", predicate: "uses", direction: "out", entity_id: "e-x", name: "X", status: "active", candidate: false, evidence_count: 1 },
    ],
  });
  h.graph.mockImplementation((q: { center_entity_id?: string; limit?: number }) => Promise.resolve(q.center_entity_id === "e-dep" && q.limit === 100
    ? {
      ...expansion, center_entity_id: "e-dep",
      edges: [
        { id: "rel1", source: "e-dep", target: "e-rs", predicate: "manages", evidence_count: 1, evidence: [{ passage_id: "p1", quote: "디플로이먼트는 레플리카셋을 관리한다", document_id: "d1", document_title: "Kubernetes Deployment 가이드", rev_no: 2 }] },
        { id: "rel2", source: "e-pod", target: "e-dep", predicate: "part_of", candidate: true, evidence_count: 2, evidence: [{ passage_id: "p2", quote: "Pod 는 Deployment 의 일부", document_id: "d1", document_title: "Kubernetes Deployment 가이드" }] },
      ],
    }
    : q.center_entity_id ? { ...expansion, center_entity_id: q.center_entity_id } : graph));
  mount("/knowledge-library?view=graph&ent=e-dep&cand=1");
  const panel = within(await screen.findByRole("complementary", { name: "개념 상세" }));
  const rels = within(await panel.findByRole("list", { name: "관계 목록" }));
  expect(await rels.findByText("디플로이먼트는 레플리카셋을 관리한다")).toBeTruthy();
  expect(rels.getAllByText("확정").length).toBe(2); // rel1, rel3 (후보는 "후보 · 확정 전")
  expect(rels.getByText("후보 · 확정 전")).toBeTruthy();
  expect(rels.getByText("Pod 는 Deployment 의 일부")).toBeTruthy();
  // 근거 개수는 있지만 이 화면에서 인용을 못 읽은 관계는 그렇게 말한다.
  expect(rels.getByText(/대표 근거를 이 화면에서 읽지 못했어요/)).toBeTruthy();
  fireEvent.click(rels.getAllByRole("button", { name: "원문 위치 보기" })[0]);
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  expect(h.evidence).toHaveBeenCalledWith("p1");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(rels.getAllByRole("button", { name: "문서 열기" })[0]);
  expect(where()).toContain("view=docs");
  expect(where()).toContain("doc=d1");
});

it("개념 상세: 이미 있는 별칭, 다른 개념의 표기, 너무 짧은 별칭을 서버 응답대로 알린다", async () => {
  mount("/knowledge-library?view=graph&ent=e-dep");
  const scope = within(await screen.findByRole("complementary", { name: "개념 상세" }));
  const add = async (value: string) => {
    fireEvent.change(await scope.findByLabelText("별칭 추가"), { target: { value } });
    fireEvent.click(scope.getByRole("button", { name: "추가" }));
  };
  h.alias.mockResolvedValueOnce({ alias: { alias: "배포", lang: "ko", source: "user_verified" }, relinked_count: 0, created: false });
  await add("배포");
  expect(await scope.findByText("이미 있는 별칭이에요.")).toBeTruthy();
  h.alias.mockRejectedValueOnce(new ApiError(409, { code: "conflict", message: "kb_alias_belongs_to_other_entity" }));
  await add("Pod");
  expect((await scope.findByRole("alert")).textContent).toContain("다른 개념이 이미 이 표기를 쓰고 있어요");
  h.alias.mockRejectedValueOnce(new ApiError(422, { code: "error", message: "alias_too_short" }));
  await add("a");
  await waitFor(() => expect(scope.getByRole("alert").textContent).toContain("두 글자 이상"));
  h.alias.mockResolvedValueOnce({ alias: { alias: "새 이름", lang: "ko", source: "user_verified" }, relinked_count: 0, created: true });
  await add("새 이름");
  expect(await scope.findByText(/새로 연결된 패시지는 없어요/)).toBeTruthy();
});

it("개념 상세: 서버가 정본이 없다고 하면(null) 없다고 말하고, 요약이 비어도 핵심 사실은 보여 준다", async () => {
  h.entity.mockResolvedValue({ ...entity, canonical: null });
  mount("/knowledge-library?view=graph&ent=e-dep");
  expect(await screen.findByText(/아직 근거로 뒷받침된 정본 요약이 없어요/)).toBeTruthy();
  cleanup();
  h.entity.mockResolvedValue({ ...entity, canonical: { summary: "", key_facts: ["definition: 파드를 관리한다."] } });
  mount("/knowledge-library?view=graph&ent=e-dep");
  expect(await screen.findByText("definition: 파드를 관리한다.")).toBeTruthy();
});

it("보류 문서: 보류 안내가 먼저 보이고 성공·요약·패시지가 있는 것처럼 보이지 않는다", async () => {
  h.doc.mockResolvedValue({
    ...detail, pipeline_status: "held", summary: null, summary_source: null, entities: [], assertions: [], relations: [], conflicts: [], pipeline: jobHeld,
    passages: { items: [], total: 0, limit: 50, offset: 0 }, history: [],
  });
  mount("/knowledge-library?view=docs&doc=d1");
  expect((await screen.findByText(/이 문서는 보류 상태예요/)).textContent).toContain("지식으로 만들지 않아서");
  expect(screen.getByText("보류된 문서라 요약이 없어요.")).toBeTruthy();
  expect(screen.getAllByText(/글자 층이 없는 스캔 문서예요/).length).toBeGreaterThan(0);
  expect(screen.queryByText("완료", { selector: ".tk-badge" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "원문 패시지" }));
  expect(screen.getByText("보류된 문서라 만들어진 패시지가 없어요.")).toBeTruthy();
});

it("요약은 AI 요약이 아니라고 밝히고 출처(정본 정의·본문 발췌)를 말한다", async () => {
  mount("/knowledge-library?view=docs&doc=d1");
  expect(await screen.findByText(/AI 가 쓴 요약이 아니에요\. 정본 정의을 그대로 보여 줘요/)).toBeTruthy();
  cleanup();
  h.doc.mockResolvedValue({ ...detail, summary_source: "extractive_first_passage" });
  mount("/knowledge-library?view=docs&doc=d1");
  expect(await screen.findByText(/AI 가 쓴 요약이 아니에요\. 본문 앞부분 발췌을 그대로 보여 줘요/)).toBeTruthy();
});
