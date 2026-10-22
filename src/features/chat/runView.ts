import type { ArtifactOut, RunEvent, RunOut, RunStatus } from "../../api/types";

/** 디자인 시스템 작업 상태 6종(docs/08 §1). 백엔드 interrupted 는 취소 모양 + 다른 단어로 보인다. */
export type UiRunState = "queued" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export const STATE_OF: Record<RunStatus, UiRunState> = {
  queued: "queued",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "cancelled",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "대기",
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소됨",
  interrupted: "중단됨",
};

/** 같은 Run 이 계정·엔진을 갈아탄 기록(engine.fallback). */
export interface SwitchView {
  seq: number;
  at: string;
  from: string;
  to: string;
  reason: "usage_limit" | "missing";
  /** 넘어가게 한 계정이 한도에서 풀리는 시각 */
  resetAt: string | null;
  /** resume: 그 계정의 엔진 대화를 이어감 · handoff: 대화·진행 요약을 새 대화에 실어 보냄 */
  mode: "resume" | "handoff" | null;
}

/** 모든 계정이 한도라 초기화를 기다리는 중. */
export interface WaitingView {
  until: string;
  accounts: { name: string; engine: string; resetsAt: string }[];
}

export interface StepView {
  id: string;
  name: string;
  target?: string;
  detail?: string;
  state: UiRunState;
  startedAt: string;
  endedAt?: string;
}

export type LogLevel = "tool" | "ok" | "info" | "warn" | "error";
export interface LogLine {
  seq: number;
  at: string;
  level: LogLevel;
  text: string;
}

export interface RunView {
  status: RunStatus;
  state: UiRunState;
  /** 에이전트가 마지막으로 한 말. 끝나면 결과 요약이 된다. */
  text: string | null;
  /** 첫 글자가 오기 전 "무엇을 하는지"(docs/07 §4). */
  doing: string | null;
  steps: StepView[];
  log: LogLine[];
  artifacts: ArtifactOut[];
  diff: { files: { path: string; added: number | null; removed: number | null }[]; new_files: string[] } | null;
  error: string | null;
  costUsd: number | null;
  blockedCount: number;
  switches: SwitchView[];
  waiting: WaitingView | null;
}

/** Prefer the engine that completed the latest execution over legacy Run.engine metadata. */
export function actualEngine(run: Pick<RunOut, "engine" | "usage">): string {
  const selected = run.usage.selected_engine;
  return typeof selected === "string" && selected.length > 0 ? selected : run.engine;
}

export function actualModel(run: Pick<RunOut, "model" | "usage">): string | null {
  const selected = run.usage.selected_model;
  return typeof selected === "string" && selected.length > 0 ? selected : run.model;
}

/** 진행 중으로 보이는 상태(멈추기 버튼·실시간 표시). 한도 대기도 아직 끝난 Run 이 아니다. */
export function isLive(state: UiRunState): boolean {
  return state === "running" || state === "queued" || state === "waiting";
}

export function stateLabel(view: Pick<RunView, "state" | "status">): string {
  return view.state === "waiting" ? "한도 대기" : STATUS_LABEL[view.status];
}

/** 같은 날이면 시:분, 다른 날이면 월/일 시:분. */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

const TOOL_LABEL: Record<string, string> = {
  Bash: "명령 실행",
  shell: "명령 실행",
  Read: "파일 읽기",
  Write: "파일 쓰기",
  Edit: "파일 고치기",
  MultiEdit: "파일 고치기",
  NotebookEdit: "노트북 고치기",
  Grep: "내용 찾기",
  Glob: "파일 찾기",
  LS: "폴더 보기",
  WebSearch: "웹 검색",
  web_search: "웹 검색",
  WebFetch: "웹 페이지 읽기",
  TodoWrite: "할 일 정리",
  Task: "하위 작업 맡기기",
  Agent: "하위 작업 맡기기",
  file_change: "파일 변경",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function shortPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 3 ? `…/${parts.slice(-2).join("/")}` : p;
}

export function describeTool(name: string, input: unknown): { name: string; target?: string } {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const label = TOOL_LABEL[name] ?? (name.startsWith("mcp:") || name.startsWith("mcp__") ? "도구 호출" : name);
  const path = str(i.file_path) ?? str(i.notebook_path) ?? str(i.path);
  if (path) return { name: label, target: shortPath(path) };
  const cmd = str(i.command);
  if (cmd) return { name: label, target: cmd.length > 80 ? `${cmd.slice(0, 80)}…` : cmd };
  const q = str(i.pattern) ?? str(i.query) ?? str(i.url) ?? str(i.description);
  if (q) return { name: label, target: q.length > 80 ? `${q.slice(0, 80)}…` : q };
  if (name === "file_change" && Array.isArray(i.changes)) return { name: label, target: `${i.changes.length}개 파일` };
  if (name.startsWith("mcp:")) return { name: label, target: name.slice(4) };
  return { name: label };
}

