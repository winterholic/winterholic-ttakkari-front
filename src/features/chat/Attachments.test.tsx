import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getArtifact = vi.fn();
const contentBlob = vi.fn();
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getArtifact: (...a: unknown[]) => getArtifact(...a),
  contentBlob: (...a: unknown[]) => contentBlob(...a),
}));

import { SentAttachments } from "./Attachments";

const base = { kind: "other", export_policy: "allow", size_bytes: 0 };
const arts: Record<string, object> = {
  a1: { ...base, id: "a1", filename: "사진.png", kind: "image", size_bytes: 2048 },
  a2: { ...base, id: "a2", filename: "보고서.pdf", kind: "pdf", size_bytes: 482_000 },
};

afterEach(cleanup);
beforeEach(() => {
  getArtifact.mockReset();
  contentBlob.mockReset();
  getArtifact.mockImplementation((id: string) => (arts[id] ? Promise.resolve(arts[id]) : Promise.reject(new Error("gone"))));
  contentBlob.mockResolvedValue(new Blob(["x"]));
  URL.createObjectURL = vi.fn(() => "blob:thumb");
});

function setup(ids: string[], onOpen = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SentAttachments ids={ids} onOpen={onOpen} />
    </QueryClientProvider>,
  );
  return onOpen;
}

describe("SentAttachments", () => {
  it("이미지는 썸네일, 그 외는 파일명·확장자·크기를 보여 준다", async () => {
    setup(["a1", "a2"]);
    const img = await screen.findByAltText("사진.png");
    await waitFor(() => expect(img.getAttribute("src")).toBe("blob:thumb"));
    expect(screen.getByText("보고서.pdf")).toBeTruthy();
    expect(screen.getByText("pdf")).toBeTruthy();
    expect(screen.getByText("471 KB")).toBeTruthy();
    expect(screen.queryByText("함께 보낸 파일")).toBeNull();
  });

  it("탭하면 해당 결과물 ID 로 열기를 부른다", async () => {
    const onOpen = setup(["a2"]);
    fireEvent.click(await screen.findByRole("button", { name: "보고서.pdf 열기" }));
    expect(onOpen).toHaveBeenCalledWith("a2");
  });

  it("조회가 실패한 파일은 열 수 없다고 표시한다", async () => {
    setup(["zz"]);
    expect(await screen.findByText("지워졌거나 열 수 없는 파일")).toBeTruthy();
  });
});
