import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";

const h = vi.hoisted(() => ({ summary: vi.fn(), search: vi.fn(), item: vi.fn(), layers: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  getHarnessSummary: (...a: unknown[]) => h.summary(...a),
  searchHarness: (...a: unknown[]) => h.search(...a),
  getHarnessItem: (...a: unknown[]) => h.item(...a),
  getHarnessLayers: (...a: unknown[]) => h.layers(...a),
}));
import { HarnessPage } from "./HarnessPage";
import { FEATURES } from "../shell/features";
import { formatAge, highlightParts } from "../features/harness/labels";

const summary = {
  generated_at: 1_792_000_000, total: 579, present: 570,
  categories: [
    { id: "skill", label: "스킬", total: 322, present: 321, missing: 1, inactive: 4, warnings: 2 },
    { id: "prompt", label: "따까리 프롬프트", total: 20, present: 17, missing: 3, inactive: 3, warnings: 0 },
    { id: "guard", label: "안전 가드", total: 33, present: 33, missing: 0, inactive: 0, warnings: 0 },
  ],
  engines: [{ id: "claude", total: 340 }, { id: "ttakkari", total: 200 }],
  scopes: [{ id: "global", total: 400 }, { id: "ttakkari", total: 179 }],
  warning_total: 2, warning_kinds: { broken_ref: 1, duplicate: 1, too_long: 0, other: 0 },
  warnings: [
    { item_id: "aaaaaaaaaaaaaa", name: "harness-engineering", category: "skill", engine: "claude", kind: "broken_ref", message: "깨진 참조: ~/.claude/skills/x.md", count: 1 },
    { item_id: "bbbbbbbbbbbbbb", name: "skill-creator", category: "skill", engine: "claude", kind: "duplicate", message: "중복 이름 3곳", count: 3 },
  ],
  session_kinds: ["desk", "lead", "worker", "orchestrator"], layer_engines: ["claude", "codex", "antigravity", "muse", "qwen-local"],
};
const row = {
  id: "aaaaaaaaaaaaaa", category: "skill", name: "handoff", group: "스킬", description: "현재 대화를 인계 문서로 작성한다.",
  scope: "global", engine: "claude", sessions: ["lead", "worker"], source: "file", path: "~/.claude/skills/handoff/SKILL.md",
  mtime: 1_791_000_000, present: true, active: true, active_note: "프롬프트의 스킬 목록에 노출", kind: "markdown",
  chars: 4200, lines: 90, masked: 0, warnings: [], alias_of: null,
};
const missing = { ...row, id: "cccccccccccccc", name: "GEMINI.md", category: "instruction", engine: "antigravity", present: false, active: false, active_note: "파일 없음", chars: 0, lines: 0, mtime: null, description: "Gemini 지침", sessions: [], warnings: [] };
const detail = {
  ...row, body: "# 인계\n\n본문 내용입니다. token [REDACTED]", offset: 0, next_offset: null, truncated_source: false, real_path: null,
  frontmatter: { name: "handoff", description: "현재 대화를 다음 세션이 이어받을 인계 문서로 작성한다." }, meta: {}, masked: 2,
  warnings: ["깨진 참조: gone.md"],
};
const layers = {
  session: "lead", session_label: "기획", engine: "claude", pool: "personal", prompt_chars: 16657, applied: 2, total: 3, external: 1, notes: ["레이어 본문은 실제 주입 함수가 만든 것이다."],
  layers: [
    { order: 1, id: "system_note", title: "기본 안내", origin: "code", source: "runs/manager.py SYSTEM_NOTE", applies: true, condition: "", evidence: "code", phase: "prompt", chars: 925, preview: "You are running unattended", item_id: "dddddddddddddd" },
    { order: 2, id: "common_instructions", title: "사용자 공통 지침", origin: "file", source: "~/.ttakkari/harness/instructions.md", applies: false, condition: "비어 있거나 파일 없음: 합쳐지지 않는다", evidence: "code", phase: "prompt", chars: 0, preview: "", item_id: null },
    { order: 3, id: "claude_user_md", title: "~/.claude/CLAUDE.md", origin: "cli", source: "Claude Code 가 로드", applies: true, condition: "", evidence: "external", phase: "load", chars: 0, preview: "", item_id: "eeeeeeeeeeeeee" },
  ],
};

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname}{l.search}</output>;
}
function mount(path = "/harness") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><HarnessPage /><Where /></MemoryRouter>
  </QueryClientProvider>);
}
beforeEach(() => {
  h.summary.mockResolvedValue(summary);
  h.search.mockResolvedValue({ total: 2, items: [row, missing], next_cursor: null, facets: { groups: [] } });
  h.item.mockResolvedValue(detail);
  h.layers.mockResolvedValue(layers);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에서 발견되고 요약·목록을 보여 준다", async () => {
  expect(FEATURES.find((f) => f.root === "harness")?.to).toBe("/harness");
  mount();
  expect(await screen.findByRole("button", { name: /^handoff/ })).toBeTruthy();
  expect(screen.getAllByText("579").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /스킬 322/ })).toBeTruthy();
  expect(screen.getByText("없음")).toBeTruthy();
  expect(screen.getByText("2건 중 2건")).toBeTruthy();
});

it("읽기 전용이다: 편집·저장 컨트롤이 없다", async () => {
  mount("/harness?item=aaaaaaaaaaaaaa");
  await screen.findByRole("heading", { name: "handoff" });
  expect(screen.queryByRole("textbox", { name: /편집|수정/ })).toBeNull();
  expect(document.querySelector("textarea")).toBeNull();
  expect(screen.queryByRole("button", { name: /저장|삭제|수정|편집/ })).toBeNull();
});

