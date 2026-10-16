import type React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { systemResourceHistory, systemResources } from "../../api/client";
import type { ResourceHistory, ResourceHistoryPoint, ResourceHistoryRange, ResourceProcess, SystemResources } from "../../api/client";
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

function Body({ d }: { d: SystemResources }) {
  const { cpu, gpu, memory: mem, disks, network: net, processes: procs } = d;
  const cores = [
    cpu.performance_cores != null && `P ${cpu.performance_cores}`,
    cpu.efficiency_cores != null && `E ${cpu.efficiency_cores}`,
  ].filter(Boolean).join(" + ");
  const pressure = mem.pressure ? PRESSURE[mem.pressure] : null;
  return (
    <>
      <div className="res-gauges">
        <Gauge title="CPU" percent={cpu.percent}>
          <span>{cpu.chip ?? "CPU"} · {cpu.cores_logical}코어{cores ? ` (${cores})` : ""}</span>
          <span>부하 평균 {cpu.load_avg.map((x) => x.toFixed(2)).join(" · ")}</span>
        </Gauge>
        <Gauge title="GPU" percent={gpu?.status === "available" ? gpu.percent : null}>
          {gpu && (gpu.model || gpu.cores != null) && <span>{[gpu.model, gpu.cores != null ? `${gpu.cores}코어` : null].filter(Boolean).join(" · ")}</span>}
          {gpu?.status === "available" ? <>
            <span>전체 사용률 · 코어별 사용률은 제공되지 않아요.</span>
            {(gpu.memory_used_bytes != null || gpu.memory_allocated_bytes != null) && <span>
              통합 메모리 중 {[
                gpu.memory_used_bytes != null ? `사용 ${bytes(gpu.memory_used_bytes)}` : null,
                gpu.memory_allocated_bytes != null ? `할당 ${bytes(gpu.memory_allocated_bytes)}` : null,
              ].filter(Boolean).join(" · ")}
            </span>}
          </> : <span>{!gpu ? "GPU 정보를 아직 받을 수 없어요." : gpu.status === "unsupported" ? "이 환경에서는 GPU 모니터링을 지원하지 않아요." : "GPU 사용률을 읽을 수 없어요."}</span>}
        </Gauge>
        <Gauge title="메모리" percent={mem.percent}>
          <span>{bytes(mem.used)} / {bytes(mem.total)} · 가용 {bytes(mem.available)}</span>
          <span className="res-inline">
            {pressure && <span className={`tk-badge tk-badge--${pressure.tone}`}>{pressure.text}</span>}
            <span>스왑 {mem.swap.total > 0 ? `${bytes(mem.swap.used)} / ${bytes(mem.swap.total)}` : "사용 안 함"}</span>
          </span>
        </Gauge>
        {disks.map((k) => (
          <Gauge key={k.mounts.join(",")} title={disks.length > 1 ? k.name : "디스크"} percent={k.percent}>
            <span>{bytes(k.used)} / {bytes(k.total)} · 남음 {bytes(k.free)}</span>
            {k.volumes.length > 1 && <span>{k.volumes.map((v) => `${v.mount === "/" ? "시스템" : v.mount === "/System/Volumes/Data" ? "데이터" : v.mount} ${bytes(v.used)}`).join(" · ")}</span>}
          </Gauge>
        ))}
      </div>

      <section className="res-cores" aria-label="CPU 코어별 사용률">
        <h3 className="res-section-title">CPU 코어별</h3>
        <ol className="res-cores__grid">
          {cpu.per_core.map((p, i) => (
            <li key={i} className="res-core" data-level={level(p)}>
              <span className="res-core__label">{i + 1}</span>
              <Bar percent={p} label={`코어 ${i + 1}`} size="sm" />
              <span className="res-core__pct">{Math.round(p)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="res-net" aria-label="네트워크">
        <span className="res-net__item"><span className="res-net__label">수신</span>{bytes(net.rx_bytes_per_sec)}/s</span>
        <span className="res-net__item"><span className="res-net__label">송신</span>{bytes(net.tx_bytes_per_sec)}/s</span>
      </section>

      <ProcList
        title={`따까리 프로세스 · CPU ${procs.ttakkari_total.cpu_percent.toFixed(1)}% · ${bytes(procs.ttakkari_total.memory_bytes)}`}
        rows={procs.ttakkari}
        show="kind"
      />
      <div className="res-procs-pair">
        <ProcList title="CPU 상위" rows={procs.top_cpu} show="cpu" />
        <ProcList title="메모리 상위" rows={procs.top_memory} show="mem" />
      </div>
      <p className="res-note">CPU % 는 코어 하나를 100% 로 셉니다. 다른 사용자(root) 프로세스는 메모리를 읽을 수 없어 상위 목록에서 빠져요.</p>
    </>
  );
}

function historySegments(points: ResourceHistoryPoint[], range: ResourceHistory): string[] {
  const start = Date.parse(range.from);
  const end = Date.parse(range.to);
  const span = Math.max(1, end - start);
  const segments: string[] = [];
  let current: string[] = [];
  let previous: number | null = null;
  for (const point of points) {
    const at = Date.parse(point.timestamp);
    const value = point.gpu_percent;
    if (value == null || !Number.isFinite(at)) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      previous = null;
      continue;
    }
    if (previous != null && at - previous > range.bucket_seconds * 1500) {
      if (current.length) segments.push(current.join(" "));
      current = [];
    }
    const x = 42 + ((at - start) / span) * 672;
    const y = 164 - (Math.max(0, Math.min(100, value)) / 100) * 148;
    current.push(`${current.length ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`);
    previous = at;
  }
  if (current.length) segments.push(current.join(" "));
  return segments;
}

function pointPosition(point: ResourceHistoryPoint, range: ResourceHistory): { x: number; y: number } {
  const span = Math.max(1, Date.parse(range.to) - Date.parse(range.from));
  return {
    x: 42 + ((Date.parse(point.timestamp) - Date.parse(range.from)) / span) * 672,
    y: 164 - (Math.max(0, Math.min(100, point.gpu_percent ?? 0)) / 100) * 148,
  };
}

function formatAxisTime(value: string, range: ResourceHistoryRange): string {
  const date = new Date(value);
  return date.toLocaleString("ko-KR", range === "7d"
    ? { month: "numeric", day: "numeric" }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function GpuHistory() {
  const [selected, setSelected] = useState<ResourceHistoryRange>("1h");
  const query = useQuery({
    queryKey: ["system", "resources", "history", selected],
    queryFn: () => systemResourceHistory(selected),
    refetchInterval: 30_000,
  });
  const history = query.data;
  const paths = history ? historySegments(history.points, history) : [];
  return (
    <section className="res-history" aria-labelledby="res-history-title">
      <div className="res-history__head">
        <div>
          <h2 className="res-section-title" id="res-history-title">GPU 전체 사용률 기록</h2>
          <p className="res-note">전체 사용률은 40코어 중 사용한 코어 수를 뜻하지 않아요. GPU 수집 실패와 유휴 0%는 구분됩니다.</p>
        </div>
        <div className="res-history__ranges" role="group" aria-label="GPU 기록 기간">
          {HISTORY_RANGES.map((item) => (
            <button key={item.value} type="button" aria-pressed={selected === item.value}
              onClick={() => setSelected(item.value)}>{item.label}</button>
          ))}
        </div>
      </div>
      {query.isPending && <p className="res-note" role="status">기록을 불러오는 중…</p>}
      {query.isError && !history && <p className="res-note" role="alert">GPU 기록을 불러오지 못했어요.</p>}
      {history && history.points.length === 0 && <p className="res-note">선택한 기간에 저장된 GPU 기록이 없어요.</p>}
      {history && history.points.length > 0 && <div className="res-history__plot-wrap">
        <svg className="res-history__plot" viewBox="0 0 720 190" role="img" aria-label="GPU 전체 사용률 기록" preserveAspectRatio="none">
          {[0, 50, 100].map((tick) => {
            const y = 164 - (tick / 100) * 148;
            return <g key={tick} className="res-history__tick">
              <line x1="42" x2="714" y1={y} y2={y} />
              <text x="34" y={y + 4} textAnchor="end">{tick}%</text>
            </g>;
          })}
          {paths.map((path, index) => <path key={index} data-series="gpu" d={path} />)}
          {history.points.filter((point) => point.gpu_percent != null).map((point) => {
            const { x, y } = pointPosition(point, history);
            return <circle key={point.timestamp} className="res-history__point" cx={x} cy={y} r="2.5" />;
          })}
          <text className="res-history__axis" x="42" y="187">{formatAxisTime(history.from, selected)}</text>
          <text className="res-history__axis" x="714" y="187" textAnchor="end">{formatAxisTime(history.to, selected)}</text>
        </svg>
        <p className="res-note">{history.bucket_seconds === 30 ? "30초 간격 원본" : `구간별 평균 · ${history.bucket_seconds === 60 ? "1분" : "10분"}`} · 결측 구간은 선을 끊어 표시합니다.</p>
      </div>}
    </section>
  );
}

/**
 * 서버 리소스(/resources) 본문. 사용자 메뉴에서 이 페이지로 온다.
 * 마운트된 동안만 4초마다 다시 읽는다. 페이지를 벗어나면 옵저버가 없어져 폴링도 멈춘다.
 */
export function ResourcesPanel() {
  const q = useQuery({
    queryKey: ["system", "resources"],
    queryFn: () => systemResources(),
    refetchInterval: POLL_MS,
  });
  const d = q.data;
  return (
    <div className="res">
      <p className="res-note res-host">
        {d ? `${d.host.hostname.replace(/\.local$/, "")} · ${d.host.os} · 켜진 지 ${uptime(d.host.uptime_seconds)}` : "불러오는 중"}
        {q.isError && d && " · 갱신 실패, 마지막 값"}
      </p>
      {q.isError && !d && <p className="tk-error" role="alert">{errorText(q.error).message}</p>}
      {d && <Body d={d} />}
      <GpuHistory />
    </div>
  );
}
