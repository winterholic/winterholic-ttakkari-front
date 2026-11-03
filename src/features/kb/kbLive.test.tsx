// 실제 백엔드(back-kb-v3-api 27ea2f4, scripts/kb-live/serve_backend.py)가 준 응답을 그대로 기록한 liveFixtures/recorded.json 으로
// 진짜 kb.ts 클라이언트(계약 검사 포함)와 화면을 돌린다. 목업이 아니라 실제 응답의 모양·값이다. 다시 기록하는 법은 scripts/kb-live/README.md.
// 기록은 실서버가 만든 문서·개념·충돌을 담고 있어서, 값은 하드코딩하지 않고 기록 안에서 읽어 비교한다.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import recorded from "./liveFixtures/recorded.json";
import {
  KbContractError, isKbUnsupported, kbConflicts, kbDocumentV3, kbDocumentsV3, kbEntity, kbEvidenceV3, kbGraph, kbIngest, kbJob, kbJobs, kbRetryJob, kbSearchV3, kbSummaryV3,
} from "../../api/kb";
import { ApiError } from "../../api/client";
import { KnowledgeLibraryPage } from "../../pages/KnowledgeLibraryPage";

interface Rec { method: string; path: string; status: number; body: unknown }
const R = recorded as unknown as Record<string, Rec>;
// 기록 모양은 느슨하게 읽는다(테스트가 기록 필드 이름을 검증하는 것이 아니라 화면이 그 응답을 받아들이는지 보는 것이다).
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const body = (k: string): Any => R[k].body;

const unhandled: string[] = [];
function respond(status: number, data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}
const rec = (k: string) => respond(R[k].status, R[k].body);
const emptyList = (limit = 30) => respond(200, { items: [], total: 0, limit, offset: 0 });

