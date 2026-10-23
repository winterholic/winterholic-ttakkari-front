import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({ summary: vi.fn(), docs: vi.fn(), doc: vi.fn(), search: vi.fn(), evidence: vi.fn(), register: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  kbSummary: (...a: unknown[]) => h.summary(...a),
  kbDocuments: (...a: unknown[]) => h.docs(...a),
  kbDocument: (...a: unknown[]) => h.doc(...a),
  kbSearch: (...a: unknown[]) => h.search(...a),
  kbEvidence: (...a: unknown[]) => h.evidence(...a),
  kbRegister: (...a: unknown[]) => h.register(...a),
}));
import { ApiError } from "../api/client";
import { KnowledgeLibraryPage } from "./KnowledgeLibraryPage";
import { FEATURES } from "../shell/features";
import { splitHighlights } from "../features/kb/labels";

const source = {
  id: "s1", kind: "upload", source_key: "manual:pg", locator: "https://example.test/pg", sha256: "a".repeat(64),
  byte_size: 100, media_type: "text/plain", collected_at: "2026-10-23T01:00:00Z",
};
const docRow = {
  id: "d1", doc_key: "manual:pg", title: "PostgreSQL 격리 수준", lang: "ko", created_at: "2026-10-23T01:00:00Z", updated_at: "2026-10-23T01:00:00Z",
  current_revision: { id: "r2", rev_no: 2, char_count: 1200, passage_count: 3, created_at: "2026-10-23T02:00:00Z", source },
};
const hit = {
  passage_id: "p1", ord: 0, heading: null, snippet: "PostgreSQL 은 격리 수준을 네 가지로 설명한다.", highlights: [[13, 15], [16, 18]], score: 1.2,
  char_start: 0, char_end: 30, document: { id: "d1", title: "PostgreSQL 격리 수준", lang: "ko" },
  revision: { id: "r2", rev_no: 2, current: true, char_count: 1200 }, source,
};
const evidence = {
  passage_id: "p1", document: { id: "d1", title: "PostgreSQL 격리 수준" }, revision: { id: "r2", rev_no: 2, text_sha256: "b".repeat(64) }, source,
  span: { passage_start: 0, passage_end: 30, revision_start: 40, revision_end: 70, line_start: 3, line_end: 3, sha256: "c".repeat(64), hash_verified: true },
  quote: "PostgreSQL 은 격리 수준을 네 가지로 설명한다.", before: "앞 문맥\n\n", after: "\n\n뒤 문맥", registered_evidence: [],
};
const detail = {
  id: "d1", doc_key: "manual:pg", title: "PostgreSQL 격리 수준", lang: "ko", created_at: "2026-10-23T01:00:00Z", updated_at: "2026-10-23T02:00:00Z",
  revisions: [
    { id: "r2", rev_no: 2, parser_version: "raw-v1", char_count: 1200, text_sha256: "b".repeat(64), passage_count: 1, current: true, supersedes_id: "r1", created_at: "2026-10-23T02:00:00Z", source },
    { id: "r1", rev_no: 1, parser_version: "raw-v1", char_count: 900, text_sha256: "d".repeat(64), passage_count: 1, current: false, supersedes_id: null, created_at: "2026-10-23T01:00:00Z", source },
  ],
  selected_revision_id: "r2",
  passages: { items: [{ id: "p1", ord: 0, heading: null, body: "첫째 패시지 본문", char_start: 0, char_end: 9, sha256: "e".repeat(64) }], total: 1, limit: 50, offset: 0 },
};

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
  h.summary.mockResolvedValue({ counts: { sources: 2, documents: 1, revisions: 2, passages: 4, evidence: 0 }, last_collected_at: "2026-10-23T02:00:00Z" });
  h.docs.mockResolvedValue({ items: [docRow], total: 1, limit: 30, offset: 0 });
  h.doc.mockResolvedValue(detail);
  h.search.mockResolvedValue({ query: "격리 수준", terms: ["격리", "수준"], items: [hit], limit: 10, offset: 0, has_more: false });
  h.evidence.mockResolvedValue(evidence);
  h.register.mockResolvedValue({ document_id: "d1", revision_id: "r1", rev_no: 1, created: true, passage_count: 2 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에서 발견되고 개인 맥락 도서관과 다른 경로를 쓴다", () => {
  const f = FEATURES.find((x) => x.root === "knowledge-library");
  expect(f?.to).toBe("/knowledge-library");
  expect(FEATURES.find((x) => x.root === "context-library")?.to).toBe("/context-library");
});

