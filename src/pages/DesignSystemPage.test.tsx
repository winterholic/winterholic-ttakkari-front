import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

const h = vi.hoisted(() => ({ catalog: vi.fn(), search: vi.fn(), item: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  designSystemCatalog: (...a: unknown[]) => h.catalog(...a),
  searchDesignSystem: (...a: unknown[]) => h.search(...a),
  getDesignSystemItem: (...a: unknown[]) => h.item(...a),
}));
import { DesignSystemPage } from "./DesignSystemPage";
import { FEATURES } from "../shell/features";

const revision = "a".repeat(40);
const token = {
  revision, system: "ttakkari", id: "token:color.action", kind: "token", title: "color.action", type: "color",
  description: "사람의 행동", css_variable: "--tk-color-action", source: "ttakkari/tokens/src/color.light.json",
  light: { raw: "{brand.blue}", resolved: "#123456", type: "color", description: "사람의 행동", source: "ttakkari/tokens/src/color.light.json", pointer: "/color/action", references: ["brand.blue"], error: null },
  dark: { raw: "#abcdef", resolved: "#abcdef", type: "color", description: "사람의 행동", source: "ttakkari/tokens/src/color.dark.json", pointer: "/color/action", references: [], error: null },
};
const row = { id: token.id, title: token.title, kind: "token", source: token.source, excerpt: "사람의 행동" };

function mount(path = "/design-systems") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><DesignSystemPage /></MemoryRouter>
  </QueryClientProvider>);
}
beforeEach(() => {
  h.catalog.mockResolvedValue({ revision, source_mode: "committed", items: [
    { id: "ttakkari", name: "Ttakkari", version: "1.3.3", counts: { token: 742, document: 28, component: 16, example: 18 } },
    { id: "aip", name: "AIP", version: "1.2.1", counts: { token: 637, document: 23, component: 13, example: 8 } },
  ] });
  h.search.mockResolvedValue({ revision, system: "ttakkari", total: 2, items: [row], next_cursor: 1 });
  h.item.mockResolvedValue(token);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("부가 기능에서 발견되고 버전·출처와 토큰 양 테마를 확인한다", async () => {
  expect(FEATURES.find((x) => x.root === "design-systems")?.to).toBe("/design-systems");
  mount();
  expect(await screen.findByRole("button", { name: /color.action/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /color.action/ }));
  expect(await screen.findByText("#123456")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "라이트" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "다크" })).toBeTruthy();
  expect(screen.getByText("{brand.blue}")).toBeTruthy();
  expect(screen.getByRole("button", { name: "참조 brand.blue" })).toBeTruthy();
  expect(screen.getAllByText(token.source).length).toBeGreaterThan(0);
  expect(h.item).toHaveBeenCalledWith("ttakkari", token.id, expect.objectContaining({ revision }));
});

it("검색과 종류·시스템을 변경하고 다음 쪽을 읽는다", async () => {
  mount();
  await screen.findByRole("button", { name: /color.action/ });
  fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith("ttakkari", expect.objectContaining({ cursor: 1 })));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Blue" } });
  fireEvent.submit(screen.getByRole("search"));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith("ttakkari", expect.objectContaining({ q: "Blue", cursor: 0 })));
  fireEvent.click(screen.getByRole("button", { name: /사용 지침/ }));
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith("ttakkari", expect.objectContaining({ kind: "document" })));
  fireEvent.change(screen.getByLabelText("디자인시스템 선택"), { target: { value: "aip" } });
  await waitFor(() => expect(h.search).toHaveBeenLastCalledWith("aip", expect.objectContaining({ cursor: 0 })));
});

it("공유 주소에서 HTML 예제는 실행하지 않고 원문으로 보여 준다", async () => {
  h.item.mockResolvedValue({ revision, system: "ttakkari", id: "file:ttakkari/examples/button.html", kind: "example", title: "button.html", source: "ttakkari/examples/button.html", content: "<script>alert(1)</script><button>예제 버튼</button>", offset: 0, total_chars: 8000, next_offset: 6000 });
  const { container } = mount("/design-systems?system=ttakkari&kind=example&item=file%3Attakkari%2Fexamples%2Fbutton.html");
  expect(await screen.findByText(/<script>alert/)).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.queryByRole("button", { name: "예제 버튼" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다음 구간" }));
  await waitFor(() => expect(h.item).toHaveBeenLastCalledWith("ttakkari", "file:ttakkari/examples/button.html", expect.objectContaining({ offset: 6000 })));
});

it("빈 검색 결과와 저장소 오류에 재시도를 제공한다", async () => {
  h.search.mockResolvedValue({ revision, system: "ttakkari", total: 0, items: [], next_cursor: null });
  mount();
  expect(await screen.findByText("조건에 맞는 항목이 없어요.")).toBeTruthy();
  cleanup();
  h.catalog.mockRejectedValue(new Error("저장소를 읽을 수 없습니다."));
  mount();
  expect((await screen.findByRole("alert")).textContent).toContain("저장소를 읽을 수 없습니다.");
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
});

it("참조 해석 오류를 값처럼 숨기지 않고 표시한다", async () => {
  h.item.mockResolvedValue({ ...token, light: { ...token.light, resolved: null, error: "reference cycle: brand.blue" } });
  mount("/design-systems?item=token%3Acolor.action");
  expect((await screen.findByRole("alert")).textContent).toContain("reference cycle");
});

it("문서의 상대 링크는 같은 커밋으로 열고 표는 별도 스크롤 영역에 둔다", async () => {
  h.item.mockResolvedValue({ revision, system: "ttakkari", id: "file:ttakkari/docs/00-guide.md", kind: "document", title: "가이드", source: "ttakkari/docs/00-guide.md", content: "[컴포넌트](06-components.md)\n\n[깨진 링크](bad%ZZ.md)\n\n| 토큰 | 값 |\n| --- | --- |\n| color.action | Blue |", offset: 0, total_chars: 200, next_offset: null });
  mount("/design-systems?item=file%3Attakkari%2Fdocs%2F00-guide.md");
  expect(await screen.findByRole("region", { name: "문서 표" })).toBeTruthy();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("깨진 링크")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "컴포넌트" }));
  await waitFor(() => expect(h.item).toHaveBeenLastCalledWith("ttakkari", "file:ttakkari/docs/06-components.md", expect.objectContaining({ revision })));
});
