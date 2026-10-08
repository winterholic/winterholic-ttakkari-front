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
  const steps: StepView[] = [];
  const byCall = new Map<string, StepView>();
  const log: LogLine[] = [];
  const artifacts: ArtifactOut[] = [];

  for (const e of events) {
    switch (e.type) {
      case "run.status":
        status = e.payload.status;
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
  const finished = !["queued", "running"].includes(status);
  if (finished) {
    // 결과를 못 받고 끝난 단계는 멈춘 것으로 보인다.
    for (const s of steps) if (s.state === "running") s.state = status === "failed" ? "failed" : "cancelled";
  }
  const running = steps.findLast((s) => s.state === "running");
  const doing = finished ? null : running ? `${running.name}${running.target ? ` · ${running.target}` : ""}` : thinking ? "생각하는 중" : "준비하는 중";

  return { status, state: STATE_OF[status], text, doing, steps, log, artifacts, diff, error, costUsd, blockedCount };
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
