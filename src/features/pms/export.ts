import type { PmsMilestone, PmsProject, PmsTask } from "../../api/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "./labels";

export const EXPORT_HEADER = ["WBS", "작업", "담당자", "상태", "진행률(%)", "시작일", "종료일", "선행 작업", "우선순위", "설명"] as const;
export type Cell = string | number;

/** WBS 표 그대로: 들여쓰기는 번호로 드러나니 제목은 그대로 둔다. 선행 작업은 번호로 적는다. */
export function taskRows(tasks: PmsTask[]): Cell[][] {
  const wbs = new Map(tasks.map((t) => [t.id, t.wbs]));
  return tasks.map((t) => [
    t.wbs,
    t.title,
    t.assignee ?? "",
    STATUS_LABEL[t.status],
    t.progress,
    t.start_date ?? "",
    t.end_date ?? "",
    t.predecessors.map((p) => wbs.get(p)).filter(Boolean).join(", "),
    PRIORITY_LABEL[t.priority],
    t.description,
  ]);
}

export function milestoneRows(ms: PmsMilestone[]): Cell[][] {
  return ms.map((m) => [m.title, m.due_date, m.done ? "완료" : m.overdue ? "지연" : "예정"]);
}

/** 엑셀·숫자 앱이 한글을 깨지 않게 BOM 을 붙이고, 쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싼다. 수식으로 읽힐 시작 글자는 막는다. */
export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell): string => {
    let s = String(v);
    if (/^[=+\-@]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const fileBase = (p: Pick<PmsProject, "name">): string => `${p.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "project"}-WBS`;

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(project: Pick<PmsProject, "name">, tasks: PmsTask[]): void {
  save(new Blob([toCsv([[...EXPORT_HEADER], ...taskRows(tasks)])], { type: "text/csv;charset=utf-8" }), `${fileBase(project)}.csv`);
}

/** xlsx 라이브러리는 무거워서 내보낼 때만 받는다. 마일스톤은 두 번째 시트. */
export async function downloadXlsx(project: Pick<PmsProject, "name">, tasks: PmsTask[], milestones: PmsMilestone[]): Promise<void> {
  const { utils, write } = await import("xlsx");
  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet([[...EXPORT_HEADER], ...taskRows(tasks)]);
  ws["!cols"] = [8, 36, 12, 8, 10, 12, 12, 14, 10, 40].map((wch) => ({ wch }));
  utils.book_append_sheet(wb, ws, "WBS");
  if (milestones.length) {
    const ms = utils.aoa_to_sheet([["마일스톤", "기한", "상태"], ...milestoneRows(milestones)]);
    ms["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 8 }];
    utils.book_append_sheet(wb, ms, "마일스톤");
  }
  const out = write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  save(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(project)}.xlsx`);
}
