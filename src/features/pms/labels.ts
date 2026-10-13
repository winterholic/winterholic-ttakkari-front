import type { PmsNoteKind, PmsPriority, PmsProjectStatus, PmsScope, PmsSeverity, PmsTaskStatus } from "../../api/types";

export const STATUSES: readonly PmsTaskStatus[] = ["todo", "doing", "review", "done"];
export const STATUS_LABEL: Record<PmsTaskStatus, string> = { todo: "할 일", doing: "진행", review: "검토", done: "완료" };

export const PROJECT_STATUSES: readonly PmsProjectStatus[] = ["planning", "active", "on_hold", "done"];
export const PROJECT_STATUS_LABEL: Record<PmsProjectStatus, string> = { planning: "준비", active: "진행 중", on_hold: "보류", done: "완료" };

export const SCOPES: { value: PmsScope; label: string }[] = [
  { value: "personal", label: "개인" },
  { value: "work", label: "회사" },
];
export const scopeLabel = (s: PmsScope): string => (s === "work" ? "회사" : "개인");

export const PRIORITIES: readonly PmsPriority[] = ["low", "normal", "high", "urgent"];
export const PRIORITY_LABEL: Record<PmsPriority, string> = { low: "낮음", normal: "보통", high: "높음", urgent: "긴급" };

export const NOTE_KINDS: readonly PmsNoteKind[] = ["issue", "risk", "note"];
export const NOTE_KIND_LABEL: Record<PmsNoteKind, string> = { issue: "이슈", risk: "리스크", note: "메모" };
export const SEVERITIES: readonly PmsSeverity[] = ["low", "medium", "high"];
export const SEVERITY_LABEL: Record<PmsSeverity, string> = { low: "낮음", medium: "보통", high: "높음" };

/** 새 프로젝트에 한 번에 넣어 볼 수 있는 기본 단계 */
export const DEFAULT_PHASES = ["기획", "설계", "구현", "테스트", "출시"] as const;
