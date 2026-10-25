import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({
  summary: vi.fn(), docs: vi.fn(), graph: vi.fn(), entity: vi.fn(), alias: vi.fn(), evidence: vi.fn(), conflicts: vi.fn(), resolve: vi.fn(), doc: vi.fn(),
}));
vi.mock("../../api/kb", async (orig) => ({
  ...(await orig<typeof import("../../api/kb")>()),
  kbSummaryV3: (...a: unknown[]) => h.summary(...a),
  kbDocumentsV3: (...a: unknown[]) => h.docs(...a),
  kbGraph: (...a: unknown[]) => h.graph(...a),
  kbEntity: (...a: unknown[]) => h.entity(...a),
  kbAddAlias: (...a: unknown[]) => h.alias(...a),
  kbEvidenceV3: (...a: unknown[]) => h.evidence(...a),
  kbConflicts: (...a: unknown[]) => h.conflicts(...a),
  kbResolveConflict: (...a: unknown[]) => h.resolve(...a),
  kbDocumentV3: (...a: unknown[]) => h.doc(...a),
}));
import { ApiError } from "../../api/client";
import { KnowledgeLibraryPage } from "../../pages/KnowledgeLibraryPage";
import { claimConflict, detail, docList, entity, entityConflict, evidence, expansion, graph, summaryV3 } from "./kbFixtures";

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
  h.entity.mockImplementation((id: string) => Promise.resolve({ ...entity, id, name: id === "e-rs" ? "ReplicaSet" : entity.name }));
  h.alias.mockResolvedValue({ alias: { alias: "배포", lang: "ko" }, relinked_count: 2 });
  h.evidence.mockResolvedValue(evidence);
  h.conflicts.mockResolvedValue({ items: [claimConflict, entityConflict] });
  h.resolve.mockResolvedValue({ status: "resolved_a", canonical: { summary: "Valkey 기본 포트는 6379 다.", key_facts: [] } });
  narrow(false);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const nodeButton = (name: RegExp) => screen.getByRole("button", { name });

it("그래프 탭은 허브 개념만 처음에 그리고, 개념을 누르면 1-hop 이웃을 펼치며 상세를 연다", async () => {
  mount("/knowledge-library?view=graph");
  expect(await screen.findByText(/개념 3개 표시 \(전체 40개 중 허브부터\) · 관계 2개/)).toBeTruthy();
  expect(h.graph).toHaveBeenCalledWith({ q: "", domain: undefined, limit: 30 });
  expect(screen.getByRole("group", { name: /개념 그래프, 개념 3개 관계 2개/ })).toBeTruthy();
  expect(nodeButton(/^Deployment, 기술.*열린 충돌 있음/)).toBeTruthy();
  fireEvent.click(nodeButton(/^ReplicaSet, 기술/));
  expect(where()).toContain("ent=e-rs");
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith({ center_entity_id: "e-rs", hops: 1, limit: 30 }));
  expect(await screen.findByText(/개념 4개 표시.* · 관계 3개/)).toBeTruthy();
  expect(nodeButton(/^HorizontalPodAutoscaler, API/)).toBeTruthy();
  expect(await screen.findByRole("complementary", { name: "개념 상세" })).toBeTruthy();
  expect(h.entity).toHaveBeenCalledWith("e-rs");
  // 이미 펼친 개념을 다시 눌러도 같은 이웃을 또 불러오지 않는다.
  const calls = h.graph.mock.calls.length;
  fireEvent.click(nodeButton(/^ReplicaSet, 기술/));
  await waitFor(() => expect(nodeButton(/^ReplicaSet, 기술/).getAttribute("aria-pressed")).toBe("true"));
  expect(h.graph.mock.calls.length).toBe(calls);
});

it("주소로 들어온 개념(?ent=)도 이웃을 펼쳐 둔다", async () => {
  mount("/knowledge-library?view=graph&ent=e-rs");
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith({ center_entity_id: "e-rs", hops: 1, limit: 30 }));
  expect(await screen.findByText(/개념 4개 표시/)).toBeTruthy();
});

