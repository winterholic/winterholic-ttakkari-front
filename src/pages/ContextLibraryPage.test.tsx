import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import type { LibGraph, LibOverview, LibQuality, LibTree } from "../api/client";

const h = vi.hoisted(() => ({
  libOverview: vi.fn(), libTree: vi.fn(), libSourceDocuments: vi.fn(), libDocumentChunks: vi.fn(),
  libGraph: vi.fn(), libEntity: vi.fn(), libQuality: vi.fn(), libSearchLab: vi.fn(), libItem: vi.fn(),
}));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  libOverview: (...a: unknown[]) => h.libOverview(...a),
  libTree: (...a: unknown[]) => h.libTree(...a),
  libSourceDocuments: (...a: unknown[]) => h.libSourceDocuments(...a),
  libDocumentChunks: (...a: unknown[]) => h.libDocumentChunks(...a),
  libGraph: (...a: unknown[]) => h.libGraph(...a),
  libEntity: (...a: unknown[]) => h.libEntity(...a),
  libQuality: (...a: unknown[]) => h.libQuality(...a),
  libSearchLab: (...a: unknown[]) => h.libSearchLab(...a),
  libItem: (...a: unknown[]) => h.libItem(...a),
}));
vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, meta, actions }: { title: string; meta?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {meta && <p>{meta}</p>}
      {actions}
    </header>
  ),
}));

import { ContextLibraryPage } from "./ContextLibraryPage";
import { ContextLibraryItemPage } from "./ContextLibraryItemPage";

