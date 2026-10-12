// 재현 고정: 배포가 바뀐 뒤 열려 있던 PWA 에서 코드 결과물을 열면 CodeView 청크 자리에 index.html 이 온다.
// 예전 번들은 이 예외로 React 루트가 통째로 비어 아무것도 누를 수 없었다(WebKit iPhone 실측, rootChildren 0).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactOut } from "../../api/types";
import { resetUpdateStateForTest } from "../../pwaUpdate";
import { ArtifactViewerHost } from "./ArtifactViewerHost";

// factory 에서 던지면 vitest 가 자기 메시지로 감싸 버린다. lazy 로 받은 렌더러가 그리는 순간 브라우저와 같은 오류를 던지게 한다.
// 에러 바운더리 입장에서는 import 실패와 같은 길(Suspense 아래 렌더 예외)이다.
vi.mock("./renderers/CodeView", () => ({
  default: (): never => {
    throw new TypeError("'text/html' is not a valid JavaScript MIME type for module script 'https://ttakkari.winterholic.net/assets/CodeView-rIthwTs5.js'.");
  },
}));

const code: ArtifactOut = {
  id: "a-ts", workspace_id: "w1", session_id: "s1", run_id: "r1", filename: "Dialog.tsx", mime_type: "text/x-typescript", kind: "code",
  source: "agent_modified", rel_path: "front/src/ui/Dialog.tsx", storage_mode: "copy", size_bytes: 120, sha256: "0", preview_status: "not_required",
  preview_mime: null, preview_error: null, export_policy: "allow", downloadable: true, retention_until: null, created_at: "2026-10-12T09:00:00Z",
};

vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  getArtifact: vi.fn(async () => code),
  contentBlob: vi.fn(async () => new Blob(["export const a = 1;\n"])),
}));

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  cleanup();
  resetUpdateStateForTest();
  vi.restoreAllMocks();
});

describe("배포 직후 코드 뷰어 청크를 못 받을 때", () => {
  it("화면이 비지 않고 다시 읽기·닫기가 남으며, 닫으면 목록으로 돌아온다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    resetUpdateStateForTest(reload);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/library?artifact=a-ts"]}>
          <ArtifactViewerHost resolveInitial={() => code}>
            <button type="button">목록 행</button>
          </ArtifactViewerHost>
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toContain("새 버전으로 바뀌어");
    expect(alert.getAttribute("data-viewer-error")).toBe("stale");
    expect(document.querySelector("dialog.tk-viewer-dialog")?.hasAttribute("open")).toBe(true);
    // 툴바(뒤로)도 그대로 있다.
    expect(screen.getByRole("button", { name: "목록으로" })).toBeTruthy();

    fireEvent.click(within(alert).getByRole("button", { name: "다시 읽기" }));
    expect(reload).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: "닫기" }));
    });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/library"));
    expect(document.querySelector("dialog.tk-viewer-dialog")?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("button", { name: "목록 행" })).toBeTruthy();
  });
});
