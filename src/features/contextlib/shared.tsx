import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { ApiError, CATEGORY_LABEL, SCOPE_LABEL } from "../../api/client";
import type { ContextScope, EntityType, LibScope } from "../../api/client";
import { errorText } from "../viewer/api";
import { ErrorState } from "../viewer/screenStates";

/** 종류(category)마다 색을 하나로 고정한다. 필터·정렬로 개수가 바뀌어도 같은 종류는 같은 색이다(디자인 토큰 chart-categorical). */
export const CATEGORY_COLOR: Record<string, string> = {
  projects: "var(--tk-color-chart-categorical-1)",
  "work-history": "var(--tk-color-chart-categorical-2)",
  knowledge: "var(--tk-color-chart-categorical-4)",
  health: "var(--tk-color-chart-categorical-6)",
};
export const TYPE_COLOR: Record<EntityType, string> = {
  project: "var(--tk-color-chart-categorical-1)",
  tool: "var(--tk-color-chart-categorical-2)",
  org: "var(--tk-color-chart-categorical-3)",
  topic: "var(--tk-color-chart-categorical-4)",
  person: "var(--tk-color-chart-categorical-5)",
  place: "var(--tk-color-chart-categorical-6)",
  preference: "var(--tk-color-chart-categorical-6)",
  other: "var(--tk-color-chart-categorical-6)",
};
export const TYPE_LABEL: Record<EntityType, string> = {
  person: "사람", project: "프로젝트", org: "조직", place: "장소", tool: "도구", topic: "주제", preference: "취향", other: "기타",
};
export const KIND_LABEL: Record<string, string> = {
  fact: "사실", preference: "취향", decision: "결정", event: "사건", instruction: "지침", note: "메모",
};
export const MEMORY_SOURCE_LABEL: Record<string, string> = { manual: "직접 입력", agent: "에이전트", ingest: "목록 등록" };
export const CATEGORY_ORDER = ["projects", "work-history", "knowledge", "health"];
export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;
export const scopeLabel = (s: string) => (s === "all" ? "전체" : (SCOPE_LABEL[s as ContextScope] ?? s));
export const SCOPES: { value: LibScope; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "personal", label: "개인" },
  { value: "work", label: "회사" },
];

export const n = (v: number) => v.toLocaleString("ko-KR");
export const shortPath = (p: string) => p.replace(/^\/Users\/[^/]+/, "~");
export const fileName = (p: string) => p.split("/").slice(-1)[0];
export function when(iso: string | null | undefined): string {
  if (!iso) return "없음";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "없음" : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** 마지막 색인이 얼마나 오래됐는지. 숫자만으로는 신선도가 안 읽혀서 같이 보여 준다. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "색인 기록 없음";
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 48) return `${Math.round(min / 60)}시간 전`;
  return `${Math.round(min / 1440)}일 전`;
}

const swatch = (color: string): CSSProperties => ({ "--c": color }) as CSSProperties;

export function Swatch({ color }: { color: string }) {
  return <span className="cl-swatch" style={swatch(color)} aria-hidden />;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" }) {
  return (
    <div className="cl-stat" data-tone={tone}>
      <span className="cl-stat__label">{label}</span>
      <span className="cl-stat__value">{value}</span>
      {hint && <span className="cl-stat__hint">{hint}</span>}
    </div>
  );
}

export interface BarRow { key: string; label: string; value: number; color: string; note?: ReactNode }

/** 가로 막대 목록. 값은 막대 끝에 직접 적어 색만으로 읽지 않게 하고, 막대 길이는 같은 목록의 최댓값 기준이다. */
export function BarList({ rows, label, unit = "" }: { rows: BarRow[]; label: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="cl-note">표시할 값이 없어요.</p>;
  return (
    <ul className="cl-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="cl-bars__row">
          <span className="cl-bars__label"><Swatch color={r.color} />{r.label}</span>
          <span className="cl-bars__track" aria-hidden>
            <span className="cl-bars__fill" style={{ ...swatch(r.color), width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="cl-bars__value">{n(r.value)}{unit}{r.note && <span className="cl-bars__note"> {r.note}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function Legend({ items }: { items: { key: string; label: string; color: string }[] }) {
  return (
    <ul className="cl-legend" aria-label="범례">
      {items.map((i) => (
        <li key={i.key}><Swatch color={i.color} />{i.label}</li>
      ))}
    </ul>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return <span className="tk-badge tk-badge--mono" data-scope={scope}>{scopeLabel(scope)}</span>;
}

/**
 * 라우터 단계 404(code `http_404`)는 대상이 없다는 뜻이 아니라 서버가 이 API 를 모르는 옛 버전이라는 뜻이다.
 * 대상 없음 404 는 `{code: "not_found"}` 로 오므로 구분된다. 원인을 모르면 "다시 시도"만 눌러 보게 되어 안내를 붙인다.
 */
const OUTDATED = "서버가 아직 이 화면의 API 를 모르는 옛 버전이에요. 백엔드를 최신 코드로 다시 시작해야 해요.";
export const isOutdatedServer = (e: unknown): boolean => e instanceof ApiError && e.status === 404 && e.code === "http_404";

export function libErrorMessage(e: unknown): string {
  return isOutdatedServer(e) ? OUTDATED : errorText(e).message;
}

export function LibError({ error, what, onRetry }: { error: unknown; what: string; onRetry: () => void }) {
  return <ErrorState error={isOutdatedServer(error) ? new Error(OUTDATED) : error} what={what} onRetry={onRetry} />;
}

export function Section({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section className="cl-section" aria-labelledby={id}>
      <h2 className="cl-section__title" id={id}>{title}</h2>
      {hint && <p className="cl-note">{hint}</p>}
      {children}
    </section>
  );
}

/** 요소 너비를 따라가는 훅. 그래프·트리맵이 화면 너비에 맞춰 다시 배치하도록 쓴다(ResizeObserver 없는 환경은 기본값). */
export function useWidth(initial = 720): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
