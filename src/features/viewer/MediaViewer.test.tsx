import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactOut } from "../../api/types";
import { ArtifactViewer } from "./ArtifactViewer";

const media = (kind: "video" | "audio", filename: string): ArtifactOut => ({
  id: `a-${kind}`, workspace_id: "w1", session_id: "s1", run_id: "r1", filename, mime_type: kind === "video" ? "video/mp4" : "audio/wav", kind,
  source: "agent_output", area: "files", rel_path: filename, storage_mode: "copy", size_bytes: 2_500_000, sha256: "0", preview_status: "not_required",
  preview_mime: null, preview_error: null, export_policy: "allow", downloadable: true, retention_until: null, created_at: "2026-10-18T09:00:00Z",
});

const h = vi.hoisted(() => ({ art: undefined as ArtifactOut | undefined, link: vi.fn(), fail: false }));
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getArtifact: vi.fn(async () => h.art),
}));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), inlineViewLink: async (...a: unknown[]) => { if (h.fail) throw new Error("403"); return h.link(...a); } }));

function open(a: ArtifactOut) {
  h.art = a;
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><ArtifactViewer artifactId={a.id} initial={a} onClose={() => {}} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.fail = false;
  h.link.mockResolvedValue({ url: "http://api.test/api/view/tok", expires_at: "2099-01-01T00:00:00Z" });
});
afterEach(cleanup);

describe("영상·오디오 뷰어", () => {
  it("영상은 서명된 inline 링크를 소스로 재생 컨트롤과 함께 그린다", async () => {
    const { container } = open(media("video", "clip.mp4"));
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe("http://api.test/api/view/tok");
    expect(video.controls).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(h.link).toHaveBeenCalledWith("a-video");
    expect(screen.getByText(/MP4 · 2\.4 MB/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "원본 다운로드" })).toBeTruthy();
  });

  it("오디오는 audio 요소로 그린다", async () => {
    const { container } = open(media("audio", "tone.wav"));
    await waitFor(() => expect(container.querySelector("audio")).not.toBeNull());
    expect((container.querySelector("audio") as HTMLAudioElement).controls).toBe(true);
    expect(container.querySelector("video")).toBeNull();
  });

  it("링크를 받지 못하면 오류와 다시 시도를 보인다", async () => {
    h.fail = true;
    open(media("video", "clip.mp4"));
    expect(await screen.findByRole("button", { name: /다시 시도/ })).toBeTruthy();
    expect(screen.getByText("403")).toBeTruthy();
  });
});