/** 기록된 응답을 요청 경로·쿼리로 고른다. 기록에 없는 요청은 unhandled 로 모아 테스트가 실패하게 한다. */
function route(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(String(input));
  const p = url.pathname.replace("/api/assistant/kb", "");
  const q = url.searchParams;
  const method = (init?.method ?? "GET").toUpperCase();
  const docIds: Record<string, string> = {
    [body("document_detail").id]: "document_detail", [body("document_detail_versions").id]: "document_detail_versions",
    [body("document_detail_held").id]: "document_detail_held", [body("document_detail_html").id]: "document_detail_html",
  };
  if (method === "GET" && p === "/summary") return rec("summary");
  if (method === "GET" && p === "/documents") {
    if (q.get("pipeline_status") === "attention") return rec("documents_attention");
    if (q.get("pipeline_status") === "none") return rec("documents_none");
    if (q.get("domain") && q.get("limit") === "1") return q.get("domain") === "dev-infra" ? rec("documents_domain_devinfra") : emptyList(1);
    return rec("documents");
  }
  const doc = p.match(/^\/documents\/([^/]+)$/);
  if (method === "GET" && doc) return docIds[doc[1]] ? rec(docIds[doc[1]]) : rec("document_missing");
  if (method === "GET" && p === "/jobs") {
    const s = q.get("status");
    if (s === "active") return rec("jobs_active");
    if (s === "attention") return rec("jobs_attention");
    if (s === "held") return rec("jobs_held");
    if (s === "failed") return emptyList();
    return rec("jobs");
  }
  const jobOne = p.match(/^\/jobs\/([^/]+)$/);
  if (method === "GET" && jobOne) return jobOne[1] === body("job_one").id ? rec("job_one") : rec("job_missing");
  if (method === "POST" && /^\/jobs\/[^/]+\/retry$/.test(p)) return rec("job_retry_extracting");
  if (method === "GET" && p === "/search") {
    const mode = q.get("mode");
    if (mode === "lexical") return rec("search_lexical");
    if (mode === "vector") return rec("search_vector");
    return rec(q.get("q") === "Kubernetes" ? "search_hybrid_en" : q.get("q") === "zzqxjk없는말" ? "search_nohit" : "search_hybrid");
  }
  if (method === "GET" && p === "/ontology/graph") {
    if (q.get("center_entity_id")) return rec("graph_neighbors");
    if (q.get("q")) return rec("graph_search");
    return rec(q.get("include_candidates") === "true" ? "graph_hubs_candidates" : "graph_hubs");
  }
  const ent = p.match(/^\/ontology\/entities\/([^/]+)$/);
  if (method === "GET" && ent) return rec(q.get("include_candidates") === "true" ? "entity_detail_candidates" : "entity_detail");
  if (method === "POST" && /\/aliases$/.test(p)) return rec("alias_add");
  if (method === "GET" && p === "/conflicts") return rec(q.get("status") === "all" ? "conflicts_all" : q.get("kind") === "version_divergence" ? "conflicts_kind_version" : "conflicts_open");
  if (method === "GET" && /^\/passages\/[^/]+\/evidence$/.test(p)) return rec("evidence");
  if (method === "POST" && p === "/ingest") return rec("ingest_mixed");
  unhandled.push(method + " " + p + url.search);
  return respond(404, { code: "not_found", message: "Not Found" });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
});
beforeEach(() => {
  unhandled.length = 0;
  vi.stubGlobal("fetch", vi.fn(route));
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

it("기록 메타: 실제 백엔드에서 받은 응답이다", () => {
  expect((recorded as unknown as { __meta: { base: string; note: string } }).__meta.base).toContain("127.0.0.1");
  expect(Object.keys(R).length).toBeGreaterThan(40);
});

it("실제 응답이 모두 클라이언트 계약 검사(KbContractError)를 통과한다", async () => {
  const main = body("document_detail");
  expect((await kbSummaryV3()).counts.entities).toBe(body("summary").counts.entities);
  expect((await kbDocumentsV3()).items.length).toBe(body("documents").items.length);
  expect((await kbDocumentV3(main.id)).passages.items.length).toBeGreaterThan(0);
  expect((await kbDocumentV3(body("document_detail_held").id)).pipeline_status).toBe("held");
  expect((await kbJobs()).total).toBe(body("jobs").total);
  expect((await kbJobs({ status: "attention", limit: 2 })).items.length).toBeGreaterThan(0);
  expect((await kbJob(body("job_one").id)).id).toBe(body("job_one").id);
  for (const mode of ["hybrid", "lexical", "vector"] as const) expect((await kbSearchV3({ q: "디플로이먼트", mode })).items.length).toBeGreaterThan(0);
  expect((await kbGraph({ limit: 12 })).nodes.length).toBeGreaterThan(0);
  expect((await kbGraph({ q: "Deployment" })).nodes.length).toBeGreaterThan(0);
  const center = body("graph_hubs").nodes.find((n: Any) => /deployment/i.test(n.name));
  expect((await kbGraph({ center_entity_id: center.id })).mode).toBe("neighbors");
  expect((await kbEntity(center.id)).aliases.length).toBeGreaterThan(0);
  expect((await kbConflicts()).total).toBe(body("conflicts_open").total);
  expect((await kbConflicts({ status: "all" })).items.length).toBeGreaterThanOrEqual(body("conflicts_open").items.length);
  expect((await kbEvidenceV3(main.passages.items[0].id)).span.hash_verified).toBe(true);
  expect((await kbRetryJob("j", "extracting")).retry.requeued).toBe(true);
  const form = new File(["x"], "same.md");
  const out = await kbIngest({ files: [form], urls: [], text: "" });
  expect(out.items.map((i) => i.status).sort()).toEqual(["duplicate", "failed", "held"]);
  const failed = out.items.find((i) => i.status === "failed")!;
  expect([failed.document_id, failed.revision_id, failed.job_id]).toEqual([null, null, null]);
  expect(unhandled).toEqual([]);
});

it("실서버 오류 모양: 없는 라우트만 미지원이고 앱 오류(404·409·422)는 미지원이 아니다", async () => {
  const err = (k: string) => new ApiError(R[k].status, R[k].body as { code: string; message: string });
  for (const k of ["document_missing", "job_missing", "entity_missing", "graph_missing_entity", "alias_taken", "alias_too_short", "documents_bad_status", "jobs_bad_status", "conflict_resolve_wrong_kind", "ingest_empty", "ingest_too_many"]) {
    expect([k, isKbUnsupported(err(k))]).toEqual([k, false]);
  }
  expect(isKbUnsupported(new ApiError(404, { code: "not_found", message: "Not Found" }))).toBe(true);
  expect(R.alias_taken.body).toMatchObject({ message: "kb_alias_belongs_to_other_entity" });
  expect(R.conflict_resolve_wrong_kind.body).toMatchObject({ message: "kb_resolution_not_applicable" });
  expect(new KbContractError("x", "y").message).toContain("계약");
});

it("메인: 실제 현황 숫자, 실패·보류 목록, 최근 자료, 주제별 개수, 허브 개념과 관계가 보인다", async () => {
  mount("/knowledge-library");
  const s = body("summary");
  const metrics = within(await screen.findByRole("list", { name: "도서관 현황" }));
  expect(metrics.getByText("문서").nextSibling?.textContent).toBe(String(s.counts.documents));
  expect(metrics.getByText("열린 충돌").nextSibling?.textContent).toBe(String(s.counts.open_conflicts));
  expect(metrics.getByText("후보 관계").nextSibling?.textContent).toBe(String(s.v3.relations_candidate));
  expect(screen.getByText(`부분 완료 ${s.pipeline.degraded}건`)).toBeTruthy();
  expect(screen.getByText(`보류 ${s.pipeline.held}건`)).toBeTruthy();
  // 부분 완료는 오류 목록에 섞이지 않고, 보류된 문서는 사유와 함께 올라온다.
  const heldTitle = body("jobs_held").items[0].document_title;
  const problems = await screen.findByRole("list", { name: "실패·보류 작업" });
  expect(within(problems).getByText(heldTitle)).toBeTruthy();
  expect(within(problems).getByText(/구형 오피스 파일/)).toBeTruthy();
  expect(within(problems).queryByText("l2_disabled")).toBeNull();
  const recent = await screen.findByRole("list", { name: "최근 자료" });
  expect(within(recent).getAllByRole("button").length).toBeGreaterThan(0);
  const topic = await screen.findByRole("button", { name: new RegExp("^개발·인프라 " + body("documents_domain_devinfra").total) });
  expect(topic).toBeTruthy();
  const hubs = body("graph_hubs").nodes;
  expect(await screen.findByText(new RegExp("전체 개념 " + body("graph_hubs").total_entities + "개 중 중요도 상위 " + hubs.length + "개"))).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it("통합 검색: 실제 정본 카드, 근거 인용, 매칭 경로 배지, 원문 위치", async () => {
  mount("/knowledge-library?q=%EB%94%94%ED%94%8C%EB%A1%9C%EC%9D%B4%EB%A8%BC%ED%8A%B8");
  const s = body("search_hybrid");
  const card = within(await screen.findByRole("article", { name: "개념 Deployment" }));
  expect(card.getByText(s.matched_entities[0].canonical.summary)).toBeTruthy();
  const list = await screen.findByRole("list", { name: "검색 결과" });
  expect(within(list).getAllByText("정본 근거").length + within(list).getAllByText("단어").length).toBeGreaterThan(0);
  fireEvent.click(within(list).getAllByRole("button", { name: "근거 원문 보기" })[0]);
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it("검색: 단어 전용 응답에는 정본·coverage 가 없어도 결과를 보이고, 의미만 검색도 실제 응답으로 돈다", async () => {
  expect(body("search_lexical")).not.toHaveProperty("coverage");
  mount("/knowledge-library?q=x&mode=lexical");
  expect(await screen.findByRole("list", { name: "검색 결과" })).toBeTruthy();
  expect(screen.queryByRole("article")).toBeNull();
  cleanup();
  mount("/knowledge-library?q=x&mode=vector");
  expect(await screen.findByRole("list", { name: "검색 결과" })).toBeTruthy();
});

it("근거가 약한 질의: 실서버는 엉뚱한 질의에도 결과를 주지만 coverage 는 weak 이고, 화면은 근거가 약하다고 말한다", async () => {
  expect(body("search_nohit").coverage).toBe("weak");
  mount("/knowledge-library?q=zzqxjk%EC%97%86%EB%8A%94%EB%A7%90");
  expect(await screen.findByText(/근거가 약해요/)).toBeTruthy();
});

it("문서 상세: 실제 요약 출처, 개념, 관계 근거 인용, 주장, 처리 이력이 보인다", async () => {
  const d = body("document_detail");
  mount("/knowledge-library?view=docs&doc=" + d.id);
  expect(await screen.findByRole("heading", { name: d.title })).toBeTruthy();
  expect(await screen.findByText(d.summary)).toBeTruthy();
  expect(screen.getByText(/AI 가 쓴 요약이 아니에요\. 정본 정의을 그대로 보여 줘요/)).toBeTruthy();
  // 부분 완료 작업: 코드(l2_disabled)가 아니라 문장으로 보인다.
  expect(screen.getAllByText(/AI 심층 추출이 꺼져 있어/).length).toBeGreaterThan(0);
  expect(screen.queryByText("l2_disabled")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "개념·관계·주장" }));
  const rel = d.relations[0];
  const relations = await screen.findByRole("list", { name: "문서의 관계" });
  expect(within(relations).getByText(rel.evidence[0].quote)).toBeTruthy();
  expect(within(relations).getAllByText(rel.candidate ? "후보 · 확정 전" : "확정").length).toBeGreaterThan(0);
  const claims = await screen.findByRole("list", { name: "추출된 주장" });
  expect(within(claims).getByText(d.assertions[0].text)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "버전·처리 이력" }));
  const history = await screen.findByRole("list", { name: "처리 이력" });
  expect(within(history).getByText(/부분 완료 사유: AI 심층 추출이 꺼져 있어/)).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it("실제 보류 문서: 보류 안내, 처리 단계의 보류 표시, 재시도 버튼 없음", async () => {
  const d = body("document_detail_held");
  mount("/knowledge-library?view=docs&doc=" + d.id);
  expect(await screen.findByText(/이 문서는 보류 상태예요/)).toBeTruthy();
  expect(screen.getByText("보류된 문서라 요약이 없어요.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /재시도/ })).toBeNull();
  expect(screen.getByText(/재시도를 막아 뒀어요/)).toBeTruthy();
});

it("실제 버전 이력: 이전 버전은 현재가 아니라고 표시되고, 각 버전의 처리 상태가 붙는다", async () => {
  const d = body("document_detail_versions");
  mount("/knowledge-library?view=docs&doc=" + d.id + "&ds=history");
  const versions = await screen.findByRole("list", { name: "버전 이력" });
  const items = within(versions).getAllByRole("listitem");
  expect(items.length).toBe(d.revisions.length);
  expect(within(items[0]).getByText(/현재/)).toBeTruthy();
  expect(within(items[0]).getByText("부분 완료")).toBeTruthy();
});

it("문서 목록: 실제 처리 상태·자동 분류 주제·보류 사유가 행에 보인다", async () => {
  mount("/knowledge-library?view=docs");
  const list = await screen.findByRole("list", { name: "문서 목록" });
  expect(within(list).getAllByText("부분 완료").length).toBeGreaterThan(0);
  expect(within(list).getAllByText("보류").length).toBeGreaterThan(0);
  const auto = body("documents").items.some((x: Any) => x.domain_source === "entities");
  expect(auto).toBe(true);
  expect(within(list).getAllByText("개발·인프라 · 자동 분류").length).toBeGreaterThan(0);
  expect(within(list).getAllByText("개발·인프라").length).toBeGreaterThan(0); // 사용자가 고른 주제는 자동 분류 표시 없이
  expect(within(list).getByText(/구형 오피스 파일/)).toBeTruthy();
});

it("실제 충돌: 값이 다른 주장은 두 원문 인용·문서·발행일을, 모호한 개념은 두 개념과 서버 메모를 보여 준다", async () => {
  mount("/knowledge-library?view=conflicts");
  const value = body("conflicts_open").items.find((c: Any) => c.kind === "value_contradiction");
  const item = within(await screen.findByRole("listitem", { name: value.entity_name + " 값이 다른 주장" }));
  expect(within(item.getByRole("region", { name: "주장 A" })).getByText(value.claim_a.quote)).toBeTruthy();
  expect(within(item.getByRole("region", { name: "주장 B" })).getByText(value.claim_b.quote)).toBeTruthy();
  expect(item.getByRole("button", { name: value.claim_a.document_title })).toBeTruthy();
  const amb = body("conflicts_open").items.find((c: Any) => c.kind === "ambiguous_entity");
  const ambItem = within(screen.getAllByRole("listitem", { name: amb.entity_name + " 같은 개념인지 불확실" })[0]);
  expect(ambItem.getByText(/서버 메모: similarity candidate/)).toBeTruthy();
  expect(ambItem.getByRole("button", { name: "하나의 개념으로 병합" })).toBeTruthy();
  // 종류에 맞지 않는 해결(병합)은 상충 주장에 아예 제시하지 않는다.
  expect(item.queryByRole("button", { name: "하나의 개념으로 병합" })).toBeNull();
  // 품질 진단: 서버가 주지 않는 두 항목(해시 일괄 검증, 평가 요약)만 미지원이고 나머지는 summary.v3 의 실제 값이다.
  const quality = within(await screen.findByRole("region", { name: "품질 진단" }));
  expect(quality.getAllByText("서버 미지원").length).toBe(2);
  expect(quality.getByText(String(body("summary").v3.relations_active) + "개 / " + String(body("summary").v3.relations_candidate) + "개")).toBeTruthy();
});

it("개념 그래프: 실제 허브 개념과 확정 관계가 보이고, 개념을 누르면 실제 이웃과 상세(별칭·관계 근거)가 열린다", async () => {
  mount("/knowledge-library?view=graph");
  const hubs = body("graph_hubs");
  expect(await screen.findByText(new RegExp("개념 " + hubs.nodes.length + "개 표시.* · 관계 " + hubs.edges.length + "개"))).toBeTruthy();
  const center = hubs.nodes.find((n: Any) => /deployment/i.test(n.name));
  fireEvent.click(await screen.findByRole("button", { name: new RegExp("^" + center.name + ", ") }));
  const panel = within(await screen.findByRole("complementary", { name: "개념 상세" }));
  const e = body("entity_detail");
  expect(await panel.findByText(e.canonical.summary)).toBeTruthy();
  // 서버가 정본 핵심 사실에 정의 문장을 한 번 더 넣어 줘도 요약과 같으면 한 번만 보인다.
  expect(panel.queryAllByText(e.canonical.summary).length).toBe(1);
  expect(panel.getByText(/디플로이먼트 · ko/)).toBeTruthy();
  const rels = within(await panel.findByRole("list", { name: "관계 목록" }));
  const rel = e.relations[0];
  expect(await rels.findByText(body("graph_neighbors").edges[0].evidence[0].quote)).toBeTruthy();
  expect(rels.getByText(rel.name)).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it("후보 관계 보기를 켜면 실제 후보 관계(part_of)가 점선으로 들어온다", async () => {
  mount("/knowledge-library?view=graph&cand=1");
  const g = body("graph_hubs_candidates");
  expect(g.edges.some((x: Any) => x.candidate)).toBe(true);
  expect(await screen.findByText(new RegExp("관계 " + g.edges.length + "개"))).toBeTruthy();
  expect(screen.getByText(/점선은 근거는 있지만 아직 확정되지 않은 후보 관계/)).toBeTruthy();
  expect(document.querySelectorAll(".cl-edge[data-candidate]").length).toBe(g.edges.filter((x: Any) => x.candidate).length);
});

it("자료 추가: 실제 ingest 응답(중복·보류·실패 id null)을 화면이 그대로 구분해 보여 준다", async () => {
  mount("/knowledge-library");
  fireEvent.click(await screen.findByRole("button", { name: "자료 추가" }));
  const dialog = await screen.findByRole("dialog", { name: "자료 추가" });
  const scope = within(dialog);
  fireEvent.change(dialog.querySelector("input[type=file]")!, { target: { files: [new File(["x"], "same.md"), new File(["y"], "legacy.hwp")] } });
  fireEvent.change(scope.getByLabelText("웹 주소 (한 줄에 하나)"), { target: { value: "http://127.0.0.1:9/none" } });
  fireEvent.click(scope.getByRole("button", { name: "추가" }));
  const list = await scope.findByRole("list", { name: "접수 결과" });
  expect(within(list).getByText("이미 있음")).toBeTruthy();
  expect(within(list).getByText("보류")).toBeTruthy();
  expect(within(list).getByText("실패")).toBeTruthy();
  expect(within(list).getByText(/port_not_allowed/)).toBeTruthy();
  expect(scope.getByText(/새로 처리 대기에 올라간 항목이 없어요/)).toBeTruthy();
  expect(where()).toBe("/knowledge-library");
});

it("처리 현황 드로어: 실제 보류 작업은 재시도 버튼이 없고, 부분 완료 작업은 심층 추출만 다시 시도하며 결과가 남는다", async () => {
  mount("/knowledge-library");
  fireEvent.click((await screen.findAllByRole("button", { name: /^처리 현황 열기: 진행/ }))[0]);
  const dialog = await screen.findByRole("dialog", { name: "자동 처리 현황" });
  fireEvent.click(within(dialog).getByRole("button", { name: "보류" }));
  const heldTitle = body("jobs_held").items[0].document_title;
  const heldCard = within((await within(dialog).findByText(heldTitle)).closest("li") as HTMLElement);
  expect(heldCard.getByText(/재시도를 막아 뒀어요/)).toBeTruthy();
  expect(heldCard.queryByRole("button", { name: /재시도/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "부분 완료" }));
  const retryTitle = body("job_retry_extracting").document_title;
  fireEvent.click((await within(dialog).findAllByRole("button", { name: "심층 추출만 다시" }))[0]);
  await waitFor(() => expect(within(dialog).getAllByText(/다시 대기열에 넣었어요/).length).toBeGreaterThan(0));
  expect(retryTitle).toBeTruthy();
});