const overview: LibOverview = {
  scope: "all", retrieval: "lexical",
  totals: { sources: 3, enabled_sources: 3, documents: 12, chunks: 340, memories: 4, entities: 5, relations: 1 },
  by_category: [
    { category: "projects", scope: "personal", sources: 2, documents: 8, chunks: 300 },
    { category: "knowledge", scope: "shared", sources: 1, documents: 4, chunks: 40 },
  ],
  memories: { by_scope: { personal: 4 }, by_kind: { fact: 3, decision: 1 }, by_source: { ingest: 4 } },
  entities: { by_scope: { personal: 5 }, by_type: { project: 3, topic: 2 } },
  last_indexed_at: "2026-10-13T01:00:00Z", never_indexed: 0,
  error_sources: [{ id: "s9", path: "/Users/me/old/0008.md", category: "projects", scope: "personal", last_error: "폴더가 없어요", last_indexed_at: null }],
};
const tree: LibTree = {
  scope: "all",
  categories: [
    { category: "projects", sources: 2, documents: 8, chunks: 300, groups: [
      { entity_id: "e1", name: "Alpha", entity_type: "project", documents: 8, chunks: 300, scopes: ["personal"], sources: [
        { id: "s1", path: "/Users/me/alpha", pattern: "**/*.md", scope: "personal", enabled: true, documents: 8, chunks: 300, last_indexed_at: "2026-10-13T01:00:00Z", last_error: null },
      ] },
    ] },
    { category: "knowledge", sources: 1, documents: 4, chunks: 40, groups: [
      { entity_id: null, name: "연결된 항목 없음", entity_type: null, documents: 4, chunks: 40, scopes: ["shared"], sources: [
        { id: "s2", path: "/Users/me/skills", pattern: "**/SKILL.md", scope: "shared", enabled: true, documents: 4, chunks: 40, last_indexed_at: null, last_error: null },
      ] },
    ] },
  ],
};
const flags = (over: Partial<LibGraph["nodes"][number]["flags"]> = {}) => ({ isolated: false, no_alias: false, no_summary: false, no_evidence: false, duplicate_suspect: false, ...over });
const graph: LibGraph = {
  scope: "all",
  nodes: [
    { id: "e1", name: "Alpha", type: "project", scope: "personal", aliases: ["알파"], summary: "첫째", pinned: false, degree: 1, memories: 2, sources: 1, documents: 8, chunks: 300, flags: flags() },
    { id: "e2", name: "Beta", type: "tool", scope: "personal", aliases: [], summary: "", pinned: false, degree: 1, memories: 0, sources: 0, documents: 0, chunks: 0, flags: flags({ no_alias: true, no_summary: true, no_evidence: true }) },
    { id: "e3", name: "Gamma", type: "topic", scope: "work", aliases: [], summary: "", pinned: false, degree: 0, memories: 0, sources: 0, documents: 0, chunks: 0, flags: flags({ isolated: true, no_alias: true, duplicate_suspect: true }) },
  ],
  edges: [{ id: "r1", source: "e1", target: "e2", predicate: "uses", note: null, origin: "manual" }],
  duplicates: [{ a: "e3", b: "e2", a_name: "Gamma", b_name: "Beta", reason: "이름이 비슷함", score: 0.9 }],
  predicates: { uses: 1 },
};
const quality: LibQuality = {
  scope: "all",
  chunks: {
    total: 100, short_limit: 80, long_limit: 1500, target: 1200, no_heading: 3, short: 12, long: 1,
    histogram: [{ label: "0–79", min: 0, max: 80, count: 12 }, { label: "80–199", min: 80, max: 200, count: 40 }, { label: "1600+", min: 1600, max: null, count: 1 }],
    stats: { min: 3, median: 400, p90: 1000, max: 1700, mean: 500 },
    short_examples: [{ id: "c1", document_id: "d1", path: "/Users/me/a.md", title: "A", heading: null, length: 3, preview: "```" }], long_examples: [],
  },
  duplicates: { groups: 1, extra_chunks: 9, truncated: false, examples: [{ id: "c2", document_id: "d2", path: "/Users/me/b.md", title: "B", heading: "H", length: 40, preview: "중복", copies: 10, documents: 10 }] },
  documents: { total: 12, empty: 0, count_mismatch: 0, empty_examples: [], chunks_per_doc: { mean: 8.3, max: 60 }, largest: [] },
  sources: { total: 3, disabled: 0, errors: 1, never_indexed: 0, stale: [], empty: [], unlinked: 0 },
  entities: { total: 5, no_alias: 3, no_alias_names: ["Beta", "Gamma", "Delta"], no_summary: 2, isolated: 1, isolated_names: ["Gamma"], no_evidence: 1, no_evidence_names: ["Beta"], duplicate_pairs: [], by_type: { project: 3, topic: 2 } },
  relations: { total: 1, predicates: { uses: 1 }, predicate_variants: [], bidirectional_same_predicate: 0 },
  memories: { total: 4, unlinked: 0, no_source_ref: 0, pinned: 0, duplicate: 0, by_kind: { fact: 3, decision: 1 }, by_source: { ingest: 4 }, length: { max: 170, mean: 118 } },
  findings: [
    { level: "ok", code: "long_chunks", title: "너무 긴 조각 1개 (1.0%)", detail: "", count: 1 },
    { level: "warn", code: "short_chunks", title: "너무 짧은 조각 12개 (12.0%)", detail: "문맥이 부족해요.", count: 12 },
  ],
};

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function mount(url = "/context-library") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/context-library" element={<ContextLibraryPage />} />
          <Route path="/context-library/items/:kind/:id" element={<ContextLibraryItemPage />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.libOverview.mockResolvedValue(overview);
  h.libTree.mockResolvedValue(tree);
  h.libGraph.mockResolvedValue(graph);
  h.libQuality.mockResolvedValue(quality);
  h.libEntity.mockResolvedValue({ ...graph.nodes[0], relations: [{ subject: "Alpha", predicate: "uses", object: "Beta", note: null }], memories: [{ id: "m1", kind: "fact", content: "알파는 키워드 검색을 쓴다" }], sources: [] });
  h.libSourceDocuments.mockResolvedValue({ source_id: "s1", path: "/Users/me/alpha", total: 1, documents: [{ id: "d1", path: "/Users/me/alpha/README.md", title: "README", chunks: 3, indexed_at: null }] });
  h.libDocumentChunks.mockResolvedValue({ document_id: "d1", path: "/Users/me/alpha/README.md", title: "README", total: 1, chunks: [{ id: "c1", ord: 0, heading: "개요", length: 12, content: "알파 설명 본문" }] });
  h.libSearchLab.mockResolvedValue({
    query: "알파 키워드", scope: "all", terms: ["알파", "키워드"], anchors: ["Alpha"], elapsed_ms: 12, total: 1, limit: 10, offset: 0,
    results: [{ rank: 1, type: "chunk", id: "c1", score: 1.4, text: "알파는 키워드 검색", matched_terms: ["알파", "키워드"], match_in: ["본문"], via: "keyword", coverage: 1, entities: null, project: "Alpha", category: "projects", path: "/Users/me/alpha/README.md", scope: "personal" }],
  });
  h.libItem.mockResolvedValue({ kind: "memory", id: "m11", content: "상세 기억 본문", memory_kind: "fact", scope: "personal", entities: [] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const f of Object.values(h)) f.mockReset();
});