it("처음에는 안내와 문서·패시지 수를 보여 주고 검색하지 않는다", async () => {
  mount();
  expect(await screen.findByText(/문서 1 · 패시지 4/)).toBeTruthy();
  expect(screen.getByText(/찾고 싶은 내용을 입력하면/)).toBeTruthy();
  expect(h.search).not.toHaveBeenCalled();
});

it("검색어를 제출하면 URL 과 API 에 반영되고 강조된 발췌와 원문 위치를 보여 준다", async () => {
  mount();
  fireEvent.change(await screen.findByRole("searchbox", { name: "지식 도서관 검색" }), { target: { value: "격리 수준" } });
  fireEvent.click(within(screen.getByRole("search")).getByRole("button", { name: "검색" }));
  await waitFor(() => expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ q: "격리 수준", offset: 0 })));
  expect(screen.getByTestId("where").textContent).toContain("q=%EA%B2%A9%EB%A6%AC");
  const list = await screen.findByRole("list", { name: "검색 결과" });
  expect(within(list).getByText("PostgreSQL 격리 수준")).toBeTruthy();
  expect(within(list).getByText("현재 버전")).toBeTruthy();
  const marks = Array.from(list.querySelectorAll("mark")).map((m) => m.textContent);
  expect(marks).toEqual(["격리", "수준"]);
  fireEvent.click(within(list).getByRole("button", { name: "원문 위치 보기" }));
  expect(await screen.findByText("해시 일치")).toBeTruthy();
  expect(screen.getByText("문자 40–70")).toBeTruthy();
  expect(screen.getByText("3줄")).toBeTruthy();
  expect(h.evidence).toHaveBeenCalledWith("p1");
});

it("결과가 없으면 빈 상태, 실패하면 오류와 다시 시도를 보여 준다", async () => {
  h.search.mockResolvedValueOnce({ query: "없는말", terms: ["없는말"], items: [], limit: 10, offset: 0, has_more: false });
  mount("/knowledge-library?q=%EC%97%86%EB%8A%94%EB%A7%90");
  expect(await screen.findByText(/맞는 패시지가 없어요/)).toBeTruthy();
  cleanup();
  h.search.mockRejectedValueOnce(new ApiError(500, { code: "internal", message: "서버 오류가 발생했습니다." }));
  mount("/knowledge-library?q=abc");
  expect((await screen.findByRole("alert")).textContent).toContain("서버 오류");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(h.search).toHaveBeenCalledTimes(3));
});

it("더 볼 결과가 있으면 offset 을 넘겨 이어서 가져온다", async () => {
  h.search.mockResolvedValueOnce({ query: "q", terms: ["qq"], items: [hit], limit: 10, offset: 0, has_more: true });
  h.search.mockResolvedValueOnce({ query: "q", terms: ["qq"], items: [{ ...hit, passage_id: "p2" }], limit: 10, offset: 10, has_more: false });
  mount("/knowledge-library?q=qq");
  fireEvent.click(await screen.findByRole("button", { name: "결과 더 보기" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 10 })));
  await waitFor(() => expect(screen.getAllByRole("listitem").length).toBe(2));
});

it("문서 탭은 목록을 보여 주고 문서를 열면 버전·패시지·원문 위치를 보여 준다", async () => {
  mount("/knowledge-library?view=docs");
  fireEvent.click(await screen.findByRole("button", { name: /^PostgreSQL 격리 수준/ }));
  expect(screen.getByTestId("where").textContent).toContain("doc=d1");
  expect(await screen.findByRole("heading", { name: "PostgreSQL 격리 수준" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /버전 2 · 현재/ })).toBeTruthy();
  expect(screen.getByText("첫째 패시지 본문")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^버전 1$/ }));
  await waitFor(() => expect(h.doc).toHaveBeenLastCalledWith("d1", expect.objectContaining({ revision_id: "r1" })));
  expect(screen.getByTestId("where").textContent).toContain("rev=r1");
});

