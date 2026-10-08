import type { ReactNode } from "react";
import { Icon, KIND_GLYPH } from "../../ui/Icon";
import type { IconName } from "../../ui/Icon";
import type { ArtifactOut } from "../../api/types";
import { errorText } from "./api";
import { extOf, formatSize, formatWhen, retentionSoon } from "./kinds";
import { useOnline } from "./hooks";

/** docs/10 §1: 실제와 같은 개수·모양의 정지 스켈레톤(글리프 + 두 줄 × n행). */
export function ListSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="tk-list" aria-busy="true" aria-label={label}>
      <p className="tk-status tk-status--agent" role="status"><span className="tk-spinner tk-spinner--xs" aria-hidden />{label}</p>
      {Array.from({ length: rows }, (_, i) => (
        <div className="tk-list__item" key={i} aria-hidden>
          <span className="tk-skeleton tk-skeleton--glyph" />
          <span className="tk-list__body">
            <span className="tk-skeleton tk-skeleton--text" />
            <span className="tk-skeleton tk-skeleton--text" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 빈 상태는 오류가 아니다. 빨강·경고색 금지(docs/10 §2). */
export function EmptyState({ icon, title, children, actions }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="tk-empty">
      <Icon name={icon} />
      <p className="tk-empty__title">{title}</p>
      {children && <p>{children}</p>}
      {actions && <div className="tk-button-group">{actions}</div>}
    </div>
  );
}

/** 무엇이 잘못됐는지 → 왜 → 지금 할 수 있는 것. 기계 코드는 모노로 덧붙인다(docs/10 §3). */
export function ErrorState({ error, onRetry, what }: { error: unknown; onRetry: () => void; what: string }) {
  const online = useOnline();
  const e = errorText(error);
  return (
    <div className="tk-empty tk-empty--boxed" role="alert">
      <Icon name={online ? "warning" : "wifi-off"} />
      <p className="tk-empty__title">{online ? `${what}을(를) 불러오지 못했어요` : "오프라인이에요"}</p>
      <p>{online ? e.message : "연결이 돌아오면 다시 시도해 주세요."}{e.code && <> <code>{e.code}</code></>}</p>
      <div className="tk-button-group"><button className="tk-button" type="button" onClick={onRetry}><Icon name="retry" />다시 시도</button></div>
    </div>
  );
}

/** 결과물 한 줄의 안쪽(글리프 · 이름과 메타 · 정책 배지). 보관함·작업 공간이 같은 모양을 쓴다(docs/09 §1). */
export function ArtifactRowContent({ a, extraMeta }: { a: ArtifactOut; extraMeta?: ReactNode }) {
  const g = KIND_GLYPH[a.kind] ?? KIND_GLYPH.other;
  const icon: IconName = a.kind === "html" ? "globe" : g.icon;
  const soon = retentionSoon(a.retention_until);
  const convert = a.kind === "pptx" || a.kind === "docx";
  return (
    <>
      <span className="tk-glyph" data-type={g.type}><Icon name={icon} /></span>
      <span className="tk-list__body">
        <span className="tk-list__title">{a.filename}</span>
        <span className="tk-list__meta">
          <span className="tk-ext">{extOf(a.filename).toUpperCase() || a.kind.toUpperCase()}</span>
          {extraMeta}
          <span>{formatSize(a.size_bytes)}</span>
          <span>{formatWhen(a.created_at)}</span>
          {convert && a.preview_status === "ready" && <span>변환 미리보기</span>}
          {convert && (a.preview_status === "pending" || a.preview_status === "processing") && (
            <span className="tk-artifact__status"><span className="tk-spinner tk-spinner--xs" aria-hidden />미리보기 만드는 중</span>
          )}
          {convert && a.preview_status === "failed" && <span className="tk-badge tk-badge--danger">변환 실패</span>}
          {soon && <span className="tk-retention" data-soon><Icon name="clock" />{soon}</span>}
        </span>
      </span>
      {(a.export_policy !== "allow" || !a.downloadable) && (
        <span className="tk-list__end">
          {a.export_policy === "sensitive" ? (
            <span className="tk-policy" data-policy="restricted"><Icon name="lock" />민감</span>
          ) : (
            <span className="tk-policy" data-policy="blocked"><Icon name="ban" />반출 차단</span>
          )}
        </span>
      )}
    </>
  );
}
