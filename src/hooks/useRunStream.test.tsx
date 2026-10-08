import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { RunEvent } from "../api/types";

const runEvents = vi.fn();
let emit: (e: RunEvent) => void = () => {};
let end: () => void = () => {};
const unsubscribe = vi.fn();
const subscribeRun = vi.fn((_id: string, h: { onEvent: (e: RunEvent) => void; onEnd?: () => void }) => {
  emit = h.onEvent;
  end = h.onEnd ?? (() => {});
  return unsubscribe;
});

vi.mock("../api/client", () => ({ runEvents: (...a: unknown[]) => runEvents(...a) }));
vi.mock("../api/stream", () => ({ subscribeRun: (...a: [string, never]) => subscribeRun(...a) }));

import { useRunStream } from "./useRunStream";

const ev = (seq: number, type = "message", payload: unknown = { text: `m${seq}` }) =>
  ({ seq, type, payload, created_at: "2026-01-01T00:00:00Z" }) as RunEvent;

beforeEach(() => {
  runEvents.mockReset();
  subscribeRun.mockClear();
  unsubscribe.mockClear();
});

describe("useRunStream", () => {
  it("백필과 스트림이 겹쳐도 seq 중복을 제거하고 정렬한다", async () => {
    runEvents.mockResolvedValue([ev(1), ev(2)]);
    const { result, unmount } = renderHook(() => useRunStream("run-1"));
    await waitFor(() => expect(subscribeRun).toHaveBeenCalled());
    expect(subscribeRun.mock.calls[0][1]).toMatchObject({ after: 2 });

    act(() => {
      emit(ev(2)); // 백필과 중복
      emit(ev(4));
      emit(ev(3)); // 순서 뒤바뀜
      emit(ev(4)); // 재전송
    });
    expect(result.current.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);

    act(() => emit(ev(5, "run.finished", { status: "succeeded", error: null, result_text: null, cost_usd: null, exit_code: 0 })));
    expect(result.current.status).toBe("succeeded");
    expect(result.current.finished).toBe(true);

    act(() => end());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("runId 가 없으면 아무것도 하지 않는다", () => {
    const { result } = renderHook(() => useRunStream(null));
    expect(result.current.events).toEqual([]);
    expect(runEvents).not.toHaveBeenCalled();
  });
});
