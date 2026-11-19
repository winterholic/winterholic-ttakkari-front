import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyIssued } from "../../api/contextSharingTypes";
import { BETA, GW_OK } from "./testFixtures";

const api = vi.hoisted(() => ({
  SHARE_PROJECTS_KEY: ["context-sharing", "projects"], SHARE_SITE_KEY: ["context-sharing", "site"],
  shareKeysKey: (slug = "") => ["context-sharing", "keys", slug],
  shareDraftKey: (id: string) => ["context-sharing", "draft", id],
  shareSourcesKey: (id: string) => ["context-sharing", "sources", id],
  shareDraftsKey: (id: string) => ["context-sharing", "drafts", id],
  shareLinksKey: (slug: string) => ["context-sharing", "links", slug],
  shareProjects: vi.fn(), getSite: vi.fn(), listKeys: vi.fn(), listLinks: vi.fn(),
  shareSources: vi.fn(), listDrafts: vi.fn(), issueKey: vi.fn(),
  createDraft: vi.fn(), getDraft: vi.fn(), patchDraft: vi.fn(), patchSite: vi.fn(), publishDraft: vi.fn(),
  revokeKey: vi.fn(), revokeProject: vi.fn(),
}));

vi.mock("../../api/contextSharing", () => api);
import { ContextSharingPage } from "../../pages/ContextSharingPage";

const rawKey = "tkgw_SYNTHETIC_CLIPBOARD_FAILURE_KEY";
const issued = (): KeyIssued => ({
  id: "synthetic-key", project_slug: BETA.slug!, label: "acceptance key", status: "active",
  single_use: false, credential_type: "reusable_api_v2", ttl_seconds: 259200,
  scopes: ["read", "search"], snapshot_policy: "pinned", usage_status: "available",
  issued_at: "2026-11-19T00:00:00Z", expires_at: "2026-11-22T00:00:00Z", revoked_at: null,
  publication_id: "synthetic-publication",
  key: rawKey, connect: { url: "https://ctx.example.test", project_id: "synthetic-gateway-project", note: "synthetic" },
});

describe("reusable API key clipboard failure acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.shareProjects.mockResolvedValue({ gateway: GW_OK, projects: [BETA] });
    api.getSite.mockResolvedValue({ enabled: true, public_url: "https://share.example.test" });
    api.listKeys.mockResolvedValue({ keys: [] });
    api.listLinks.mockResolvedValue({ links: [] });
    api.shareSources.mockResolvedValue({ sources: [] });
    api.listDrafts.mockResolvedValue({ drafts: [], total: 0, limit: 50, offset: 0 });
    api.issueKey.mockResolvedValue(issued());
  });

  it("clipboard reject 후 발급 원문과 연결 공개를 제거한다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/context-sharing?project=e-beta"]}>
      <Routes><Route path="/context-sharing" element={<ContextSharingPage />} /></Routes>
    </MemoryRouter></QueryClientProvider>);

    const panel = within(await screen.findByRole("region", { name: "프로그램용 API Key" }));
    fireEvent.click(panel.getByRole("button", { name: "재사용 API Key 발급" }));
    const reveal = await screen.findByRole("region", { name: "발급된 키" });
    expect(within(reveal).getByText(rawKey)).toBeTruthy();
    fireEvent.click(within(reveal).getByRole("button", { name: "키 복사 후 원문 지우기" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(rawKey)).toBeNull());
    expect(screen.queryByRole("region", { name: "발급된 키" })).toBeNull();
    expect(writeText).toHaveBeenCalledWith(rawKey);
    expect(api.issueKey).toHaveBeenCalledTimes(1);
  });
});
