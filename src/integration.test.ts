import { describe, expect, it } from "vitest";

// 실제 백엔드 통합 테스트. TTAKKARI_IT_BASE 가 있을 때만 돈다.
const base = process.env.TTAKKARI_IT_BASE;
const password = process.env.TTAKKARI_IT_PASSWORD ?? "";

describe.skipIf(!base)("백엔드 통합", () => {
  it("login -> workspaces -> systemInfo -> sessions", async () => {
    // client.ts 가 import 시점에 VITE_API_BASE 를 읽으므로 동적 import 전에 주입한다.
    const { vi } = await import("vitest");
    vi.stubEnv("VITE_API_BASE", base!);
    vi.resetModules();
    const c = await import("./api/client");
    const t = await c.login(password);
    expect(t.token_type).toBe("bearer");
    const ws = await c.listWorkspaces();
    expect(Array.isArray(ws)).toBe(true);
    const info = await c.systemInfo();
    expect(typeof info.max_concurrent_runs).toBe("number");
    expect(Array.isArray(await c.listSessions({ limit: 5 }))).toBe(true);
    console.log("IT workspaces:", ws.length, "engines:", JSON.stringify(info.engines));
    await expect(c.getWorkspace("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
  });
});
