export type DiffLineType = "ctx" | "add" | "del" | "meta";

export interface DiffLine {
  type: DiffLineType;
  oldNo?: number;
  newNo?: number;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

/** 이 크기를 넘는 patch 는 접힌 채 두고 한 번 더 확인받고 펼친다(ADR 0042 §9). */
export const PATCH_COLLAPSE_BYTES = 200 * 1024;

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export const patchBytes = (patch: string): number => new TextEncoder().encode(patch).length;

export const countDiffLines = (hunks: Hunk[]): number => hunks.reduce((n, h) => n + h.lines.length, 0);

/**
 * 상류가 준 파일별 unified patch 를 hunk 로 나눈다. 번호는 hunk 머리의 시작 줄에서 이어 센다.
 * 머리(@@) 앞의 글자는 diff 본문이 아니라 버린다.
 */
export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of (patch.endsWith("\n") ? patch.slice(0, -1) : patch).split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const m = HEADER.exec(line);
    if (m) {
      cur = { header: line, lines: [] };
      hunks.push(cur);
      oldNo = Number(m[1]);
      newNo = Number(m[2]);
      continue;
    }
    if (!cur) continue;
    const mark = line[0];
    if (mark === "+") cur.lines.push({ type: "add", newNo: newNo++, text: line.slice(1) });
    else if (mark === "-") cur.lines.push({ type: "del", oldNo: oldNo++, text: line.slice(1) });
    else if (mark === "\\") cur.lines.push({ type: "meta", text: line.slice(2) });
    else cur.lines.push({ type: "ctx", oldNo: oldNo++, newNo: newNo++, text: mark === " " ? line.slice(1) : line });
  }
  return hunks;
}
