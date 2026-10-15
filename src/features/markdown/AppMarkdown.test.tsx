import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { ApiError } from "../../api/client";
import type { ArtifactOut } from "../../api/types";
import { ToastRegion } from "../../ui/Toast";
import { clearToasts } from "../../ui/toastStore";
import { AppMarkdown } from "./AppMarkdown";

const resolve = vi.fn<(body: { path: string; workspace_id?: string | null; session_id?: string | null }) => Promise<ArtifactOut>>();
// vi.fn 이 거절된 Promise 를 따로 기록하다 처리되지 않은 거절로 보고하므로, 실패는 vi.fn 밖에서 만든다.
let failWith: unknown = null;
vi.mock("../../api/client", async (orig) => ({
  ...(await orig<typeof import("../../api/client")>()),
  resolveArtifactLink: (body: { path: string }) => (failWith ? Promise.reject(failWith) : resolve(body)),
}));

const OUTBOX = "/Users/winterholic/.ttakkari/data/outbox/cb85ebe7-5424-4088-bb0b-bf4653ba1d3e/aip-20261015-result.md";
const art = { id: "art-1" } as ArtifactOut;

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function setup(md: string, props: Partial<React.ComponentProps<typeof AppMarkdown>> = {}) {
  const onOpenArtifact = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={["/chat"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <AppMarkdown workspaceId="ws-1" sessionId="se-1" onOpenArtifact={onOpenArtifact} {...props}>
                {md}
              </AppMarkdown>
              <Where />
              <ToastRegion />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenArtifact, ...utils };
}

beforeEach(() => {
  resolve.mockReset();
  failWith = null;
});
afterEach(() => {
  cleanup();
  clearToasts();
});

describe("AppMarkdown 링크", () => {
  it("보고 메시지의 outbox 절대경로를 누르면 라우터로 가지 않고 결과물 뷰어를 연다", async () => {
    resolve.mockResolvedValue(art);
    const { onOpenArtifact } = setup(`[결과와 다음 과제](${OUTBOX})`);
    fireEvent.click(screen.getByRole("link", { name: "결과와 다음 과제" }));
    await waitFor(() => expect(onOpenArtifact).toHaveBeenCalledWith("art-1"));
    expect(resolve).toHaveBeenCalledWith({ path: OUTBOX, workspace_id: "ws-1", session_id: "se-1" });
    expect(screen.getByTestId("where").textContent).toBe("/chat");
  });

  it("file:// · ~ · 파일:줄 · 상대경로 · 꺾쇠 한글 경로를 모두 같은 방식으로 연다", async () => {
    resolve.mockResolvedValue(art);
    const cases: [string, string][] = [
      ["[a](file:///Users/me/a%20b.md)", "/Users/me/a b.md"],
      ["[a](~/work-history/2026-10-14.md)", "~/work-history/2026-10-14.md"],
      ["[a](/Users/me/p/runtime.py:59)", "/Users/me/p/runtime.py:59"],
      ["[a](src/features/chat/Messages.tsx:93)", "src/features/chat/Messages.tsx:93"],
      ["[a](./README.md)", "./README.md"],
      ["[a](</Users/me/결과 보고.md>)", "/Users/me/결과 보고.md"],
      ["[a](util.ts:12)", "util.ts:12"],
    ];
    for (const [md, path] of cases) {
      resolve.mockClear();
      const { onOpenArtifact, unmount } = setup(md);
      fireEvent.click(screen.getByRole("link", { name: "a" }));
      await waitFor(() => expect(onOpenArtifact, md).toHaveBeenCalledWith("art-1"));
      expect(resolve.mock.calls[0][0].path, md).toBe(path);
      unmount();
    }
  });

  it("뷰어에서 연 문서의 상대 링크는 그 문서의 폴더 기준으로 푼다", async () => {
    resolve.mockResolvedValue(art);
    setup("[adr](../adr/0001.md)", { baseDir: "docs/guides" });
    fireEvent.click(screen.getByRole("link", { name: "adr" }));
    await waitFor(() => expect(resolve).toHaveBeenCalled());
    expect(resolve.mock.calls[0][0].path).toBe("docs/adr/0001.md");
  });

  it("허용 폴더 밖이면 뷰어를 열지 않고 이유를 토스트로 알린다", async () => {
    failWith = new ApiError(403, { code: "outside_root", message: "허용된 폴더 밖의 파일이라 열 수 없습니다." });
    const { onOpenArtifact } = setup("[passwd](/etc/passwd)");
    fireEvent.click(screen.getByRole("link", { name: "passwd" }));
    expect(await screen.findByText("허용된 폴더 밖의 파일이라 열 수 없어요.")).toBeTruthy();
    expect(onOpenArtifact).not.toHaveBeenCalled();
    expect(screen.getByTestId("where").textContent).toBe("/chat");
  });

  it("외부 http(s) 링크는 새 탭으로, API 를 부르지 않는다", () => {
    setup("[docs](https://redis.io/docs/latest/management/persistence/)");
    const a = screen.getByRole("link", { name: "docs" });
    expect(a.getAttribute("href")).toBe("https://redis.io/docs/latest/management/persistence/");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(a);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("앱 내부 라우트는 라우터로 이동하고 파일 해석을 부르지 않는다", () => {
    setup("[라이브러리](/library)");
    fireEvent.click(screen.getByRole("link", { name: "라이브러리" }));
    expect(screen.getByTestId("where").textContent).toBe("/library");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("스크립트 스킴과 다른 호스트의 file 링크는 링크로 만들지 않는다", () => {
    setup("[x](javascript:alert(1)) [y](file://evil-host/etc/passwd)");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("x")).toBeTruthy();
  });

  it("뷰어가 없는 화면에서는 파일 링크를 눌리는 링크로 만들지 않는다", () => {
    setup(`[보고](${OUTBOX})`, { onOpenArtifact: undefined });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("보고").tagName).toBe("CODE");
  });
});