it("이전 버전을 고르면 현재 버전만 검색된다는 안내가 나온다", async () => {
  h.doc.mockResolvedValue({ ...detail, selected_revision_id: "r1" });
  mount("/knowledge-library?view=docs&doc=d1&rev=r1");
  expect(await screen.findByText(/이전 버전이에요/)).toBeTruthy();
});

it("문서가 없으면 등록 안내가 나온다", async () => {
  h.docs.mockResolvedValue({ items: [], total: 0, limit: 30, offset: 0 });
  mount("/knowledge-library?view=docs");
  expect(await screen.findByText("아직 등록된 문서가 없어요.")).toBeTruthy();
});

it("검색 결과의 문서 열기는 문서 탭의 해당 버전으로 이동한다", async () => {
  mount("/knowledge-library?q=qq");
  fireEvent.click(await screen.findByRole("button", { name: "문서 열기" }));
  const where = screen.getByTestId("where").textContent ?? "";
  expect(where).toContain("view=docs");
  expect(where).toContain("doc=d1");
  expect(where).toContain("rev=r2");
});

it("등록 탭 입력 검증과 성공 흐름", async () => {
  mount("/knowledge-library?view=add");
  const submit = (await screen.findAllByRole("button", { name: "등록" })).find((b) => (b as HTMLButtonElement).type === "submit")!;
  fireEvent.click(submit);
  expect((await screen.findByRole("alert")).textContent).toContain("제목");
  expect(h.register).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("제목"), { target: { value: "새 문서" } });
  fireEvent.click(submit);
  expect((await screen.findByRole("alert")).textContent).toContain("본문");
  fireEvent.change(screen.getByLabelText("본문"), { target: { value: "첫 문단\n\n둘째 문단" } });
  fireEvent.click(submit);
  await waitFor(() => expect(h.register).toHaveBeenCalledWith({ title: "새 문서", text: "첫 문단\n\n둘째 문단", source_key: undefined, lang: undefined }));
  expect(await screen.findByText(/등록했어요\. 버전 1, 패시지 2개/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "문서 보기" }));
  expect(screen.getByTestId("where").textContent).toContain("doc=d1");
});

it("등록: 이미 있는 내용이면 멱등 안내를, 서버 오류 코드는 사용자 문장으로 보여 준다", async () => {
  h.register.mockResolvedValueOnce({ document_id: "d1", revision_id: "r1", rev_no: 1, created: false, passage_count: 2 });
  mount("/knowledge-library?view=add");
  fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "t" } });
  fireEvent.change(screen.getByLabelText("본문"), { target: { value: "x" } });
  const submit = screen.getAllByRole("button", { name: "등록" }).find((b) => (b as HTMLButtonElement).type === "submit")!;
  fireEvent.click(submit);
  expect(await screen.findByText(/이미 같은 내용이 등록돼 있어요/)).toBeTruthy();
  h.register.mockRejectedValueOnce(new ApiError(422, { code: "error", message: "text_too_long" }));
  fireEvent.click(submit);
  expect((await screen.findByRole("alert")).textContent).toContain("너무 길어요");
});

it("splitHighlights 는 코드포인트 기준 구간을 나누고 잘못된 구간은 건너뛴다", () => {
  expect(splitHighlights("가나다라", [[1, 3]])).toEqual([{ text: "가", hit: false }, { text: "나다", hit: true }, { text: "라", hit: false }]);
  expect(splitHighlights("😀ab", [[1, 2]])).toEqual([{ text: "😀", hit: false }, { text: "a", hit: true }, { text: "b", hit: false }]);
  expect(splitHighlights("abc", [[0, 2], [1, 3], [5, 9]])).toEqual([{ text: "ab", hit: true }, { text: "c", hit: false }]);
  expect(splitHighlights("abc", [])).toEqual([{ text: "abc", hit: false }]);
});
