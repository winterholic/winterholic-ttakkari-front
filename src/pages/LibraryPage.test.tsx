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
  id, workspace_id: "w1", session_id: "s1", run_id: null, filename: `${id}.bin`, mime_type: "application/octet-stream", kind: "other", category: "other",
  source: area === "files" ? "upload" : "agent_output", origin: area === "files" ? "user" : "agent", area, keep_reason: area === "files" ? "direct_upload" : null,
  rel_path: `${id}.bin`, storage_mode: "copy", size_bytes: 10, sha256: "0",
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
  };
  h.listArtifacts.mockReset();
  h.moveArtifact.mockReset();
  h.getArtifact.mockReset();
  h.listArtifacts.mockImplementation(async (p: { area?: string }) =>
    p.area === "agent" ? [art("work", "agent")] : p.area === "all" ? [art("mine", "files"), art("work", "agent")] : [art("mine", "files")],
  );
});
afterEach(cleanup);

describe("보관함 3개 탭 및 카테고리 필터", () => {
  it("기본은 내 보관함 탭이고 사용자 보관 파일 목록만 요청한다", async () => {
    mount();
    expect(await screen.findByText("mine.bin")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "내 보관함" }) as HTMLInputElement).checked).toBe(true);
    expect(lastParams()).toMatchObject({ area: "files" });
    expect(lastParams()).not.toHaveProperty("changed", true);
    expect(screen.queryByText("work.bin")).toBeNull();
  });

  it("AI 작업 파일 탭을 누르면 AI 작업 파일만 보이고 주소가 기억한다", async () => {
    mount();
    await screen.findByText("mine.bin");
    fireEvent.click(screen.getByRole("radio", { name: "AI 작업 파일" }));
    expect(await screen.findByText("work.bin")).toBeTruthy();
    expect(lastParams()).toMatchObject({ area: "agent" });
    expect(screen.getByTestId("where").textContent).toBe("/library?tab=agent");
    expect(screen.queryByText("mine.bin")).toBeNull();
  });

  it("전체 탭을 누르면 전체 파일이 보이고 주소가 ?tab=all 로 바뀐다", async () => {
    mount();
    await screen.findByText("mine.bin");
    fireEvent.click(screen.getByRole("radio", { name: "전체" }));
    expect(await screen.findByText("work.bin")).toBeTruthy();
    expect(lastParams()).toMatchObject({ area: "all" });
    expect(screen.getByTestId("where").textContent).toBe("/library?tab=all");
  });

  it("?tab=agent 로 들어오면 AI 작업 파일 탭이 열려 있다", async () => {
    mount("/library?tab=agent");
    expect(await screen.findByText("work.bin")).toBeTruthy();
    expect((screen.getByRole("radio", { name: "AI 작업 파일" }) as HTMLInputElement).checked).toBe(true);
  });

  it("비어 있으면 탭마다 맞는 안내를 보여 준다", async () => {
    h.listArtifacts.mockResolvedValue([]);
    mount();
    expect(await screen.findByText("아직 내 보관함에 보관된 파일이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "AI 작업 파일" }));
    expect(await screen.findByText("AI 작업 파일이 없어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "전체" }));
    expect(await screen.findByText("아직 파일이 없어요")).toBeTruthy();
  });

  it("AI 작업 파일을 열어 내 보관함에 보관할 수 있다", async () => {
    const a = art("work", "agent");
    h.getArtifact.mockResolvedValue(a);
    h.moveArtifact.mockResolvedValue({ ...a, area: "files" });
    mount("/library?tab=agent&artifact=work");
    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));
    fireEvent.click(await screen.findByRole("button", { name: /^내 보관함에 보관/ }));
    await waitFor(() => expect(h.moveArtifact).toHaveBeenCalledWith("work", "files"));
    expect(await screen.findByText(/work.bin 을\(를\) 내 보관함에 보관했어요/)).toBeTruthy();
  });

  it("내 보관함 항목은 내 보관함에서 빼기 항목이 나온다", async () => {
    const a = art("mine", "files");
    h.getArtifact.mockResolvedValue(a);
    h.moveArtifact.mockResolvedValue({ ...a, area: "agent" });
    mount("/library?artifact=mine");
    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));
    const btn = await screen.findByRole("button", { name: /내 보관함에서 빼기/ });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(h.moveArtifact).toHaveBeenCalledWith("mine", "agent"));
    expect(await screen.findByText(/mine.bin 을\(를\) 내 보관함에서 뺐어요/)).toBeTruthy();
  });

  it("카테고리 칩을 누르면 category 파라미터가 서버에 전달된다", async () => {
    mount();
    await screen.findByText("mine.bin");
    fireEvent.click(screen.getByRole("button", { name: /동영상/ }));
    expect(lastParams()).toMatchObject({ category: "video" });
    fireEvent.click(screen.getByRole("button", { name: /오디오/ }));
    expect(lastParams()).toMatchObject({ category: "audio" });
    fireEvent.click(screen.getByRole("button", { name: /압축파일/ }));
    expect(lastParams()).toMatchObject({ category: "archive" });
    fireEvent.click(screen.getByRole("button", { name: /표·데이터/ }));
    expect(lastParams()).toMatchObject({ category: "spreadsheet" });
  });

  it("출처가 unknown인 경우 '출처 미확인' 배지가 표시된다", async () => {
    const unknownArt = art("unknown-file", "agent", { origin: "unknown" as any });
    h.listArtifacts.mockResolvedValue([unknownArt]);
    mount("/library?tab=agent");
    expect(await screen.findByText("unknown-file.bin")).toBeTruthy();
    expect(screen.getByText("출처 미확인")).toBeTruthy();
  });

  it("내 보관함 탭에서만 보관 사유 배지가 표시된다", async () => {
    const keptArt = art("kept-file", "files", { keep_reason: "chat_request" });
    const agentArt = art("agent-file", "agent", { keep_reason: null });
    h.listArtifacts.mockImplementation(async (p: { area?: string }) =>
      p.area === "files" ? [keptArt] : [agentArt]
    );
    mount("/library");
    expect(await screen.findByText("kept-file.bin")).toBeTruthy();
    expect(screen.getByText("보관 요청")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "AI 작업 파일" }));
    expect(await screen.findByText("agent-file.bin")).toBeTruthy();
    expect(screen.queryByText("보관 요청")).toBeNull();
  });

  it("상세 더보기 모달에서 출처·보관사유·보관일시·보관지시문·세션링크가 보인다", async () => {
    const detailedArt = art("detail-file", "files", {
      origin: "unknown" as any,
      keep_reason: "chat_request",
      session_id: "s1",
      created_at: "2026-10-25T01:00:00Z",
      keep_evidence: {
        session_id: "s1",
        run_id: "r1",
        instruction: "보관함에 꼭 넣어줘",
        requested_at: "2026-10-25T01:00:00Z",
      },
    });
    h.getArtifact.mockResolvedValue(detailedArt);
    mount("/library?artifact=detail-file");
    fireEvent.click(await screen.findByRole("button", { name: "더보기" }));

    expect(await screen.findByText("출처 미확인")).toBeTruthy();
    expect(screen.getByText("보관 요청")).toBeTruthy();
    expect(screen.getByText(/보관함에 꼭 넣어줘/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "대화 바로가기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /내 보관함에서 빼기 \(파일은 AI 작업 파일에 남아요\)/ })).toBeTruthy();
  });
});
