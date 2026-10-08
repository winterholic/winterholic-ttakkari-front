import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

const auth = { state: "out" as "in" | "out" | "loading", login: vi.fn(), logout: vi.fn() };
vi.mock("../auth", () => ({ useAuth: () => auth }));
vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return { ...actual, apiUrl: (p: string) => `http://test${p}` };
});

import { ApiError } from "../api/client";
import { formatWait, LoginPage } from "./LoginPage";

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/chat" element={<p>채팅 도착</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.login.mockReset();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"ok":true}')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const submit = (pw: string) => {
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: pw } });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
};

describe("LoginPage", () => {
  it("401 이면 필드에 aria-invalid 와 안내 문구를 낸다", async () => {
    auth.login.mockRejectedValue(new ApiError(401, { code: "unauthorized", message: "bad" }));
    renderLogin();
    submit("틀린");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("비밀번호가 맞지 않아요");
    expect(screen.getByLabelText("비밀번호").getAttribute("aria-invalid")).toBe("true");
  });

  it("429 는 남은 시간을, 503 은 미설정 안내를 보여준다", async () => {
    auth.login.mockRejectedValueOnce(new ApiError(429, { code: "rate_limited", message: "x" }, 150));
    renderLogin();
    submit("a");
    expect((await screen.findByRole("alert")).textContent).toContain("2분 30초 뒤에");

    auth.login.mockRejectedValueOnce(new ApiError(503, { code: "x", message: "x" }));
    submit("b");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("비밀번호가 아직 설정되지 않았어요"));
  });

  it("제출 중에는 aria-busy 이고 성공하면 /chat 으로 간다", async () => {
    let done: () => void = () => {};
    auth.login.mockReturnValue(new Promise<void>((r) => (done = r)));
    renderLogin();
    submit("correct");
    const btn = await screen.findByRole("button", { name: "확인하는 중" });
    expect(btn.getAttribute("aria-busy")).toBe("true");
    done();
    expect(await screen.findByText("채팅 도착")).toBeTruthy();
  });

  it("formatWait", () => {
    expect([formatWait(30), formatWait(60), formatWait(61)]).toEqual(["30초", "1분", "1분 1초"]);
  });
});