it("검색어와 카테고리·필터가 URL 과 API 호출에 반영된다", async () => {
  mount();
  await screen.findByRole("button", { name: /^handoff/ });
  fireEvent.change(screen.getByRole("searchbox", { name: "하네스 검색" }), { target: { value: "launchctl" } });
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ q: "launchctl" })));
  expect(screen.getByTestId("where").textContent).toContain("q=launchctl");
  fireEvent.click(screen.getByRole("button", { name: /안전 가드/ }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ category: "guard", q: "launchctl" })));
  fireEvent.change(screen.getByRole("combobox", { name: "엔진 필터" }), { target: { value: "claude" } });
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ engine: "claude" })));
  fireEvent.click(screen.getByRole("checkbox", { name: "경고 있는 항목만" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ warned: true })));
  fireEvent.click(screen.getByRole("checkbox", { name: "없는 항목 숨기기" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ present: true })));
});

it("항목을 열면 description 강조·출처·마스킹 안내·경고를 보여 준다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /^handoff/ }));
  expect(await screen.findByRole("heading", { name: "handoff" })).toBeTruthy();
  const callout = screen.getByLabelText("설명");
  expect(callout.textContent).toContain("frontmatter description");
  expect(callout.textContent).toContain("다음 세션이 이어받을");
  expect(screen.getAllByText("~/.claude/skills/handoff/SKILL.md").length).toBeGreaterThan(0);
  expect(screen.getByText(/값 2곳을 가렸어요/)).toBeTruthy();
  expect(screen.getByLabelText("경고").textContent).toContain("깨진 참조: gone.md");
  expect(screen.getByText("프롬프트의 스킬 목록에 노출")).toBeTruthy();
  expect(screen.getByTestId("where").textContent).toContain("item=aaaaaaaaaaaaaa");
  expect(h.item).toHaveBeenCalledWith("aaaaaaaaaaaaaa", 0);
  fireEvent.click(screen.getByRole("button", { name: "원문 보기" }));
  expect(screen.getByLabelText("원문").textContent).toContain("[REDACTED]");
});

it("긴 본문은 접혀 있고 펼치기·구간 이동을 지원한다", async () => {
  h.item.mockResolvedValue({ ...detail, body: "줄\n".repeat(80), chars: 20000, lines: 81, next_offset: 8000 });
  mount("/harness?item=aaaaaaaaaaaaaa");
  const expand = await screen.findByRole("button", { name: "전체 펼치기" });
  expect(document.querySelector(".hv-body__box")?.hasAttribute("data-collapsed")).toBe(true);
  fireEvent.click(expand);
  expect(document.querySelector(".hv-body__box")?.hasAttribute("data-collapsed")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "다음 구간" }));
  await waitFor(() => expect(h.item).toHaveBeenLastCalledWith("aaaaaaaaaaaaaa", 8000));
});

it("경고 요약에서 항목으로 바로 이동한다", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: /경고 보기/ }));
  expect(screen.getByText("중복 이름 3곳")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /harness-engineering/ }));
  await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("item=aaaaaaaaaaaaaa"));
});

it("세션별로 보기: 합쳐지는 레이어를 순서·적용 여부·근거와 함께 보여 준다", async () => {
  mount("/harness?view=layers&s=lead");
  expect(await screen.findByText(/프롬프트 합본 16,657자/)).toBeTruthy();
  const list = screen.getByRole("list", { name: "적용 순서" });
  const cards = within(list).getAllByRole("listitem");
  expect(cards).toHaveLength(3);
  expect(cards[0].textContent).toContain("기본 안내");
  expect(cards[0].textContent).toContain("코드로 확인");
  expect(cards[1].textContent).toContain("미적용");
  expect(cards[2].textContent).toContain("엔진 동작 · 확인 필요");
  expect(screen.getByText(/엔진 CLI 동작 1개\(코드 밖\)/)).toBeTruthy();
  expect(h.layers).toHaveBeenCalledWith("lead", "claude", "personal");
  fireEvent.click(screen.getByRole("button", { name: "작업자" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "claude", "personal"));
  fireEvent.click(screen.getByRole("button", { name: "회사" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "claude", "work"));
  fireEvent.change(screen.getByRole("combobox", { name: "엔진 선택" }), { target: { value: "codex" } });
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("worker", "codex", "work"));
  fireEvent.click(screen.getByRole("button", { name: "접수" }));
  await waitFor(() => expect(h.layers).toHaveBeenLastCalledWith("desk", "codex", "work"));
  expect(within(screen.getByRole("combobox", { name: "엔진 선택" })).queryByText("Muse")).toBeNull();
});

it("레이어의 상세 보기는 찾기 화면의 항목으로 이어진다", async () => {
  mount("/harness?view=layers");
  fireEvent.click((await screen.findAllByRole("button", { name: /원문·상세 보기/ }))[0]);
  await waitFor(() => expect(screen.getByTestId("where").textContent).toContain("item=dddddddddddddd"));
  expect(screen.getByTestId("where").textContent).not.toContain("view=layers");
});

it("실패하면 이유와 다시 시도를 보여 준다", async () => {
  h.summary.mockRejectedValueOnce(new Error("서버에 연결하지 못했어요."));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("button", { name: /^handoff/ })).toBeTruthy();
});

it("검색어 강조와 날짜 표기 도우미", () => {
  expect(highlightParts("Launchctl 와 launchctl", "launchctl").filter((p) => p.hit)).toHaveLength(2);
  expect(highlightParts("abc", "")).toEqual([{ text: "abc", hit: false }]);
  expect(formatAge(Date.now() / 1000 - 86_400 * 3)).toBe("3일 전");
  expect(formatAge(null)).toBe("");
});
