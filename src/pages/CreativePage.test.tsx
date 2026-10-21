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

test("format selection changes default aspect and duration, template selection updates scene", async () => {
  const catalog = {
    formats: [
      {
        id: "shorts_9_16",
        name: "9:16 모바일 쇼츠",
        description: "쇼츠 포맷 설명",
        allowed_aspects: ["9:16"],
        default_aspect: "9:16",
        min_duration: 10,
        max_duration: 60,
        default_duration: 30,
        min_scenes: 3,
        max_scenes: 15,
        has_hook: true,
        default_scene_templates: ["intro_hook", "outro"],
        pacing: "fast",
      },
    ],
    templates: [
      {
        id: "intro_hook",
        name: "인트로 훅",
        description: "시선 집중용 훅",
        category: "hook",
        default_duration: 3,
        min_duration: 1.5,
        max_duration: 6,
        default_animation: "zoom_in",
        allowed_animations: ["zoom_in"],
        default_transition: "cut",
        allowed_transitions: ["cut"],
        default_caption_style: "center_highlight",
        allowed_caption_styles: ["center_highlight"],
        max_caption_lines: 2,
        max_caption_chars: 40,
      },
      {
        id: "outro",
        name: "아웃트로 / 마무리",
        description: "마무리 장면",
        category: "ending",
        default_duration: 4,
        min_duration: 2,
        max_duration: 10,
        default_animation: "zoom_out",
        allowed_animations: ["zoom_out"],
        default_transition: "fade",
        allowed_transitions: ["fade"],
        default_caption_style: "title_card",
        allowed_caption_styles: ["title_card"],
        max_caption_lines: 2,
        max_caption_chars: 60,
      },
    ],
    tools: [],
  };

  const project = {
    id: "format-project",
    revision: 1,
    name: "포맷 프로젝트",
    brief: "",
    style: "",
    aspect: "9:16",
    duration: 30,
    music_asset_id: null,
    scenes: [
      {
        id: "s1",
        duration: 15,
        prompt: "장면 1",
        caption: "훅",
        asset_id: null,
        template_id: "intro_hook",
        animation: "zoom_in",
        transition: "cut",
        caption_style: "center_highlight",
      },
    ],
    assets: [],
    render_jobs: [],
    generation_jobs: [],
  };

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let patchShouldFail422 = false;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/catalog")) {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      if (init?.method === "POST" && url.endsWith("/projects")) {
        return new Response(JSON.stringify(project), { status: 201 });
      }
      if (init?.method === "PATCH") {
        if (patchShouldFail422) {
          return new Response(
            JSON.stringify({ detail: "규격 검증 오류: 자막 줄 수 초과" }),
            {
              status: 422,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify(project), { status: 200 });
      }
      if (url.endsWith("/projects")) {
        return new Response(JSON.stringify([project]), { status: 200 });
      }
      return new Response(JSON.stringify(project), { status: 200 });
    }),
  );

  // 1. 포맷 선택 시 POST 본문의 format_id 검증
  const client1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount: unmountCreate } = render(
    <QueryClientProvider client={client1}>
      <MemoryRouter>
        <CreativePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findByText("어떤 이야기를 만들까요?");
  fireEvent.change(screen.getByLabelText("프로젝트 이름"), {
    target: { value: "쇼츠 만들기" },
  });
  fireEvent.change(screen.getByLabelText("콘텐츠 포맷"), {
    target: { value: "shorts_9_16" },
  });
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 만들기" }));

  await waitFor(() => {
    const postCall = calls.find(
      (c) => c.init?.method === "POST" && c.url.endsWith("/projects"),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall!.init!.body as string);
    expect(body.format_id).toBe("shorts_9_16");
    expect(body.aspect).toBe("9:16");
  });

  unmountCreate();

  // 2. 템플릿 교체 시 장면 길이 보정(clamp) 및 PATCH 본문의 template_id 검증
  const client2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client2}>
      <MemoryRouter initialEntries={["/creative/format-project"]}>
        <Routes>
          <Route path="/creative/:id" element={<CreativeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await screen.findAllByText("인트로 훅");
  const templateSelect = screen.getByLabelText("장면 템플릿 (부품)");
  expect(templateSelect).toBeDefined();

  // 템플릿을 outro로 교체 (max_duration 10으로 clamp 검증)
  fireEvent.change(templateSelect, { target: { value: "outro" } });

  // 변경 저장 버튼 클릭
  const saveBtn = screen.getByRole("button", { name: "변경 저장" });
  fireEvent.click(saveBtn);

  await waitFor(() => {
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    const body = JSON.parse(patchCall!.init!.body as string);
    expect(body.scenes[0].template_id).toBe("outro");
    expect(body.scenes[0].duration).toBe(10);
  });

  // 3. 422 시 오류 표시 검증
  patchShouldFail422 = true;
  fireEvent.change(templateSelect, { target: { value: "intro_hook" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

  const alertMsg = await screen.findByRole("alert");
  expect(alertMsg.textContent).toContain("규격 검증 오류");
});

test("template change clamps up to lower bound and preserves in-range length", async () => {
  const catalog = {
    formats: [],
    templates: [
      {
        id: "intro_hook",
        name: "인트로 훅",
        description: "시선 집중용 훅",
        category: "hook",
        default_duration: 3,
        min_duration: 1.5,
        max_duration: 6,
        default_animation: "zoom_in",
        allowed_animations: ["zoom_in"],
        default_transition: "cut",
        allowed_transitions: ["cut"],
        default_caption_style: "center_highlight",
        allowed_caption_styles: ["center_highlight"],
        max_caption_lines: 2,
        max_caption_chars: 40,
      },
      {
        id: "outro",
        name: "아웃트로 / 마무리",
        description: "마무리 장면",
        category: "ending",
        default_duration: 4,
        min_duration: 2,
        max_duration: 10,
        default_animation: "zoom_out",
        allowed_animations: ["zoom_out"],
        default_transition: "fade",
        allowed_transitions: ["fade"],
        default_caption_style: "title_card",
        allowed_caption_styles: ["title_card"],
        max_caption_lines: 2,
        max_caption_chars: 60,
      },
    ],
    tools: [],
  };

  const sceneOf = (duration: number, template_id: string) => ({
    id: "s1",
    duration,
    prompt: "장면 1",
    caption: "자막",
    asset_id: null,
    template_id,
    animation: "zoom_in",
    transition: "cut",
    caption_style: "center_highlight",
  });
  const projectOf = (id: string, duration: number, template_id: string) => ({
    id,
    revision: 1,
    name: id,
    brief: "",
    style: "",
    aspect: "9:16",
    duration: 30,
    music_asset_id: null,
    scenes: [sceneOf(duration, template_id)],
    assets: [],
    render_jobs: [],
    generation_jobs: [],
  });
  const lowProject = projectOf("clamp-low", 1, "outro");
  const midProject = projectOf("clamp-mid", 5, "intro_hook");

  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("/catalog")) {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      const project = url.includes("clamp-mid") ? midProject : lowProject;
      return new Response(JSON.stringify(project), { status: 200 });
    }),
  );

  const renderDetail = (id: string) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/creative/${id}`]}>
          <Routes>
            <Route path="/creative/:id" element={<CreativeDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };
  const lastPatchBody = () => {
    const patchCalls = calls.filter((c) => c.init?.method === "PATCH");
    expect(patchCalls.length).toBeGreaterThan(0);
    return JSON.parse(patchCalls[patchCalls.length - 1].init!.body as string);
  };

  // 하한: 1초 장면을 intro_hook(1.5~6초)으로 교체하면 1.5초로 올라간다
  const { unmount } = renderDetail("clamp-low");
  await screen.findAllByText("아웃트로 / 마무리");
  fireEvent.change(screen.getByLabelText("장면 템플릿 (부품)"), {
    target: { value: "intro_hook" },
  });
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
  await waitFor(() => {
    const body = lastPatchBody();
    expect(body.scenes[0].template_id).toBe("intro_hook");
    expect(body.scenes[0].duration).toBe(1.5);
  });
  unmount();

  // 범위내 보존: 5초 장면을 outro(2~10초)로 교체하면 5초 그대로
  renderDetail("clamp-mid");
  await screen.findAllByText("인트로 훅");
  fireEvent.change(screen.getByLabelText("장면 템플릿 (부품)"), {
    target: { value: "outro" },
  });
  fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
  await waitFor(() => {
    const body = lastPatchBody();
    expect(body.scenes[0].template_id).toBe("outro");
    expect(body.scenes[0].duration).toBe(5);
  });
});