function firstLine(text: string, max = 200): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/** Run 과 이벤트로 화면 모델을 만든다. 이벤트가 아직 없으면 RunOut 만으로 만든다(지난 Run). */
export function buildRunView(run: RunOut, events: RunEvent[]): RunView {
  let status: RunStatus = run.status;
  let text: string | null = null;
  let thinking: string | null = null;
  let error: string | null = run.error;
  let costUsd: number | null = run.cost_usd;
  let diff: RunView["diff"] = null;
  let blockedCount = 0;
  const switches: SwitchView[] = [];
  let waiting: WaitingView | null = null;
  const steps: StepView[] = [];
  const byCall = new Map<string, StepView>();
  const log: LogLine[] = [];
  const artifacts: ArtifactOut[] = [];

  for (const e of events) {
    switch (e.type) {
      case "run.status":
        status = e.payload.status;
        if (status === "running") waiting = null;
        break;
      case "account.limited": {
        const reset = e.payload.reset_at ? ` · ${clockLabel(e.payload.reset_at)}에 초기화` : "";
        log.push({ seq: e.seq, at: e.created_at, level: "warn", text: `${e.payload.account} 사용량 한도${reset}` });
        break;
      }
      case "engine.fallback":
        switches.push({
          seq: e.seq,
          at: e.created_at,
          from: e.payload.from,
          to: e.payload.to,
          reason: e.payload.reason,
          resetAt: e.payload.reset_at ?? null,
          mode: e.payload.mode ?? null,
        });
        log.push({ seq: e.seq, at: e.created_at, level: "warn", text: `계정 전환: ${e.payload.from} → ${e.payload.to}` });
        break;
      case "run.waiting":
        waiting = { until: e.payload.until, accounts: e.payload.accounts.map((a) => ({ name: a.name, engine: a.engine, resetsAt: a.resets_at })) };
        log.push({ seq: e.seq, at: e.created_at, level: "warn", text: `모든 계정이 한도 · ${clockLabel(e.payload.until)}에 이어서 진행` });
        break;
      case "run.resumed":
        waiting = null;
        log.push({ seq: e.seq, at: e.created_at, level: "info", text: `한도가 풀려 ${e.payload.account} 계정에서 이어서 진행` });
        break;
      case "message":
        text = e.payload.text;
        log.push({ seq: e.seq, at: e.created_at, level: "info", text: firstLine(e.payload.text) });
        break;
      case "thinking":
        thinking = firstLine(e.payload.text, 80);
        break;
      case "tool.call": {
        const d = describeTool(e.payload.name, e.payload.input);
        const step: StepView = { id: e.payload.call_id ?? String(e.seq), ...d, state: "running", startedAt: e.created_at };
        steps.push(step);
        if (e.payload.call_id) byCall.set(e.payload.call_id, step);
        log.push({ seq: e.seq, at: e.created_at, level: "tool", text: `${e.payload.name} ${d.target ?? ""}`.trim() });
        break;
      }
      case "tool.result": {
        const step = byCall.get(e.payload.call_id);
        if (step && step.state === "running") {
          step.state = e.payload.is_error ? "failed" : "succeeded";
          step.endedAt = e.created_at;
        }
        const out = e.payload.output ? firstLine(e.payload.output) : e.payload.is_error ? "오류" : "완료";
        log.push({ seq: e.seq, at: e.created_at, level: e.payload.is_error ? "error" : "ok", text: out });
        break;
      }
      case "guard.blocked": {
        blockedCount += 1;
        const step = byCall.get(e.payload.call_id);
        const reason = e.payload.reason.replace(/^.*\[ttakkari-guard\]\s*/, "").split(". ")[0];
        if (step) {
          step.state = "failed";
          step.detail = `보험 규칙이 막았어요 · ${reason}`;
        }
        log.push({ seq: e.seq, at: e.created_at, level: "warn", text: `guard: ${reason}` });
        break;
      }
      case "artifact.created":
        artifacts.push(e.payload.artifact);
        break;
      case "run.diff":
        diff = e.payload;
        break;
      case "usage":
        if (typeof e.payload.cost_usd === "number") costUsd = e.payload.cost_usd;
        break;
      case "log":
        log.push({ seq: e.seq, at: e.created_at, level: "info", text: firstLine(e.payload.text) });
        break;
      case "error":
        log.push({ seq: e.seq, at: e.created_at, level: "error", text: e.payload.message });
        break;
      case "run.finished":
        status = e.payload.status;
        error = e.payload.error;
        if (e.payload.result_text) text = e.payload.result_text;
        if (e.payload.cost_usd != null) costUsd = e.payload.cost_usd;
        break;
      default:
        break;
    }
  }

  if (!events.length) text = run.result_text;
  // 한도 대기 Run 은 상태가 queued 로 남는다. 끝난 것이 아니라 초기화를 기다리는 중이다.
  if (status !== "queued") waiting = null;
  const finished = !["queued", "running"].includes(status);
  if (finished) {
    // 결과를 못 받고 끝난 단계는 멈춘 것으로 보인다.
    for (const s of steps) if (s.state === "running") s.state = status === "failed" ? "failed" : "cancelled";
  }
  const running = steps.findLast((s) => s.state === "running");
  const doing = finished ? null : waiting ? `사용량 한도 초기화 대기 · ${clockLabel(waiting.until)}에 이어서` : running ? `${running.name}${running.target ? ` · ${running.target}` : ""}` : thinking ? "생각하는 중" : "준비하는 중";

  const state: UiRunState = waiting ? "waiting" : STATE_OF[status];
  return { status, state, text, doing, steps, log, artifacts, diff, error, costUsd, blockedCount, switches, waiting };
}

export function formatElapsed(fromIso: string | null, toIso: string | null, now: number): string {
  if (!fromIso) return "";
  const from = Date.parse(fromIso);
  const to = toIso ? Date.parse(toIso) : now;
  const sec = Math.max(0, Math.round((to - from) / 1000));
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}분 ${s}초`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