it("이웃을 불러오지 못하면 오류와 다시 시도를 보이고, 다시 시도하면 펼쳐진다", async () => {
  mount("/knowledge-library?view=graph");
  await screen.findByText(/개념 3개 표시/);
  h.graph.mockRejectedValueOnce(new ApiError(500, { code: "internal", message: "서버 오류가 발생했습니다." }));
  fireEvent.click(nodeButton(/^ReplicaSet, 기술/));
  const alert = await screen.findByText(/이웃 개념을 불러오지 못했어요/);
  expect(alert.textContent).toContain("서버 오류");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByText(/개념 4개 표시/)).toBeTruthy();
});

it("좁은 화면에서는 캔버스 대신 개념 카드와 방향별 이웃 카드를 보여 준다", async () => {
  narrow(true);
  mount("/knowledge-library?view=graph");
  const cards = await screen.findByRole("list", { name: "핵심 개념 목록" });
  expect(screen.queryByRole("group", { name: /개념 그래프, 개념/ })).toBeNull();
  expect(screen.queryByRole("group", { name: "보기 방식" })).toBeNull();
  // 문서 수가 많은 개념이 먼저 온다.
  expect(within(cards).getAllByRole("button")[0].textContent).toContain("Pod");
  fireEvent.click(within(cards).getByRole("button", { name: /^ReplicaSet/ }));
  const tree = await screen.findByRole("region", { name: "선택한 개념의 이웃" });
  await waitFor(() => expect(within(tree).getByRole("list", { name: /나가는 관계/ })).toBeTruthy());
  expect(within(within(tree).getByRole("list", { name: /나가는 관계/ })).getByRole("button", { name: "Pod" })).toBeTruthy();
  expect(within(within(tree).getByRole("list", { name: /들어오는 관계/ })).getByRole("button", { name: "Deployment" })).toBeTruthy();
});

it("넓은 화면에서도 목록 보기로 바꿀 수 있고, 개념을 이름으로 찾을 수 있다", async () => {
  mount("/knowledge-library?view=graph");
  await screen.findByText(/개념 3개 표시/);
  fireEvent.click(screen.getByRole("button", { name: "목록" }));
  expect(await screen.findByRole("list", { name: "핵심 개념 목록" })).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "개념 찾기" }), { target: { value: "쿠버" } });
  fireEvent.click(screen.getByRole("button", { name: "찾기" }));
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith({ q: "쿠버", domain: undefined, limit: 30 }));
  expect(await screen.findByText(/“쿠버” 와 관련된 개념만/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "허브 개념으로 돌아가기" }));
  await waitFor(() => expect(h.graph).toHaveBeenLastCalledWith({ q: "", domain: undefined, limit: 30 }));
});

it("그래프가 비었거나 서버가 미지원이면 그렇게 말하고 가짜 그래프를 그리지 않는다", async () => {
  h.graph.mockResolvedValue({ nodes: [], edges: [], center_entity_id: null, total_entities: 0 });
  mount("/knowledge-library?view=graph");
  expect(await screen.findByText("아직 추출된 개념이 없어요.")).toBeTruthy();
  expect(screen.queryByRole("group", { name: /개념 그래프, 개념/ })).toBeNull();
  cleanup();
  h.graph.mockRejectedValue(new ApiError(404, { code: "http_404", message: "Not Found" }));
  mount("/knowledge-library?view=graph");
  expect((await screen.findByText(/아직 이 기능을 지원하지 않아요/)).getAttribute("role")).toBe("status");
});

