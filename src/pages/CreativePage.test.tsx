import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { CreativePage, CreativeDetailPage } from "./CreativePage";

vi.mock("../shell/PageHeader", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("an imported scene clip can be previewed before rendering", async () => {
  const project = {
    id: "clip-project",
    revision: 1,
    name: "클립 영상",
    brief: "",
    style: "",
    aspect: "16:9",
    duration: 5,
    music_asset_id: null,
    scenes: [
      {
        id: "scene",
        duration: 5,
        prompt: "",
        caption: "",
        asset_id: "clip",
        animation: "still",
        transition: "cut",
      },
    ],
    assets: [
      {
        id: "clip",
        kind: "video",
        name: "내 영상",
        provenance: "user-upload",
        sha256: "hash",
        metadata: {},
      },
    ],
    render_jobs: [],
    generation_jobs: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("media-link") ? { url: "/clip.mp4" } : project,
          ),
          { status: 200 },
        ),
    ),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/creative/clip-project"]}>
        <Routes>
          <Route path="/creative/:id" element={<CreativeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const clip = await screen.findByLabelText("선택한 장면");
  expect(clip.tagName).toBe("VIDEO");
  expect(clip.getAttribute("controls")).not.toBeNull();
});

test("new creators see an empty studio and can create a project", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify(init?.method === "POST" ? { id: "new-project" } : []),
        { status: init?.method === "POST" ? 201 : 200 },
      );
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <CreativePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("첫 영상을 만들어 보세요");
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "달빛 여행" },
  });
  fireEvent.change(screen.getByLabelText("만들고 싶은 콘텐츠"), {
    target: { value: "작은 로봇이 새벽으로 향하는 영상" },
  });
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.init?.method === "POST" &&
          c.init.body?.toString().includes("달빛 여행"),
      ),
    ).toBe(true),
  );
});
