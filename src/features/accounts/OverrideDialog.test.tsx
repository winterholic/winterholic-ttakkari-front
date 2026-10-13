import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { AccountOut, AccountPool } from "../../api/types";
import { OverrideDialog } from "./OverrideDialog";

const api = vi.hoisted(() => ({ getOverride: vi.fn(), putOverride: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));
const accounts: AccountOut[] = ["A", "B"].map((name, i) => ({ id: name, name, engine: "claude", pool: "work", config_dir: null, enabled: true, priority: i, work_enabled: true, work_priority: i, login: "ok", login_label: null, cooldown_seconds: 0 }));
const inactive = { active: false, ids: [], until: null };

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  api.getOverride.mockResolvedValue(inactive);
  api.putOverride.mockResolvedValue({ ...inactive, active: true, until: new Date(Date.now() + 3600_000).toISOString() });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function setup(pool: AccountPool = "personal") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><OverrideDialog accounts={accounts} pool={pool} onClose={vi.fn()} /></QueryClientProvider>);
}

describe("OverrideDialog", () => {
  it("로딩을 거친 모달을 닫으면 원래 열기 버튼으로 포커스를 돌린다", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>순서 열기</button>{open && <OverrideDialog accounts={accounts} pool="personal" onClose={() => setOpen(false)} />}</>;
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><Host /></QueryClientProvider>);
    const trigger = screen.getByRole("button", { name: "순서 열기" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("button", { name: "취소" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("조회 응답이 늦어도 기존 임시 순서를 불러와 편집한다", async () => {
    let resolve!: (value: { active: boolean; ids: string[]; until: string | null }) => void;
    api.getOverride.mockImplementation(() => new Promise((r) => { resolve = r; }));
    setup();
    resolve({ active: true, ids: ["B", "A"], until: new Date(Date.now() + 3600_000).toISOString() });
    await waitFor(() => {
      const list = screen.getByRole("list", { name: "임시 순서" });
      expect(within(list).getAllByRole("listitem")[0].textContent).toContain("B");
    });
  });

  it("위아래 버튼으로 회사 임시 순서만 바꾸고 저장한다", async () => {
    setup("work");
    fireEvent.click(await screen.findByRole("button", { name: "A 아래로" }));
    const list = screen.getByRole("list", { name: "임시 순서" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toContain("B");
    expect((screen.getByRole("button", { name: "B 위로" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "A 아래로" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() => expect(api.putOverride).toHaveBeenCalledWith(["B", "A"], expect.any(String), "work"));
  });
});
