export interface PreciseEvalAggregates {
  precise_waiting?: number;
  precise_unresolved?: number;
}

export interface PreciseEvalQueue {
  pending?: number;
  processing?: number;
  unresolved?: number;
}

export function preciseEvalSummary(counts?: PreciseEvalAggregates, precise?: PreciseEvalQueue): string {
  const parts: string[] = [];
  if (precise?.pending != null) {
    parts.push(`대기 ${precise.pending.toLocaleString("ko-KR")}건`);
  } else if (counts?.precise_waiting != null) {
    parts.push(`대기·처리 합계 ${counts.precise_waiting.toLocaleString("ko-KR")}건`);
    if (precise?.processing == null) parts.push("개별 대기·처리 미확인");
  } else {
    parts.push("대기 미확인");
  }

  if (precise?.processing != null) parts.push(`처리 중 ${precise.processing.toLocaleString("ko-KR")}건`);
  else if (precise?.pending != null) parts.push("처리 중 미확인");

  const unresolved = precise?.unresolved ?? counts?.precise_unresolved;
  parts.push(`결과 확인 불가 ${unresolved == null ? "미확인" : `${unresolved.toLocaleString("ko-KR")}건`}`);
  return parts.join(" · ");
}
