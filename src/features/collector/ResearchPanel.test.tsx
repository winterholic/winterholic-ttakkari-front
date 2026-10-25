import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it } from "vitest";
import type { CollectionMission } from "../../api/collectionMissions";
import { ResearchPanel } from "./ResearchPanel";

afterEach(cleanup);

const base = {
  id: "m1", title: "t", goal: "g", status: "partial", counts: {}, jobs: [], gaps: [], results: [], run_seq: 1,
  knowledge_processing: { storage: "pending", semantic: "unverified" }, created_at: "", updated_at: "",
  plan: { title: "t", mode: "research", steps: [], sources: [], queries: [], coverage: [], budget: { pages: 10, depth: 1, searches: 16, seconds: 1800, rounds: 3, papers: 20 }, stop_conditions: [] },
} as unknown as CollectionMission;
const mission = (patch: Record<string, unknown>, plan: Record<string, unknown> = {}): CollectionMission =>
  ({ ...base, ...patch, plan: { ...base.plan, ...plan } }) as CollectionMission;
const mount = (m: CollectionMission) => render(<MemoryRouter><ResearchPanel mission={m} /></MemoryRouter>);
const expand = (name: RegExp) => fireEvent.click(screen.getByText(name));
const item = (el: Element | undefined) => el as HTMLElement;

it("연구 블록이 없는 legacy 응답에서는 아무것도 그리지 않는다", () => {
  const { container } = mount(base);
  expect(container.textContent).toBe("");
  cleanup();
  const nullResearch = mount(mission({ research: null }));
  expect(nullResearch.container.textContent).toBe("");
});

