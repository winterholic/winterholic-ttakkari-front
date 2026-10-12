import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SystemResources } from "../../api/client";
import { bytes, level, ResourcesDialog, uptime } from "./ResourcesDialog";

const api = vi.hoisted(() => ({ systemResources: vi.fn() }));
vi.mock("../../api/client", async (orig) => ({ ...(await orig<object>()), ...api }));

const GB = 1024 ** 3;
const sample: SystemResources = {
  collected_at: 1,
  host: { hostname: "mac.local", os: "macOS 27.0", model: "Mac17,14", boot_time: 0, uptime_seconds: 2 * 86400 + 3 * 3600 },
  cpu: { percent: 85, per_core: [95, 10], load_avg: [2.4, 2.5, 2.7], cores_logical: 2, cores_physical: 2, performance_cores: 1, efficiency_cores: 1, chip: "Apple M5 Max" },
  memory: { total: 64 * GB, used: 30 * GB, available: 34 * GB, percent: 46.9, wired: null, pressure: "normal", pressure_free_percent: 88, swap: { total: 0, used: 0, percent: 0 } },
  disks: [{ name: "내장 디스크", fstype: "apfs", mounts: ["/", "/System/Volumes/Data"], total: 1000 * GB, used: 920 * GB, free: 80 * GB, percent: 92, volumes: [{ mount: "/", used: 13 * GB }, { mount: "/System/Volumes/Data", used: 900 * GB }] }],
  network: { rx_bytes_per_sec: 5388, tx_bytes_per_sec: 3592 },
  processes: {
    top_cpu: [{ pid: 1, name: "claude", cpu_percent: 18.1, memory_bytes: 600 * 1024 ** 2 }],
    top_memory: [{ pid: 2, name: "python3.13", cpu_percent: 0.1, memory_bytes: 2 * GB }],
    ttakkari: [{ pid: 2, name: "python3.13", cpu_percent: 0.1, memory_bytes: 2 * GB, kind: "backend" }],
    ttakkari_total: { cpu_percent: 0.1, memory_bytes: 2 * GB },
  },
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  api.systemResources.mockResolvedValue(sample);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function renderIt(open: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (o: boolean) => <QueryClientProvider client={qc}><ResourcesDialog open={o} onClose={() => {}} /></QueryClientProvider>;
  const r = render(ui(open));
  return { rerender: (o: boolean) => r.rerender(ui(o)) };
}

describe("ResourcesDialog", () => {
  it("임계치는 80% 경고, 90% 위험", () => {
    expect([level(79.9), level(80), level(89.9), level(90)]).toEqual(["ok", "warn", "warn", "danger"]);
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(64 * GB)).toBe("64.0 GB");
    expect(uptime(90061)).toBe("1일 1시간");
  });

  it("CPU·메모리·디스크 게이지를 임계치 색으로 그린다", async () => {
    renderIt(true);
    const cpu = await screen.findByRole("progressbar", { name: "CPU 사용률" });
    expect(cpu.className).toContain("tk-progress--warning");
    expect(screen.getByRole("progressbar", { name: "메모리 사용률" }).className).not.toMatch(/warning|danger/);
    expect(screen.getByRole("progressbar", { name: "디스크 사용률" }).className).toContain("tk-progress--danger");
    expect(screen.getByText("압력 정상")).toBeTruthy();
    expect(screen.getByText("백엔드")).toBeTruthy();
    expect(screen.getByText(/mac · macOS 27.0 · 켜진 지 2일 3시간/)).toBeTruthy();
  });

  it("열려 있는 동안만 폴링하고 닫으면 멈춘다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const r = renderIt(true);
    await screen.findByRole("progressbar", { name: "CPU 사용률" });
    await act(() => vi.advanceTimersByTimeAsync(4100));
    expect(api.systemResources).toHaveBeenCalledTimes(2);
    r.rerender(false);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(api.systemResources).toHaveBeenCalledTimes(2);
  });

  it("닫혀 있으면 부르지 않는다", async () => {
    renderIt(false);
    await act(() => Promise.resolve());
    expect(api.systemResources).not.toHaveBeenCalled();
  });
});
