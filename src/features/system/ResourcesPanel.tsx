import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { systemResources } from "../../api/client";
import type { ResourceProcess, SystemResources } from "../../api/client";
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

function Gauge({ title, percent, children }: { title: string; percent: number; children: React.ReactNode }) {
  return (
    <section className="res-gauge" data-level={level(percent)} aria-label={title}>
      <div className="res-gauge__top">
        <span className="res-gauge__title">{title}</span>
        <span className="res-gauge__pct">{percent.toFixed(percent < 10 ? 1 : 0)}%</span>
      </div>
      <Bar percent={percent} label={`${title} 사용률`} />
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
  const { cpu, memory: mem, disks, network: net, processes: procs } = d;
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

      <section className="res-cores" aria-label="코어별 사용률">
        <h3 className="res-section-title">코어별</h3>
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

/**
 * 서버 리소스(/resources) 본문. 사용자 메뉴와 부가 기능이 모두 이 페이지로 온다.
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
    </div>
  );
}