it("하위 주제 상태 여섯 가지를 한국어로 풀고 충분 기준을 설명한다", () => {
  const states = ["unexplored", "no_candidates", "sources_found", "unavailable", "thin", "covered"];
  mount(mission({ research: { round: 1, stop: null, searches_used: 3, search_budget: 16, coverage: states.map((state, index) => ({ topic: `주제 ${index}`, key: state, state, sources: 2, documents: 1, hosts: 1 })) } }));
  expect(screen.getByText("하위 주제 6개 중 1개를 충분히 확보했습니다.")).toBeTruthy();
  expand(/하위 주제별 조사 상태/);
  const expected: Record<string, string> = { unexplored: "미조사", no_candidates: "후보 없음", sources_found: "출처 발견", unavailable: "수집 못함", thin: "자료 부족", covered: "충분히 확보" };
  for (const [index, state] of states.entries()) {
    const row = screen.getByText(`주제 ${index}`).closest("li")!;
    expect(within(row).getByText(expected[state])).toBeTruthy();
  }
  expect(screen.getByText(/서로 다른 출처 2곳 이상\(자료 2건 이상\) 기준/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/no_candidates|sources_found|unexplored|unavailable/);
});

it("종료 사유를 사람이 읽는 문장으로 보여준다", () => {
  const cases: [string, RegExp][] = [
    ["coverage_satisfied", /모든 하위 주제를 충분히 확보/], ["time_budget", /시간 예산을 모두 써서/], ["search_budget", /검색 예산을 모두 써서/],
    ["round_limit", /라운드 상한\(3회\)/], ["no_novel_queries", /새 검색어가 없어/], ["diminishing_returns", /추가 효용 감소/],
    ["provider_failed", /검색 공급자 호출이 실패해.*결과가 없었다는 뜻이 아니라/],
  ];
  for (const [stop, text] of cases) {
    mount(mission({ research: { round: 2, stop, searches_used: 5, search_budget: 16, coverage: [] } }));
    expect(screen.getByLabelText("조사 종료 사유").textContent).toMatch(text);
    expect(screen.getByLabelText("조사 라운드").textContent).toContain("후속 조사 라운드 2회 점검(상한 3회) · 검색 5/16회 사용");
    cleanup();
  }
  mount(mission({ research: { round: 0, stop: null, coverage: [] } }));
  expect(screen.getByLabelText("조사 종료 사유").textContent).toContain("종료 사유가 기록되지 않았습니다");
});

it("검색 공급자 실패와 결과 없음을 구분하고 실패한 주제를 표시한다", () => {
  mount(mission(
    { run_seq: 1, research: { round: 1, stop: "provider_failed", searches_used: 4, search_budget: 16, coverage: [
      { topic: "논문·원전", key: "papers", state: "unexplored", sources: 0, documents: 0, hosts: 0 },
      { topic: "구현·실무 사례", key: "practice", state: "no_candidates", sources: 0, documents: 0, hosts: 0 }] } },
    { queries: ["q-ko", "q-en"], query_topics: { "q-ko": "papers", "q-en": "practice" },
      research: { run_seq: 1, failed: [{ index: 0, code: "timeout", retryable: true, attempts: 1 }] },
      search_history: [{ query: "q-en", status: "ok", candidates: 0, run_seq: 1 }, { query: "q-ko", status: "failed", candidates: 0, run_seq: 1, error: "timeout" }] },
  ));
  expect(screen.getByLabelText("검색 실패").textContent).toContain("검색 공급자 호출 실패 1건");
  expect(screen.getByLabelText("검색 실패").textContent).toContain("결과 없음과는 다른 상태");
  expect(screen.getByLabelText("결과 없는 검색").textContent).toContain("결과가 없던 검색 1회");
  expand(/하위 주제별 조사 상태/);
  const failedRow = screen.getByText("논문·원전").closest("li")!;
  expect(within(failedRow).getByText(/검색 공급자 실패 1건/)).toBeTruthy();
  const emptyRow = screen.getByText("구현·실무 사례").closest("li")!;
  expect(within(emptyRow).queryByText(/검색 공급자 실패/)).toBeNull();
  expect(within(emptyRow).getByText("후보 없음")).toBeTruthy();
});

it("이전 회차의 검색 실패 기록은 현재 회차에 남은 실패로 세지 않는다", () => {
  mount(mission({ run_seq: 2, research: { round: 0, stop: null, coverage: [] } },
    { queries: ["q"], query_topics: { q: "papers" }, research: { run_seq: 1, failed: [{ index: 0, code: "timeout", retryable: true }] } }));
  expect(screen.queryByLabelText("검색 실패")).toBeNull();
});

it("논문은 제목·출처·권리를 보여주고 전문이 없으면 서지 정보만으로 표시한다", () => {
  mount(mission({ research: { round: 1, stop: null, coverage: [], papers: { resolved: 3, fulltext: 1, metadata_only: 2 } } }, { papers: [
    { kind: "arxiv", identifier: "2401.00001", canonical_url: "https://arxiv.org/abs/2401.00001", title: "열린 논문", year: 2024, venue: "arXiv", fulltext: "allowed", license: { id: "CC-BY-4.0", permission: "allowed", source: "arxiv_oai" } },
    { kind: "doi", identifier: "10.1/x", canonical_url: "https://doi.org/10.1/x", title: "닫힌 논문", year: 2023, venue: "Journal", fulltext: "metadata_only", license: { id: null, permission: "unknown", source: "crossref" } },
    { kind: "arxiv", identifier: "2401.00002", canonical_url: "https://arxiv.org/abs/2401.00002", title: "조회 실패 논문", fulltext: "metadata_only", license: { id: null, permission: "unknown", source: "arxiv_oai", error: "timeout" } },
  ] }));
  expect(screen.getByText(/논문 3편 · 서지 정보만 2편/)).toBeTruthy();
  expand(/논문 3편/);
  const openPaper = screen.getByText("열린 논문").closest("li")!;
  expect(within(openPaper).getByText("전문 수집 가능")).toBeTruthy();
  expect(openPaper.textContent).toContain("제공처가 CC-BY-4.0 라이선스로 보고함");
  const closed = screen.getByText("닫힌 논문").closest("li")!;
  expect(within(closed).getByText("서지 정보만")).toBeTruthy();
  expect(closed.textContent).toContain("Journal · 2023년 · DOI 10.1/x");
  expect(closed.textContent).toContain("전문 보관 권한을 확인하지 못함");
  expect(closed.textContent).not.toMatch(/전문 수집 가능|허용|CC-BY/);
  expect(screen.getByText("조회 실패 논문").closest("li")!.textContent).toContain("권리 조회에 실패해 전문 보관 권한을 확인하지 못함");
  expect(within(closed).getByRole("link").getAttribute("href")).toBe("https://doi.org/10.1/x");
});

it("사용자 맥락 claim마다 관계 종류와 연결 자료를 보여주고 모두 미검증으로 표시한다", () => {
  mount(mission({ research: { round: 1, stop: null, coverage: [] } }, {
    context: { text: "사용자가 적은 맥락", provenance: "user_provided", fact_check_status: "unverified" },
    context_links: { provenance: "user_provided", verification: "unverified", documents: 2, claims: [
      { id: "c-1", text: "에이전트는 도구 호출 비용이 크다." }, { id: "c-2", text: "논문에서 직접 인용한 주장이다." }, { id: "c-3", text: "연결되지 않은 주장이다." }],
    unlinked: ["c-3"], relations: [
      { claim_id: "c-1", type: "lexical_overlap", matched_terms: ["에이전트", "비용"], verification: "unverified", target: { kind: "kb_document", title: "비용 문서", url: "https://example.com/a", document_id: "d9" } },
      { claim_id: "c-2", type: "user_cited", verification: "unverified", target: { kind: "paper", title: "인용 논문", url: "https://arxiv.org/abs/2401.00001" } }] },
  }));
  expect(screen.getByText(/사용자 맥락 3건/).textContent).toContain("사용자 제공·미검증");
  expand(/사용자 맥락 3건/);
  const claims = Array.from(document.querySelectorAll(".mission-research__claims > li"));
  expect(claims.length).toBe(3);
  for (const claim of claims) expect(within(item(claim)).getByText("사용자 제공·미검증")).toBeTruthy();
  expect(within(item(claims[0])).getByText("내용 유사(단서)")).toBeTruthy();
  expect(item(claims[0]).textContent).toContain("겹친 용어 에이전트, 비용");
  expect(within(item(claims[0])).getByRole("link", { name: "비용 문서" }).getAttribute("href")).toContain("doc=d9");
  expect(within(item(claims[1])).getByText("사용자가 직접 인용")).toBeTruthy();
  expect(item(claims[2]).textContent).toContain("연결된 자료 없음");
  expect(screen.getByText(/연결은 사실 확인이 아닙니다/)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/사실 확인됨|검증됨|지지|뒷받침/);
});

it("맥락은 있지만 연결 결과가 아직 없으면 그렇게 알린다", () => {
  mount(mission({ research: { round: 0, stop: null, coverage: [] } }, { context: { text: "맥락 문장입니다 정말로" } }));
  expand(/사용자 맥락 0건/);
  expect(screen.getByText(/아직 수집 자료와 연결한 결과가 없습니다/)).toBeTruthy();
});

it("라운드 기록에 후속 검색어와 근거, 종료 사유를 접어서 보여준다", () => {
  mount(mission({ research: { round: 2, stop: "no_novel_queries", searches_used: 9, search_budget: 16, coverage: [], rounds: [
    { round: 1, queries: ["하네스 benchmark"], reasons: ["new_keyword"], new_papers: 1, new_documents_since_previous: null, documents: 4, duplicates: 1, stop: null },
    { round: 2, queries: [], reasons: [], new_papers: 0, new_documents_since_previous: 0, documents: 4, duplicates: 1, stop: "no_novel_queries" }] } }));
  expand(/라운드 기록 2건/);
  expect(screen.getByText("하네스 benchmark")).toBeTruthy();
  expect(screen.getByText(/근거: 수집 자료에서 찾은 새 용어/)).toBeTruthy();
  expect(screen.getByText("새로 추가한 검색어가 없습니다.")).toBeTruthy();
  expect(screen.getAllByText(/더 시도할 새 검색어가 없어/).length).toBeGreaterThanOrEqual(2);
});
