import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import type { ArtifactOut } from "../api/types";

const h = vi.hoisted(() => ({ listArtifacts: vi.fn(), moveArtifact: vi.fn(), getArtifact: vi.fn() }));
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  listArtifacts: (...a: unknown[]) => h.listArtifacts(...a),
  moveArtifact: (...a: unknown[]) => h.moveArtifact(...a),
  getArtifact: (...a: unknown[]) => h.getArtifact(...a),
  contentBlob: vi.fn(async () => new Blob(["x"])),
}));
vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title, meta }: { title: string; meta?: string }) => (
    <header>
      <h1>{title}</h1>
      {meta && <p>{meta}</p>}
    </header>
  ),
}));

import { LibraryPage } from "./LibraryPage";

const art = (id: string, area: "files" | "agent", over: Partial<ArtifactOut> = {}): ArtifactOut => ({
  id, workspace_id: "w1", session_id: "s1", run_id: null, filename: `${id}.bin`, mime_type: "application/octet-stream", kind: "other",
  source: area === "files" ? "upload" : "agent_output", area, rel_path: `${id}.bin`, storage_mode: "copy", size_bytes: 10, sha256: "0",
  preview_status: "not_required", preview_mime: null, preview_error: null, export_policy: "allow", downloadable: true, retention_until: null,
  created_at: "2026-10-12T09:00:00Z", ...over,
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function mount(url = "/library") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LibraryPage />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastParams = () => h.listArtifacts.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  h.listArtifacts.mockReset();
  h.moveArtifact.mockReset();
  h.getArtifact.mockReset();
  h.listArtifacts.mockImplementation(async (p: { area?: string }) =>
    p.area === "agent" ? [art("work", "agent")] : [art("mine", "files")],
  );
});
afterEach(cleanup);

describe("보관함 파일 / 에이전트 파일", () => {
  it("기본은 파일 탭이고 사용자 파일 목록만 요청한다", async () => {
    mount();
    expect(await screen.findByText("mine.bin")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "파일" }) as HTMLInputElement).checked).toBe(true);
    expect(lastParams()).toMatchObject({ area: "files" });
    expect(lastParams()).not.toHaveProperty("changed", true);
    expect(screen.queryByText("work.bin")).toBeNull();
    // 예전 "변경된 파일" 칩은 에이전트 파일 탭으로 흡수됐다.
    expect(screen.queryByRole("button", { name: /변경된 파일/ })).toBeNull();
  });

  it("에이전트 파일 탭을 누르면 에이전트 파일만 보이고 주소가 기억한다", async () => {
    mount();
    await screen.findByText("mine.bin");
    fireEvent.click(screen.getByRole("radio", { name: "에이전트 파일" }));
    expect(await screen.findByText("work.bin")).toBeTruthy();
    expect(lastParams()).toMatchObject({ area: "agent" });
    expect(screen.getByTestId("where").textContent).toBe("/library?tab=agent");
    expect(screen.queryByText("mine.bin")).toBeNull();
  });

  it("?tab=agent 로 들어오면 에이전트 파일 탭이 열려 있다", async () => {
    mount("/library?tab=agent");
    expect(await screen.findByText("work.bin")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "에이전트 파일" }) as HTMLInputElement).checked).toBe(true);
  });

  it("비어 있으면 탭마다 맞는 안내를 보여 준다", async () => {
    h.listArtifacts.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("아직 파일이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "에이전트 파일" }));
    expect(await screen.findByText("에이전트 파일이 없어요")).toBeTruthy();
  });

  it("에이전트 파일을 열어 파일로 옮길 수 있다", async () => {
    const a = art("work", "agent");
    h.getArtifact.mockResolvedValue(a);
    h.moveArtifact.mockResolvedValue({ ...a, area: "files" });
    mount("/library?tab=agent&artifact=work");
    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));
    fireEvent.click(await screen.findByRole("button", { name: /^파일로 옮기기/ }));
    await waitFor(() => expect(h.moveArtifact).toHaveBeenCalledWith("work", "files"));
    expect(await screen.findByText(/work.bin 을\(를\) 파일로 옮겼어요/)).toBeTruthy();
  });

  it("파일 탭의 항목은 에이전트 파일로 옮기는 항목이 나온다", async () => {
    const a = art("mine", "files");
    h.getArtifact.mockResolvedValue(a);
    mount("/library?artifact=mine");
    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));
    expect(await screen.findByRole("button", { name: /에이전트 파일로 옮기기/ })).toBeTruthy();
  });
});