it("개념 상세: 정본 요약·별칭 추가·지지 주장 원문·관계 이동·문서 열기", async () => {
  mount("/knowledge-library?view=graph&ent=e-dep");
  const panel = await screen.findByRole("complementary", { name: "개념 상세" });
  const scope = within(panel);
  expect(await scope.findByText(/선언적 업데이트/)).toBeTruthy();
  expect(scope.getByText("디플로이먼트 · ko")).toBeTruthy();
  fireEvent.change(scope.getByLabelText("별칭 추가"), { target: { value: " 배포 " } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  await waitFor(() => expect(h.alias).toHaveBeenCalledWith("e-dep", "배포", "ko"));
  expect(await scope.findByText(/문서 2건을 다시 연결했어요/)).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "원문 위치 보기" }));
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  fireEvent.click(scope.getByRole("button", { name: "ReplicaSet" }));
  expect(where()).toContain("ent=e-rs");
  await waitFor(() => expect(h.graph).toHaveBeenCalledWith({ center_entity_id: "e-rs", hops: 1, limit: 30 }));
  fireEvent.click(scope.getByRole("button", { name: "Kubernetes Deployment 가이드" }));
  expect(where()).toContain("view=docs");
  expect(where()).toContain("doc=d1");
});

it("개념 상세: 별칭 추가가 실패하면 오류를 보이고 입력을 지우지 않는다", async () => {
  h.alias.mockRejectedValueOnce(new ApiError(409, { code: "alias_taken", message: "이미 다른 개념의 별칭이에요." }));
  mount("/knowledge-library?view=graph&ent=e-dep");
  const scope = within(await screen.findByRole("complementary", { name: "개념 상세" }));
  fireEvent.change(await scope.findByLabelText("별칭 추가"), { target: { value: "배포" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  expect((await scope.findByRole("alert")).textContent).toContain("이미 다른 개념의 별칭");
  expect((scope.getByLabelText("별칭 추가") as HTMLInputElement).value).toBe("배포");
});

it("충돌 탭: 두 주장을 원문 인용·문서·발행일과 함께 비교하고, 확정 전에 확인 단계를 거쳐 해결한다", async () => {
  mount("/knowledge-library?view=conflicts");
  const item = within(await screen.findByRole("listitem", { name: "Valkey 기본 포트 값이 다른 주장" }));
  const a = within(item.getByRole("region", { name: "주장 A" }));
  const b = within(item.getByRole("region", { name: "주장 B" }));
  expect(a.getByText("기본 포트는 6379")).toBeTruthy();
  expect(a.getByRole("button", { name: "Valkey 2025 가이드" })).toBeTruthy();
  expect(b.getByText("기본 포트는 6380")).toBeTruthy();
  expect(b.getByText(/2026\. 5\. 1\./)).toBeTruthy();
  fireEvent.click(item.getByRole("button", { name: "A를 정본으로 채택" }));
  expect(h.resolve).not.toHaveBeenCalled();
  expect(item.getByText(/A 주장이 정본이 되고/)).toBeTruthy();
  fireEvent.click(item.getByRole("button", { name: "취소" }));
  expect(item.getByRole("button", { name: "B를 정본으로 채택" })).toBeTruthy();
  fireEvent.click(item.getByRole("button", { name: "A를 정본으로 채택" }));
  fireEvent.change(item.getByLabelText("메모 (선택)"), { target: { value: "공식 문서 기준" } });
  h.conflicts.mockResolvedValue({ items: [entityConflict] });
  fireEvent.click(item.getByRole("button", { name: "확정" }));
  await waitFor(() => expect(h.resolve).toHaveBeenCalledWith("c1", "resolved_a", "공식 문서 기준"));
  const done = await screen.findByRole("list", { name: "방금 해결한 충돌" });
  expect(within(done).getByText(/A를 정본으로 채택 처리를 마쳤어요/)).toBeTruthy();
  expect(within(done).getByText(/갱신된 정본 요약: Valkey 기본 포트는 6379 다\./)).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("listitem", { name: "Valkey 기본 포트 값이 다른 주장" })).toBeNull());
});

it("충돌 탭: 모호한 개념은 병합·분리 확정 중 하나를 확인 뒤 보낸다", async () => {
  mount("/knowledge-library?view=conflicts");
  const item = within(await screen.findByRole("listitem", { name: "Service 같은 개념인지 불확실" }));
  expect(item.getByRole("region", { name: "개념 A" }).textContent).toContain("Service (Kubernetes)");
  fireEvent.click(item.getByRole("button", { name: "하나의 개념으로 병합" }));
  expect(item.getByText(/되돌리기 어려울 수 있어요/)).toBeTruthy();
  fireEvent.click(item.getByRole("button", { name: "확정" }));
  await waitFor(() => expect(h.resolve).toHaveBeenCalledWith("c2", "merged", ""));
});

it("충돌 해결이 실패하면 확인 창을 유지한 채 오류를 보이고 다시 시도할 수 있다", async () => {
  h.resolve.mockRejectedValueOnce(new ApiError(409, { code: "kb_conflict_stale", message: "이미 다른 곳에서 해결된 충돌이에요." }));
  mount("/knowledge-library?view=conflicts");
  const item = within(await screen.findByRole("listitem", { name: "Valkey 기본 포트 값이 다른 주장" }));
  fireEvent.click(item.getByRole("button", { name: "B를 정본으로 채택" }));
  fireEvent.click(item.getByRole("button", { name: "확정" }));
  expect((await item.findByRole("alert")).textContent).toContain("이미 다른 곳에서 해결된");
  expect(item.getByRole("group", { name: "해결 확인" })).toBeTruthy();
  fireEvent.click(item.getByRole("button", { name: "확정" }));
  await waitFor(() => expect(h.resolve).toHaveBeenCalledTimes(2));
});

it("충돌 종류 필터는 서버에 보내고, 개념별 보기는 그 개념의 충돌만 남긴다", async () => {
  mount("/knowledge-library?view=conflicts");
  await screen.findByRole("listitem", { name: /Valkey/ });
  fireEvent.click(screen.getByRole("button", { name: "모호한 개념" }));
  await waitFor(() => expect(h.conflicts).toHaveBeenLastCalledWith({ status: "open", kind: "ambiguous_entity" }));
  cleanup();
  mount("/knowledge-library?view=conflicts&ent=e-valkey");
  expect(await screen.findByRole("listitem", { name: /Valkey/ })).toBeTruthy();
  expect(screen.queryByRole("listitem", { name: /Service/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
  expect(await screen.findByRole("listitem", { name: /Service/ })).toBeTruthy();
});

it("충돌 탭: 비교할 두 쪽이 없는 항목은 해결 버튼 없이 오류로 알리고, 비었거나 미지원이면 그대로 말한다", async () => {
  h.conflicts.mockResolvedValue({ items: [{ ...claimConflict, claim_b: undefined }] });
  mount("/knowledge-library?view=conflicts");
  expect((await screen.findByRole("alert")).textContent).toContain("비교할 두 쪽");
  expect(screen.queryByRole("button", { name: "A를 정본으로 채택" })).toBeNull();
  cleanup();
  h.conflicts.mockResolvedValue({ items: [] });
  mount("/knowledge-library?view=conflicts");
  expect(await screen.findByText("열린 충돌이 없어요.")).toBeTruthy();
  cleanup();
  h.conflicts.mockRejectedValue(new ApiError(404, { code: "http_404", message: "Not Found" }));
  mount("/knowledge-library?view=conflicts");
  expect((await screen.findByText(/아직 이 기능을 지원하지 않아요/)).getAttribute("role")).toBe("status");
});

it("품질 진단은 서버가 준 값만 보여 주고 나머지는 미지원으로 표시한다", async () => {
  mount("/knowledge-library?view=conflicts");
  const quality = within(await screen.findByRole("region", { name: "품질 진단" }));
  expect(await quality.findByText(/80% \(80 \/ 100\)/)).toBeTruthy();
  expect(quality.getAllByText("서버 미지원").length).toBe(3);
  cleanup();
  h.summary.mockResolvedValue({ counts: summaryV3.counts, last_collected_at: null });
  mount("/knowledge-library?view=conflicts");
  const bare = within(await screen.findByRole("region", { name: "품질 진단" }));
  await waitFor(() => expect(bare.getAllByText("서버 미지원").length).toBe(4));
});
