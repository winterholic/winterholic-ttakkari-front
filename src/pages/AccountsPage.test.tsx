import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { AccountsPage, LegacySettingsRedirect } from "./AccountsPage";

vi.mock("../shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../features/workspace/useDefaultWorkspace", () => ({
  useDefaultWorkspace: () => ({ isPending: true, isError: false }), DEFAULT_WORKSPACE_KEY: ["workspace", "default"],
}));
vi.mock("../features/accounts/AccountsSection", () => ({ AccountsSection: () => <h2>개인·회사 계정</h2> }));
vi.mock("../features/accounts/QwenWorkerSection", () => ({ QwenWorkerSection: () => <h2>Qwen 작업자</h2> }));
vi.mock("../features/google-account/GoogleAccountSection", () => ({ GoogleAccountSection: () => <h2>Google 계정</h2> }));
vi.mock("../features/tts/TtsSection", () => ({ TtsSection: () => <h2>음성 출력</h2> }));
vi.mock("../features/transfer/ShortcutSection", () => ({ ShortcutSection: () => <h2>아이폰 단축어</h2> }));
afterEach(cleanup);

describe("통합 계정 관리", () => {
  it("작업공간 응답 전부터 제목과 모든 기능 영역을 표시한다", () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "계정 관리", level: 1 })).toBeTruthy();
    for (const name of ["개인·회사 계정", "Qwen 작업자", "Google 계정", "음성 출력", "아이폰 단축어", "권한 폴더"]) {
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    }
    expect(screen.queryByLabelText("설정을 불러오는 중")).toBeNull();
  });
});

it("기존 설정 링크의 섹션과 쿼리를 통합 경로에 보존한다", async () => {
  function Target() {
    const { pathname, search, hash } = useLocation();
    return <p>{pathname + search + hash}</p>;
  }
  render(<MemoryRouter initialEntries={["/settings?from=bookmark#google-accounts"]}>
    <Routes><Route path="/settings" element={<LegacySettingsRedirect />} /><Route path="/accounts" element={<Target />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByText("/accounts?from=bookmark#google-accounts")).toBeTruthy();
});