describe("맥락 도서관 화면", () => {
  it("개요: 종류별 분량과 마지막 색인, 오류 출처, 아직 없는 건강 종류를 보여 준다", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "한눈에" })).toBeTruthy();
    expect(screen.getByText("문서 12 · 조각 340 · 기억 4 · 엔터티 5")).toBeTruthy();
    expect(screen.getByText("폴더가 없어요")).toBeTruthy();
    const cats = screen.getByRole("list", { name: "종류별 분량" });
    const health = within(cats).getByText("건강").closest("li")!;
    expect(within(health as HTMLElement).getByText("아직 없음")).toBeTruthy();
    expect(h.libOverview).toHaveBeenCalledWith("all");
  });

  it("범위를 바꾸면 URL 과 요청에 반영된다", async () => {
    mount();
    await screen.findByRole("heading", { name: "한눈에" });
    fireEvent.click(screen.getByRole("radio", { name: "회사" }));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/context-library?scope=work"));
    await waitFor(() => expect(h.libTree.mock.calls.length + h.libOverview.mock.calls.filter((c) => c[0] === "work").length).toBeGreaterThan(0));
  });

  it("구조: 모음을 누르면 출처, 문서, 조각 미리보기까지 내려간다", async () => {
    mount("/context-library?tab=structure");
    const view = await screen.findByRole("radiogroup", { name: "보기 방식" });
    fireEvent.click(within(view).getByRole("radio", { name: "목록" }));
    fireEvent.click(await screen.findByRole("button", { name: /Alpha/ }));
    fireEvent.click(await screen.findByRole("button", { name: /\/alpha/ }));
    fireEvent.click(await screen.findByRole("button", { name: /README/ }));
    expect(await screen.findByText("알파 설명 본문")).toBeTruthy();
    expect(h.libDocumentChunks).toHaveBeenCalledWith("d1", "all");
  });

  it("좁은 화면에서는 작은 트리맵 조각 대신 모음 목록으로 탐색한다", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    mount("/context-library?tab=structure");
    expect(await screen.findByRole("button", { name: /Alpha/ })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "트리맵" })).toBeNull();
    expect(screen.queryByRole("group", { name: /트리맵/ })).toBeNull();
  });

  it("구조 트리맵: 모음 타일이 면적 설명과 함께 버튼으로 나온다", async () => {
    mount("/context-library?tab=structure");
    expect(await screen.findByRole("group", { name: /트리맵/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "프로젝트 Alpha, 조각 300" })).toBeTruthy();
  });

  it("온톨로지: 품질 신호 개수를 보이고 노드를 누르면 연결된 기억을 불러온다", async () => {
    mount("/context-library?tab=ontology");
    const signals = await screen.findByRole("group", { name: "품질 신호" });
    expect(within(signals).getByRole("button", { name: /관계 없음 1/ })).toBeTruthy();
    expect(within(signals).getByRole("button", { name: /별칭 없음 2/ })).toBeTruthy();
    expect(within(signals).getByRole("button", { name: /중복 의심 1/ })).toBeTruthy();
    const dup = screen.getByRole("list", { name: "중복 의심 쌍" });
    expect(within(dup).getByText("이름이 비슷함")).toBeTruthy();
    fireEvent.click(within(dup).getByRole("button", { name: "Beta" }));
    await waitFor(() => expect(h.libEntity).toHaveBeenCalledWith("e2", "all"));
  });

  it("온톨로지 목록 보기로 바꿔도 같은 엔터티를 읽을 수 있다", async () => {
    mount("/context-library?tab=ontology");
    const view = await screen.findByRole("radiogroup", { name: "보기 방식" });
    fireEvent.click(within(view).getByRole("radio", { name: "목록" }));
    const list = await screen.findByRole("list", { name: "엔터티 목록" });
    expect(within(list).getAllByRole("button")).toHaveLength(3);
    fireEvent.click(within(list).getByRole("button", { name: /Alpha/ }));
    expect(await screen.findByText("알파는 키워드 검색을 쓴다")).toBeTruthy();
  });

  it("검색 실험실: 걸린 단어·위치·경로를 결과에 붙여 보여 준다", async () => {
    mount("/context-library?tab=search");
    fireEvent.change(await screen.findByRole("textbox", { name: "질의" }), { target: { value: "알파 키워드" } });
    fireEvent.click(screen.getByRole("button", { name: "찾기" }));
    const hits = await screen.findByRole("list", { name: "검색 결과" });
    expect(within(hits).getByText("키워드 일치")).toBeTruthy();
    expect(within(hits).getByText(/단어 2\/2/)).toBeTruthy();
    expect(within(hits).getByText(/걸린 곳: 본문/)).toBeTruthy();
    expect(screen.getByText("Alpha", { selector: ".tk-badge" })).toBeTruthy();
    expect(h.libSearchLab).toHaveBeenCalledWith("알파 키워드", "all", 10, 0);
  });

  it("검색 결과를 10개 단위로 넘기고 상세에서 돌아오면 검색 페이지를 복원한다", async () => {
    h.libSearchLab.mockImplementation(async (_query: string, _scope: string, limit: number, offset: number) => ({
      query: "페이지테스트", scope: "all", terms: ["페이지테스트"], anchors: [], elapsed_ms: 4,
      total: 23, limit, offset,
      results: Array.from({ length: Math.min(limit, 23 - offset) }, (_, i) => ({
        rank: offset + i + 1, type: "memory" as const, id: `m${offset + i + 1}`, score: 1,
        text: `페이지테스트 내용 ${offset + i + 1}`, matched_terms: ["페이지테스트"], match_in: ["본문"],
        via: "keyword" as const, coverage: 1, entities: null, scope: "personal" as const,
      })),
    }));
    mount("/context-library?tab=search&q=%ED%8E%98%EC%9D%B4%EC%A7%80%ED%85%8C%EC%8A%A4%ED%8A%B8");
    expect(await screen.findByRole("link", { name: /페이지테스트 내용 1 상세 보기/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(await screen.findByRole("link", { name: /페이지테스트 내용 11 상세 보기/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /페이지테스트 내용 11/ }));
    expect(await screen.findByRole("heading", { name: "상세 기억" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "검색 결과로 돌아가기" }));
    expect(await screen.findByRole("link", { name: /페이지테스트 내용 11 상세 보기/ })).toBeTruthy();
    expect(screen.getByTestId("where").textContent).toContain("page=2");
  });

  it("품질: 손볼 만한 항목을 먼저 보여 주고 분포를 표로도 제공한다", async () => {
    mount("/context-library?tab=quality");
    const list = await screen.findByRole("list", { name: "점검 항목" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0].textContent).toContain("너무 짧은 조각 12개");
    expect(items[0].textContent).toContain("손볼 만함");
    expect(screen.getByRole("img", { name: /조각 길이 분포/ })).toBeTruthy();
    expect(screen.getByText("표로 보기")).toBeTruthy();
  });

  it("불러오지 못하면 다시 시도 버튼이 있는 오류 상태를 보인다", async () => {
    h.libOverview.mockRejectedValue(new Error("boom"));
    mount();
    expect(await screen.findByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("서버가 도서관 API 를 모르면(라우터 404) 옛 버전이라고 알려 준다", async () => {
    h.libOverview.mockRejectedValue(new ApiError(404, { code: "http_404", message: "Not Found" }));
    mount();
    expect(await screen.findByText(/백엔드를 최신 코드로 다시 시작/)).toBeTruthy();
  });

  it("대상 없음 404(not_found)는 서버 메시지를 그대로 보인다", async () => {
    h.libOverview.mockRejectedValue(new ApiError(404, { code: "not_found", message: "출처이(가) 없어요." }));
    mount();
    expect(await screen.findByText("출처이(가) 없어요.")).toBeTruthy();
    expect(screen.queryByText(/옛 버전/)).toBeNull();
  });
});
