import type { ReactNode } from "react";
import type { MeetingScope, MeetingStatus, MeetingSummary } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Icon } from "../../ui/Icon";

export const STATUS_LABEL: Record<MeetingStatus, string> = {
  uploaded: "업로드됨",
  transcribing: "전사 중",
  transcribed: "전사 완료",
  analyzing: "분석 중",
  analyzed: "분석 완료",
  review: "승인 대기",
  failed: "실패",
};
export const SCOPE_OPTIONS: { value: MeetingScope; label: string }[] = [
  { value: "personal", label: "개인" },
  { value: "work", label: "회사" },
];
export const scopeLabel = (s: MeetingScope) => (s === "work" ? "회사" : "개인");
export const isRunning = (s: MeetingStatus) => s === "analyzing" || s === "transcribing";

const TONE: Partial<Record<MeetingStatus, "info" | "success" | "warning" | "danger">> = {
  transcribing: "info",
  analyzing: "info",
  analyzed: "success",
  review: "warning",
  failed: "danger",
};

export function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <Badge tone={TONE[status]}>
      {isRunning(status) && <span className="tk-spinner tk-spinner--xs" aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** 회의 일시(없으면 만든 시각). 목록·상세가 같은 표기를 쓴다. */
export function meetingWhen(m: Pick<MeetingSummary, "held_at" | "created_at">): string {
  const d = new Date(m.held_at ?? m.created_at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

const STEPS = ["입력", "전사", "분석", "승인"] as const;

/** 파이프라인 어디까지 왔는지. 상태 이름만으로는 흐름이 안 읽혀서 네 칸으로 보여 준다(완료·진행·남음, 실패는 멈춘 칸). */
export function PipelineSteps({ m }: { m: Pick<MeetingSummary, "status" | "failed_stage" | "source"> }) {
  const at: Record<MeetingStatus, number> = { uploaded: 1, transcribing: 1, transcribed: 2, analyzing: 2, review: 3, analyzed: 4, failed: m.failed_stage === "transcription" ? 1 : 2 };
  const cur = at[m.status];
  const active = m.status === "transcribing" || m.status === "analyzing" || m.status === "review";
  return (
    <ol className="mt-steps" aria-label="진행 단계">
      {STEPS.map((label, i) => {
        const state = i < cur ? "done" : i === cur ? (m.status === "failed" ? "failed" : active ? "active" : "next") : "next";
        return (
          <li key={label} className="mt-steps__item" data-state={state} aria-current={state === "active" || state === "failed" ? "step" : undefined}>
            <span className="mt-steps__dot" aria-hidden="true">{state === "done" ? <Icon name="check" /> : i + 1}</span>
            <span className="mt-steps__label">{label === "입력" && m.source === "audio" ? "녹음" : label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Callout({ tone, icon, title, children }: { tone: "note" | "warning" | "caution"; icon: "info" | "warning" | "caution"; title: string; children?: ReactNode }) {
  return (
    <aside className={`tk-callout tk-callout--${tone}`} role="note">
      <Icon name={icon} className="tk-callout__icon" />
      <div className="tk-callout__body">
        <strong className="tk-callout__title">{title}</strong>
        {children}
      </div>
    </aside>
  );
}

/** 텍스트 파일을 읽는다. UTF-8 이 아니면(구형 윈도 메모장 등) EUC-KR 로 다시 읽는다. */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("euc-kr").decode(buf);
  }
}
