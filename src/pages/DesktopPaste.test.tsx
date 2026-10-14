import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { createRun, uploadFile } from "../api/client";
import { DeskHome } from "./DeskHome";
import { NodePanel } from "../features/tasks/NodePanel";

vi.mock("../api/client", async (original) => ({
  ...await original<typeof import("../api/client")>(),
  ensureDesk: vi.fn(async () => ({ id: "desk", workspace_id: "workspace" })),
  getSession: vi.fn(async (id: string) => ({ id, workspace_id: "workspace" })),
  activeTasks: vi.fn(async () => ({ roots: [], nodes: [] })),
  taskTree: vi.fn(async () => ({ root_id: "node", nodes: [], path: [] })),
  listRuns: vi.fn(async () => []),
  uploadFile: vi.fn(async () => ({ id: "screenshot" })),
  createRun: vi.fn(async () => ({ id: "run" })),
}));
vi.mock("../features/canvas/TaskCanvas", () => ({ TaskCanvas: () => null }));
vi.mock("../features/viewer", () => ({
  ArtifactViewerHost: ({ children }: { children: React.ReactNode }) => children,
  useArtifactViewer: () => ({ open: vi.fn() }),
}));
vi.mock("../features/viewer/hooks", () => ({ useIsDesktop: () => true }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:screenshot");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

function setup(surface: "personal" | "work" | "node") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {surface === "node"
          ? <NodePanel nodeId="node" onSelect={() => {}} onClose={() => {}} onOpenArtifact={() => {}} />
          : <DeskHome pool={surface} />}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pasteScreenshot() {
  const box = await screen.findByLabelText("지시");
  const file = new File(["screenshot"], "image.png", { type: "image/png" });
  fireEvent.paste(box, { clipboardData: { types: ["Files"], files: [file], items: [] } });
  return box;
}

describe("데스크톱 실제 입력창의 이미지 첨부", () => {
  it.each(["personal", "work", "node"] as const)("%s: 붙여넣기 → 업로드 → 지시에 첨부 ID 전달", async (surface) => {
    setup(surface);
    const box = await pasteScreenshot();
    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
    const [file, workspace, session] = vi.mocked(uploadFile).mock.calls[0];
    expect(file.name).toMatch(/^paste-.*\.png$/);
    expect([workspace, session]).toEqual(["workspace", surface === "node" ? "node" : "desk"]);
    await screen.findByRole("img", { name: /^paste-/ });
    fireEvent.change(box, { target: { value: "이 캡처 확인해줘" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledWith(surface === "node" ? "node" : "desk", {
      prompt: "이 캡처 확인해줘", context_artifact_ids: ["screenshot"],
    }));
    await waitFor(() => expect(screen.queryByLabelText("함께 보낼 첨부")).toBeNull());
  });

  it("업로드 중 전송을 막고 실패하면 재시도한 이미지 ID를 보낸다", async () => {
    let failUpload!: (reason: Error) => void;
    vi.mocked(uploadFile).mockImplementationOnce(() => new Promise((_, reject) => { failUpload = reject; }));
    setup("node");
    const box = await pasteScreenshot();
    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
    fireEvent.change(box, { target: { value: "사진 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(createRun).not.toHaveBeenCalled();
    failUpload(new Error("업로드 연결 끊김"));
    await screen.findByText("실패한 첨부를 다시 올리거나 빼고 보내 주세요");
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(createRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /다시 올리기$/ }));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "보내기" }).getAttribute("aria-disabled")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledWith("node", { prompt: "사진 확인", context_artifact_ids: ["screenshot"] }));
  });

  it("전송 실패 시 본문과 첨부를 보존해 다시 보낼 수 있다", async () => {
    vi.mocked(createRun).mockRejectedValueOnce(new Error("전송 실패"));
    setup("personal");
    const box = await pasteScreenshot();
    await waitFor(() => expect(uploadFile).toHaveBeenCalledOnce());
    fireEvent.change(box, { target: { value: "다시 보낼 사진" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledOnce());
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe("다시 보낼 사진"));
    expect(screen.getByLabelText("함께 보낼 첨부")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createRun).mock.calls[1][1].context_artifact_ids).toEqual(["screenshot"]);
    await waitFor(() => expect(screen.queryByLabelText("함께 보낼 첨부")).toBeNull());
  });

  it("뺀 이미지는 다음 지시에 포함하지 않는다", async () => {
    setup("node");
    const box = await pasteScreenshot();
    await screen.findByRole("img", { name: /^paste-/ });
    fireEvent.click(screen.getByRole("button", { name: /빼기$/ }));
    fireEvent.change(box, { target: { value: "텍스트만" } });
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    await waitFor(() => expect(createRun).toHaveBeenCalledWith("node", { prompt: "텍스트만", context_artifact_ids: [] }));
  });
});
