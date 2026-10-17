import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { systemResourceHistory, systemResources } from "../../api/client";
import type { ResourceHistory, ResourceHistoryPoint, ResourceHistoryRange, ResourceProcess } from "../../api/client";
import { errorText } from "../viewer/api";
import "./resources.css";

const WARN = 80;
const DANGER = 90;
// 서버가 1~2초 캐시를 두므로 이보다 자주 부를 이유가 없다.
const POLL_MS = 4000;
const PRESSURE: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  normal: { tone: "success", text: "압력 정상" },
  warn: { tone: "warning", text: "압력 경고" },
  critical: { tone: "danger", text: "압력 위험" },
};
const KIND: Record<string, string> = { backend: "백엔드", claude: "Claude", codex: "Codex", other: "하위 프로세스" };
const HISTORY_RANGES: { value: ResourceHistoryRange; label: string }[] = [
  { value: "1h", label: "1시간" }, { value: "24h", label: "24시간" }, { value: "7d", label: "7일" },
];

type Level = "ok" | "warn" | "danger";
type ResourceTab = "cpu" | "memory" | "gpu" | "system";

const RESOURCE_TABS: { id: ResourceTab; label: string }[] = [
  { id: "cpu", label: "CPU" },
  { id: "memory", label: "메모리" },
  { id: "gpu", label: "GPU" },
  { id: "system", label: "시스템" },
];

export function level(p: number): Level {
  return p >= DANGER ? "danger" : p >= WARN ? "warn" : "ok";
}

