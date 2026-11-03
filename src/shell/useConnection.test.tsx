import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HEALTH_RETRIES, HEALTH_RETRY_DELAY_MS, useConnection } from "./useConnection";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useConnection", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("한 번 실패하고 곧바로 성공하면 끊김으로 보이지 않는다", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("timeout");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const { result } = renderHook(() => useConnection(true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.mac).toBe("online"), { timeout: HEALTH_RETRY_DELAY_MS + 3000 });
    expect(calls).toBe(2);
  });

  it("재시도까지 모두 실패해야 끊김이 된다", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("down");
    }) as typeof fetch;
    const { result } = renderHook(() => useConnection(true), { wrapper: wrapper() });
    expect(result.current.mac).toBe("checking");
    await waitFor(() => expect(result.current.mac).toBe("offline"), { timeout: HEALTH_RETRY_DELAY_MS * (HEALTH_RETRIES + 1) + 3000 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(HEALTH_RETRIES + 1);
  });
});
