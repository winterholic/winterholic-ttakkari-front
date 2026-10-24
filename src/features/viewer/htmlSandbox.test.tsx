// 보안 계약 고정: HTML 결과물 미리보기는 sandbox="" (스크립트·외부 요청·같은 출처 모두 끔)로만 열린다.
// 보고서가 mermaid 같은 스크립트로 그림을 그리는 문서여도 앱은 이 계약을 풀지 않는다. 풀려면 이 테스트가 먼저 깨져야 한다.
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtifactOut } from "../../api/types";
import { ArtifactViewer } from "./ArtifactViewer";

const html: ArtifactOut = {
  id: "a-html", workspace_id: null, session_id: null, run_id: null, filename: "report.html", mime_type: "text/html", kind: "html",
  source: "agent_output", area: "files", rel_path: null, storage_mode: "copy", size_bytes: 85410, sha256: "0", preview_status: "not_required",
  preview_mime: null, preview_error: null, export_policy: "allow", downloadable: true, retention_until: null, created_at: "2026-10-24T11:53:37Z",
};

vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  inlineViewLink: vi.fn(async () => ({ url: "https://api.example.test/api/view/tok", expires_at: "2026-10-24T12:00:00Z" })),
}));

afterEach(cleanup);

describe("HTML 미리보기 격리", () => {
  it("iframe 은 빈 sandbox 와 no-referrer 로 열리고 안내 문구가 있다", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <ArtifactViewer artifactId="a-html" initial={html} onClose={() => {}} />
      </QueryClientProvider>,
    );
    const frame = await screen.findByTitle("report.html 격리 미리보기");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.textContent).toContain("격리된 미리보기 · 스크립트·외부 요청 꺼짐");
  });
});