export function bytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function Bar({ percent, label, size = "lg" }: { percent: number; label: string; size?: "lg" | "sm" }) {
  const lv = level(percent);
  return (
    <span
      className={`tk-progress${size === "lg" ? " tk-progress--lg" : ""}${lv === "danger" ? " tk-progress--danger" : lv === "warn" ? " tk-progress--warning" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(100, percent))}
      style={{ "--tk-progress": Math.min(1, Math.max(0, percent / 100)) } as React.CSSProperties}
    />
  );
}

function Gauge({ title, percent, children }: { title: string; percent: number | null; children: React.ReactNode }) {
  return (
    <section className="res-gauge" data-level={percent == null ? undefined : level(percent)} aria-label={title}>
      <div className="res-gauge__top">
        <span className="res-gauge__title">{title}</span>
        <span className="res-gauge__pct">{percent == null ? "—" : `${percent.toFixed(percent < 10 ? 1 : 0)}%`}</span>
      </div>
      {percent != null && <Bar percent={percent} label={`${title} 사용률`} />}
      <div className="res-gauge__detail">{children}</div>
    </section>
  );
}

function ProcList({ title, rows, show }: { title: string; rows: ResourceProcess[]; show: "cpu" | "mem" | "kind" }) {
  return (
    <section className="res-procs" aria-label={title}>
      <h3 className="res-section-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="res-note">보이는 프로세스가 없어요.</p>
      ) : (
        <ol className="res-procs__list">
          {rows.map((p) => (
            <li key={p.pid} className="res-proc">
              <span className="res-proc__name" title={`pid ${p.pid}`}>
                <span className="res-proc__label">{p.name}</span>
                {show === "kind" && p.kind && <span className="tk-badge">{KIND[p.kind]}</span>}
              </span>
              <span className="res-proc__num" data-strong={show === "cpu" || undefined}>{p.cpu_percent.toFixed(1)}%</span>
              <span className="res-proc__num" data-strong={show === "mem" || undefined}>{bytes(p.memory_bytes)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type HistoryMetric = "cpu" | "memory" | "gpu";
const GIB = 1024 ** 3;
const METRIC_LABEL: Record<HistoryMetric, string> = {
  cpu: "CPU 전체 사용률 기록", memory: "메모리 사용량 기록", gpu: "GPU 전체 사용률 기록",
};

function metricValue(point: ResourceHistoryPoint, metric: HistoryMetric): number | null {
  const value = metric === "memory" ? point.memory_used_bytes : metric === "cpu" ? point.cpu_percent : point.gpu_percent;
  return value != null && Number.isFinite(value) && value >= 0 ? value : null;
}

function pointPosition(point: ResourceHistoryPoint, range: ResourceHistory, metric: HistoryMetric, maximum: number, width: number): { x: number; y: number } {
  const span = Math.max(1, Date.parse(range.to) - Date.parse(range.from));
  return {
    x: 42 + ((Date.parse(point.timestamp) - Date.parse(range.from)) / span) * (width - 48),
    y: 164 - (Math.max(0, Math.min(maximum, metricValue(point, metric) ?? 0)) / maximum) * 148,
  };
}

function historySegments(points: ResourceHistoryPoint[], range: ResourceHistory, metric: HistoryMetric, maximum: number, width: number): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let previous: number | null = null;
  for (const point of points) {
    const at = Date.parse(point.timestamp);
    if (metricValue(point, metric) == null || !Number.isFinite(at)) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      previous = null;
      continue;
    }
    if (previous != null && at - previous > range.bucket_seconds * 1500) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    }
    const { x, y } = pointPosition(point, range, metric, maximum, width);
    current.push(`${current.length ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
    previous = at;
  }
  if (current.length) segments.push(current.join(" "));
  return segments;
}

function formatAxisTime(value: string, range: ResourceHistoryRange): string {
  const date = new Date(value);
  return date.toLocaleString("ko-KR", range === "7d"
    ? { month: "numeric", day: "numeric" }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function MetricHistoryChart({ history, metric, memoryTotal }: { history: ResourceHistory; metric: HistoryMetric; memoryTotal?: number }) {
  const plot = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const node = plot.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(200, entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [history, metric]);
  // Memory uses bytes on a stable physical-capacity scale; it is never a percent.
  const memoryPeak = Math.max(GIB, ...history.points.map((p) => metricValue(p, "memory") ?? 0));
  const maximum = metric === "memory" ? Math.max(memoryTotal ?? 0, Math.ceil(memoryPeak / GIB) * GIB) : 100;
  const paths = historySegments(history.points, history, metric, maximum, width);
  const validPoints = history.points.filter((p) => metricValue(p, metric) != null && Number.isFinite(Date.parse(p.timestamp)));
  const label = METRIC_LABEL[metric];
  return (
    <section className="res-history__metric" aria-label={label}>
      <h3 className="res-section-title">{label}</h3>
      {metric === "gpu" && <p className="res-note">전체 사용률은 40코어 중 사용한 코어 수를 뜻하지 않아요. GPU 수집 실패와 유휴 0%는 구분됩니다.</p>}
      {validPoints.length === 0 ? (
        <p className="res-note">{metric === "gpu" ? "GPU 사용률을 수집하지 못했어요." : metric === "cpu" ? "CPU 사용률을 수집하지 못했어요." : "메모리 사용량을 수집하지 못했어요."}</p>
      ) : (
        <svg ref={plot} className="res-history__plot" viewBox={`0 0 ${width} 190`} role="img" aria-label={label} preserveAspectRatio="none">
          {[0, 0.5, 1].map((ratio) => {
            const y = 164 - ratio * 148;
            return (
              <g key={ratio} className="res-history__tick">
                <line x1="42" x2={width - 6} y1={y} y2={y} />
                <text x="34" y={y + 4} textAnchor="end">{metric === "memory" ? `${Number((maximum * ratio / GIB).toFixed(1))} GiB` : `${ratio * 100}%`}</text>
              </g>
            );
          })}
          {paths.map((path, index) => <path key={index} data-series={metric} d={path} />)}
          {validPoints.map((point) => {
            const { x, y } = pointPosition(point, history, metric, maximum, width);
            const value = metricValue(point, metric)!;
            return (
              <circle key={point.timestamp} className="res-history__point" cx={x} cy={y} r="2.5">
                <title>{new Date(point.timestamp).toLocaleString("ko-KR")} · {metric === "memory" ? `${(value / GIB).toFixed(2)} GiB` : `${value.toFixed(1)}%`}</title>
              </circle>
            );
          })}
          <text className="res-history__axis" x="42" y="187">{formatAxisTime(history.from, history.range)}</text>
          <text className="res-history__axis" x={width - 6} y="187" textAnchor="end">{formatAxisTime(history.to, history.range)}</text>
        </svg>
      )}
    </section>
  );
}

/**
 * 서버 리소스(/resources) 본문. 사용자 메뉴에서 이 페이지로 온다.
 * 마운트된 동안만 4초마다 다시 읽는다. 페이지를 벗어나면 옵저버가 없어져 폴링도 멈춘다.
 */
export function ResourcesPanel() {
  const [tab, setTabState] = useState<ResourceTab>(() => {
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get("tab") as ResourceTab;
        if (urlTab === "cpu" || urlTab === "memory" || urlTab === "gpu" || urlTab === "system") {
          return urlTab;
        }
        const saved = localStorage.getItem("ttakkari:resources-tab") as ResourceTab;
        if (saved === "cpu" || saved === "memory" || saved === "gpu" || saved === "system") {
          return saved;
        }
      } catch {
        // ignore
      }
    }
    return "cpu";
  });

  const selectTab = (nextTab: ResourceTab) => {
    setTabState(nextTab);
    try {
      localStorage.setItem("ttakkari:resources-tab", nextTab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % RESOURCE_TABS.length
      : event.key === "ArrowLeft"
        ? (currentIndex + RESOURCE_TABS.length - 1) % RESOURCE_TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? RESOURCE_TABS.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(RESOURCE_TABS[nextIndex].id);
    const target = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[nextIndex];
    target?.focus();
  };

  const [historyRange, setHistoryRange] = useState<ResourceHistoryRange>("1h");

  const q = useQuery({
    queryKey: ["system", "resources"],
    queryFn: () => systemResources(),
    refetchInterval: POLL_MS,
  });

  const historyQuery = useQuery({
    queryKey: ["system", "resources", "history", historyRange],
    queryFn: () => systemResourceHistory(historyRange),
    refetchInterval: 30_000,
  });

  const d = q.data;
  const history = historyQuery.data;

  const cores = d ? [
    d.cpu.performance_cores != null && `P ${d.cpu.performance_cores}`,
    d.cpu.efficiency_cores != null && `E ${d.cpu.efficiency_cores}`,
  ].filter(Boolean).join(" + ") : "";

  const pressure = d?.memory.pressure ? PRESSURE[d.memory.pressure] : null;

  return (
    <div className="res">
      <p className="res-note res-host">
        {d ? `${d.host.hostname.replace(/\.local$/, "")} · ${d.host.os} · 켜진 지 ${uptime(d.host.uptime_seconds)}` : "불러오는 중"}
        {q.isError && d && " · 갱신 실패, 마지막 값"}
      </p>
      {q.isError && !d && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}

      <div className="res__tabs-wrap">
        <div className="tk-tablist res__tabs" role="tablist" aria-label="서버 리소스 부문">
          {RESOURCE_TABS.map((t, idx) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              className="tk-tab"
              id={`res-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`res-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => selectTab(t.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="res-history__ranges" role="group" aria-label="자원 기록 기간">
          {HISTORY_RANGES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={historyRange === item.value}
              onClick={() => setHistoryRange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* CPU 탭 */}
      <section
        role="tabpanel"
        id="res-panel-cpu"
        aria-labelledby="res-tab-cpu"
        data-active={tab === "cpu"}
        tabIndex={0}
      >
        {d && (
          <>
            <div className="res-gauges">
              <Gauge title="CPU" percent={d.cpu.percent}>
                <span>{d.cpu.chip ?? "CPU"} · {d.cpu.cores_logical}코어{cores ? ` (${cores})` : ""}</span>
                <span>부하 평균 {d.cpu.load_avg.map((x) => x.toFixed(2)).join(" · ")}</span>
              </Gauge>
            </div>

            <section className="res-history" aria-label="CPU 자원 사용 기록">
              {historyQuery.isPending && <p className="res-note" role="status">기록을 불러오는 중…</p>}
              {historyQuery.isError && <p className="res-note" role="alert">자원 기록을 불러오지 못했어요.{history ? " 마지막 측정값을 표시합니다." : ""}</p>}
              {history && history.points.length === 0 && <p className="res-note">선택한 기간에 저장된 자원 기록이 없어요.</p>}
              {history && history.points.length > 0 && (
                <>
                  <MetricHistoryChart history={history} metric="cpu" />
                  <p className="res-note">{history.bucket_seconds === 30 ? "30초 간격 원본" : `구간별 평균 · ${history.bucket_seconds === 60 ? "1분" : "10분"}`} · 결측 구간은 선을 끊어 표시합니다.</p>
                </>
              )}
            </section>

            <section className="res-cores" aria-label="CPU 코어별 사용률">
              <h3 className="res-section-title">CPU 코어별</h3>
              <ol className="res-cores__grid">
                {d.cpu.per_core.map((p, i) => (
                  <li key={i} className="res-core" data-level={level(p)}>
                    <span className="res-core__label">{i + 1}</span>
                    <Bar percent={p} label={`코어 ${i + 1}`} size="sm" />
                    <span className="res-core__pct">{Math.round(p)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <ProcList title="CPU 상위" rows={d.processes.top_cpu} show="cpu" />
            <p className="res-note">CPU % 는 코어 하나를 100% 로 셉니다. 다른 사용자(root) 프로세스는 메모리를 읽을 수 없어 상위 목록에서 빠져요.</p>
          </>
        )}
      </section>

      {/* 메모리 탭 */}
      <section
        role="tabpanel"
        id="res-panel-memory"
        aria-labelledby="res-tab-memory"
        data-active={tab === "memory"}
        tabIndex={0}
      >
        {d && (
          <>
            <div className="res-gauges">
              <Gauge title="메모리" percent={d.memory.percent}>
                <span>{bytes(d.memory.used)} / {bytes(d.memory.total)} · 가용 {bytes(d.memory.available)}</span>
                <span className="res-inline">
                  {pressure && <span className={`tk-badge tk-badge--${pressure.tone}`}>{pressure.text}</span>}
                  <span>스왑 {d.memory.swap.total > 0 ? `${bytes(d.memory.swap.used)} / ${bytes(d.memory.swap.total)}` : "사용 안 함"}</span>
                </span>
              </Gauge>
            </div>

            <section className="res-history" aria-label="메모리 자원 사용 기록">
              {historyQuery.isPending && <p className="res-note" role="status">기록을 불러오는 중…</p>}
              {historyQuery.isError && <p className="res-note" role="alert">자원 기록을 불러오지 못했어요.{history ? " 마지막 측정값을 표시합니다." : ""}</p>}
              {history && history.points.length === 0 && <p className="res-note">선택한 기간에 저장된 자원 기록이 없어요.</p>}
              {history && history.points.length > 0 && (
                <>
                  <MetricHistoryChart history={history} metric="memory" memoryTotal={d.memory.total} />
                  <p className="res-note">{history.bucket_seconds === 30 ? "30초 간격 원본" : `구간별 평균 · ${history.bucket_seconds === 60 ? "1분" : "10분"}`} · 결측 구간은 선을 끊어 표시합니다. 메모리는 GiB 단위입니다.</p>
                </>
              )}
            </section>

            <ProcList title="메모리 상위" rows={d.processes.top_memory} show="mem" />
          </>
        )}
      </section>

      {/* GPU 탭 */}
      <section
        role="tabpanel"
        id="res-panel-gpu"
        aria-labelledby="res-tab-gpu"
        data-active={tab === "gpu"}
        tabIndex={0}
      >
        {d && (
          <>
            <div className="res-gauges">
              <Gauge title="GPU" percent={d.gpu?.status === "available" ? d.gpu.percent : null}>
                {d.gpu && (d.gpu.model || d.gpu.cores != null) && <span>{[d.gpu.model, d.gpu.cores != null ? `${d.gpu.cores}코어` : null].filter(Boolean).join(" · ")}</span>}
                {d.gpu?.status === "available" ? <>
                  <span>전체 사용률 · 코어별 사용률은 제공되지 않아요.</span>
                  {(d.gpu.memory_used_bytes != null || d.gpu.memory_allocated_bytes != null) && <span>
                    통합 메모리 중 {[
                      d.gpu.memory_used_bytes != null ? `사용 ${bytes(d.gpu.memory_used_bytes)}` : null,
                      d.gpu.memory_allocated_bytes != null ? `할당 ${bytes(d.gpu.memory_allocated_bytes)}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>}
                </> : <span>{!d.gpu ? "GPU 정보를 아직 받을 수 없어요." : d.gpu.status === "unsupported" ? "이 환경에서는 GPU 모니터링을 지원하지 않아요." : "GPU 사용률을 읽을 수 없어요."}</span>}
              </Gauge>
            </div>

            <section className="res-history" aria-label="GPU 자원 사용 기록">
              {historyQuery.isPending && <p className="res-note" role="status">기록을 불러오는 중…</p>}
              {historyQuery.isError && <p className="res-note" role="alert">자원 기록을 불러오지 못했어요.{history ? " 마지막 측정값을 표시합니다." : ""}</p>}
              {history && history.points.length === 0 && <p className="res-note">선택한 기간에 저장된 자원 기록이 없어요.</p>}
              {history && history.points.length > 0 && (
                <>
                  <MetricHistoryChart history={history} metric="gpu" />
                  <p className="res-note">{history.bucket_seconds === 30 ? "30초 간격 원본" : `구간별 평균 · ${history.bucket_seconds === 60 ? "1분" : "10분"}`} · 결측 구간은 선을 끊어 표시합니다.</p>
                </>
              )}
            </section>
          </>
        )}
      </section>

      {/* 시스템 탭 */}
      <section
        role="tabpanel"
        id="res-panel-system"
        aria-labelledby="res-tab-system"
        data-active={tab === "system"}
        tabIndex={0}
      >
        {d && (
          <>
            <div className="res-gauges">
              {d.disks.map((k) => (
                <Gauge key={k.mounts.join(",")} title={d.disks.length > 1 ? k.name : "디스크"} percent={k.percent}>
                  <span>{bytes(k.used)} / {bytes(k.total)} · 남음 {bytes(k.free)}</span>
                  {k.volumes.length > 1 && <span>{k.volumes.map((v) => `${v.mount === "/" ? "시스템" : v.mount === "/System/Volumes/Data" ? "데이터" : v.mount} ${bytes(v.used)}`).join(" · ")}</span>}
                </Gauge>
              ))}
            </div>

            <section className="res-net" aria-label="네트워크">
              <span className="res-net__item"><span className="res-net__label">수신</span>{bytes(d.network.rx_bytes_per_sec)}/s</span>
              <span className="res-net__item"><span className="res-net__label">송신</span>{bytes(d.network.tx_bytes_per_sec)}/s</span>
            </section>

            <ProcList
              title={`따까리 프로세스 · CPU ${d.processes.ttakkari_total.cpu_percent.toFixed(1)}% · ${bytes(d.processes.ttakkari_total.memory_bytes)}`}
              rows={d.processes.ttakkari}
              show="kind"
            />
          </>
        )}
      </section>
    </div>
  );
}
