import type { GhLabel } from "../../api/githubTypes";
import { Badge } from "../../ui/Badge";
import { Icon } from "../../ui/Icon";

/** 검증된 https://github.com 주소만 새 탭으로 연다. 주소가 없으면 아무것도 그리지 않는다. */
export function WebLink({ href, label = "GitHub 에서 열기" }: { href: string | null | undefined; label?: string }) {
  if (!href) return null;
  return (
    <a className="tk-button tk-button--ghost tk-button--sm" href={href} target="_blank" rel="noopener noreferrer">
      <span>{label}</span><Icon name="external-link" />
    </a>
  );
}

export interface FilterOption<T extends string> {
  id: T;
  label: string;
}

/** 목록 필터. 상태는 호출한 화면이 URL 쿼리에 둔다. */
export function FilterPills<T extends string>({ label, options, value, onChange }: { label: string; options: FilterOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="gh-pills" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

/** 라벨은 색 없이 이름만. 색은 GitHub 가 임의 값을 주므로 따르지 않는다. */
export function LabelBadges({ labels }: { labels: GhLabel[] }) {
  if (labels.length === 0) return null;
  return <>{labels.slice(0, 4).map((l) => <Badge key={l.name}>{l.name}</Badge>)}{labels.length > 4 && <span>+{labels.length - 4}</span>}</>;
}

export function PullStateBadge({ state, merged, draft }: { state: string; merged: boolean; draft: boolean }) {
  if (merged) return <Badge tone="info">머지됨</Badge>;
  if (draft) return <Badge>초안</Badge>;
  return state === "open" ? <Badge tone="success">열림</Badge> : <Badge tone="danger">닫힘</Badge>;
}

export function IssueStateBadge({ state, reason }: { state: string; reason?: string | null }) {
  if (state === "open") return <Badge tone="success">열림</Badge>;
  return <Badge tone={reason === "not_planned" ? undefined : "info"}>{reason === "not_planned" ? "계획 없음으로 닫힘" : "해결됨"}</Badge>;
}

/** run 의 진행·결과를 글자와 색으로 함께 낸다. */
export function RunResultBadge({ status, conclusion }: { status: string | null; conclusion: string | null }) {
  if (status && status !== "completed") return <Badge tone="info">{status === "queued" ? "대기 중" : status === "in_progress" ? "진행 중" : status}</Badge>;
  switch (conclusion) {
    case "success": return <Badge tone="success">성공</Badge>;
    case "failure": return <Badge tone="danger">실패</Badge>;
    case "cancelled": return <Badge>취소됨</Badge>;
    case "skipped": return <Badge>건너뜀</Badge>;
    case "timed_out": return <Badge tone="danger">시간 초과</Badge>;
    case "action_required": return <Badge tone="warning">조치 필요</Badge>;
    case "neutral":
    case "stale": return <Badge>{conclusion}</Badge>;
    default: return <Badge>{conclusion ?? "알 수 없음"}</Badge>;
  }
}
