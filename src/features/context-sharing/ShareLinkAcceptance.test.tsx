import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinkIssued, ShareProject } from "../../api/contextSharingTypes";
import { ShareLinkPanel } from "./ShareLinkPanel";

const api = vi.hoisted(() => ({
  SHARE_PROJECTS_KEY: ["context-sharing", "projects"],
  shareLinksKey: (slug: string) => ["context-sharing", "links", slug],
  listLinks: vi.fn(),
  issueLink: vi.fn(),
  revokeLink: vi.fn(),
}));

vi.mock("../../api/contextSharing", () => api);

const project: ShareProject = {
  entity_id: "synthetic-entity",
  name: "UI synthetic acceptance",
  aliases: [],
  summary: "synthetic only",
  scope: "personal",
  source_count: 1,
  document_count: 1,
  slug: "ui-synthetic-acceptance",
  publication: {
    id: "synthetic-publication", status: "active", draft_id: "synthetic-draft",
    digest: "a".repeat(64), snapshot_id: "synthetic-snapshot",
    published_at: "2026-11-19T00:00:00Z", revoked_at: null,
  },
  active_key_count: 0,
  active_link_count: 0,
};

const issued = (): LinkIssued => ({
  id: "synthetic-link", project_slug: project.slug!, label: "acceptance link", status: "active",
  ttl_seconds: 259200, credential_type: "share_link_v2", snapshot_policy: "pinned",
  pinned_snapshot_id: "synthetic-snapshot", scopes: ["read"], last_used_at: null,
  usage_status: "available", issued_at: "2026-11-19T00:00:00Z",
  expires_at: "2026-11-22T00:00:00Z", revoked_at: null,
  publication_id: "synthetic-publication", url: "https://share.example.test/s#token=SYNTHETIC_ONLY",
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ShareLinkPanel project={project} /></QueryClientProvider>);
}

describe("share-link issue acceptance edges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listLinks.mockResolvedValue({ links: [] });
  });

  it("pending 발급 중 두 번째 클릭을 보내지 않고 기본 3일 요청을 유지한다", async () => {
    let finish!: (value: LinkIssued) => void;
    api.issueLink.mockImplementation(() => new Promise<LinkIssued>((resolve) => { finish = resolve; }));
    renderPanel();
    const panel = within(screen.getAllByRole("region", { name: "사람용 공유 링크" })[0]);
    fireEvent.change(panel.getByLabelText("링크 이름"), { target: { value: "acceptance link" } });
    const submit = panel.getByRole("button", { name: "공유 링크 생성" }) as HTMLButtonElement;
    fireEvent.click(submit);
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(api.issueLink).toHaveBeenCalledTimes(1);
    expect(api.issueLink).toHaveBeenCalledWith({
      project_slug: project.slug, label: "acceptance link", ttl_days: 3,
      snapshot_policy: "pinned", allow_export: false,
    });
    await act(async () => { finish(issued()); });
    expect(await screen.findByRole("region", { name: "발급된 공유 링크" })).toBeTruthy();
  });

  it("클립보드 쓰기가 실패하면 발급 URL을 지우고 다시 보이지 않게 한다", async () => {
    const rawUrl = issued().url;
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    api.issueLink.mockResolvedValue(issued());
    renderPanel();
    const panel = within(screen.getAllByRole("region", { name: "사람용 공유 링크" })[0]);
    fireEvent.change(panel.getByLabelText("링크 이름"), { target: { value: "acceptance link" } });
    fireEvent.click(panel.getByRole("button", { name: "공유 링크 생성" }));
    const reveal = await screen.findByRole("region", { name: "발급된 공유 링크" });
    expect(within(reveal).getByText(rawUrl)).toBeTruthy();
    fireEvent.click(within(reveal).getByRole("button", { name: "링크 복사 후 원문 지우기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("클립보드에 복사하지 못해 원문을 지웠습니다");
    expect(screen.queryByText(rawUrl)).toBeNull();
    expect(screen.queryByRole("region", { name: "발급된 공유 링크" })).toBeNull();
    expect(api.issueLink).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(rawUrl);
  });
});
