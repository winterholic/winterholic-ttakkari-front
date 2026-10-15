import type { MeetingSummary } from "../../api/client";
import { Icon } from "../../ui/Icon";
import { formatWhen } from "../viewer/kinds";

function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return formatWhen(iso);
}

export function VectorLine({ v }: { v: NonNullable<MeetingSummary["vector"]> }) {
  if (v.status === "none") return null;
  return (
    <p className={v.status === "failed" ? "mt-vector mt-vector--error" : "mt-vector"}>
      <Icon name="context-library" />
      {v.status === "pending" && <>맥락 도서관에 저장하는 중<span className="tk-spinner tk-spinner--xs" aria-hidden="true" /></>}
      {v.status === "ready" && <>맥락 도서관에 {v.chunks}조각 저장됨 · 뜻으로 찾기 가능{v.embedded_at ? ` · ${ago(v.embedded_at)}` : ""}</>}
      {v.status === "failed" && <>맥락 도서관 저장 실패: {v.error}</>}
    </p>
  );
}
