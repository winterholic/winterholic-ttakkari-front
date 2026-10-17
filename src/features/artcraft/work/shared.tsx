import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { contentBlob, getArtcraftCatalog } from "../../../api/client";
import type { ArtcraftCatalog, ArtcraftCategory, ArtcraftCategoryId, ArtcraftMaturityLevel, ArtcraftOutputItem, ArtcraftTaskState, ArtcraftTaskSummary } from "../../../api/artcraftTypes";
import type { ArtifactOut } from "../../../api/types";
import { Badge, RunBadge } from "../../../ui/Badge";
import type { RunState } from "../../../ui/Badge";
import { Icon, KIND_GLYPH } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";
import { extOf, formatSize, formatWhen } from "../../viewer/kinds";

export const CATALOG_KEY = ["artcraft", "catalog"] as const;

export function useCatalog() {
  return useQuery({ queryKey: CATALOG_KEY, queryFn: getArtcraftCatalog, staleTime: 60_000 });
}

export function findCategory(catalog: ArtcraftCatalog | undefined, id: string | undefined): ArtcraftCategory | undefined {
  return catalog?.categories.find((c) => c.id === id);
}

export const STATE_LABEL: Record<ArtcraftTaskState, string> = {
  queued: "대기 중",
  running: "작업 중",
  done: "완료",
  failed: "실패",
  cancelled: "취소됨",
  interrupted: "중단됨",
};
const RUN_STATE: Record<ArtcraftTaskState, RunState> = {
  queued: "queued",
  running: "running",
  done: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "cancelled",
};
export const isActive = (state: ArtcraftTaskState): boolean => state === "queued" || state === "running";

export function StateBadge({ state }: { state: ArtcraftTaskState }) {
  return <RunBadge state={RUN_STATE[state]}>{STATE_LABEL[state]}</RunBadge>;
}

const LEVEL_TONE: Record<ArtcraftMaturityLevel, "success" | "warning" | "danger"> = { ready: "success", limited: "warning", experimental: "danger" };
export function MaturityBadge({ category }: { category: Pick<ArtcraftCategory, "maturity"> }) {
  return <Badge tone={LEVEL_TONE[category.maturity.level]}>{category.maturity.label}</Badge>;
}

/** 카탈로그 아이콘 이름은 서버가 정한다. 모르는 이름이면 팔레트로 대신한다. */
export function categoryIcon(name: string): IconName {
  const known: IconName[] = ["image", "pen-tool", "smartphone", "layout", "film", "sparkles", "music", "file-pdf", "file-text", "presentation", "sheet", "ruler"];
  return (known as string[]).includes(name) ? (name as IconName) : "palette";
}

export function CategoryGlyph({ category }: { category: Pick<ArtcraftCategory, "icon" | "id"> }) {
  return (
    <span className="acw-glyph" data-category={category.id} aria-hidden="true">
      <Icon name={categoryIcon(category.icon)} />
    </span>
  );
}

export function elapsed(from: string | null, to: string | null, now = Date.now()): string | null {
  if (!from) return null;
  const secs = Math.max(0, Math.round(((to ? new Date(to).getTime() : now) - new Date(from).getTime()) / 1000));
  if (secs < 60) return `${secs}초`;
  const mins = Math.floor(secs / 60);
  return mins < 60 ? `${mins}분 ${secs % 60}초` : `${Math.floor(mins / 60)}시간 ${mins % 60}분`;
}

/** 서버에 있는 이미지 원본을 인증 헤더로 받아 썸네일로 쓴다(<img> 는 토큰을 못 싣는다). 보관함 첨부와 같은 캐시 키를 쓴다. */
function useThumb(a: ArtifactOut): string | null {
  const q = useQuery({
    queryKey: ["artifactImageUrl", a.id],
    queryFn: async () => URL.createObjectURL(await contentBlob(a.id)),
    enabled: a.kind === "image" && a.export_policy !== "sensitive" && a.size_bytes < 12 * 1024 * 1024,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}

export function OutputTile({ artifact, caption, onOpen }: { artifact: ArtifactOut; caption?: string; onOpen: (id: string) => void }) {
  const thumb = useThumb(artifact);
  const g = KIND_GLYPH[artifact.kind] ?? KIND_GLYPH.other;
  return (
    <li className="acw-tile">
      <button type="button" className="acw-tile__btn" aria-label={`${artifact.filename} 열기`} onClick={() => onOpen(artifact.id)}>
        <span className="acw-tile__thumb" data-kind={artifact.kind}>
          {thumb ? <img src={thumb} alt="" draggable={false} loading="lazy" /> : <span className="tk-glyph" data-type={g.type}><Icon name={g.icon} /></span>}
        </span>
        <span className="acw-tile__name">{artifact.filename}</span>
        <span className="acw-tile__meta">
          <span className="tk-ext">{extOf(artifact.filename).toUpperCase() || artifact.kind.toUpperCase()}</span>
          <span>{formatSize(artifact.size_bytes)}</span>
          <span>{formatWhen(artifact.created_at)}</span>
        </span>
        {caption && <span className="acw-tile__caption">{caption}</span>}
      </button>
    </li>
  );
}

export function OutputGrid({ items, onOpen, showTask }: { items: ArtcraftOutputItem[]; onOpen: (id: string) => void; showTask?: boolean }) {
  return (
    <ul className="acw-grid" aria-label="작업물">
      {items.map((it) => (
        <OutputTile key={it.artifact.id} artifact={it.artifact} caption={showTask ? it.task_title : undefined} onOpen={onOpen} />
      ))}
    </ul>
  );
}

export function TaskLink({ task, category }: { task: ArtcraftTaskSummary; category?: ArtcraftCategory }) {
  const live = isActive(task.state);
  return (
    <>
      <Link className="acw-task" to={`/artcraft/t/${task.id}`}>
        {category ? <CategoryGlyph category={category} /> : <span className="acw-glyph" aria-hidden="true"><Icon name="palette" /></span>}
        <span className="acw-task__body">
          <span className="acw-task__title">{task.title}</span>
          <span className="acw-task__meta">
            {category && <span>{category.title}</span>}
            <span>{formatWhen(task.updated_at)}</span>
            {task.output_count > 0 && <span>결과 {task.output_count}개</span>}
            {task.round_count > 1 && <span>{task.round_count}번째 지시</span>}
            {live && (task.waiting_reason || task.progress) && <span>{task.waiting_reason ?? task.progress}</span>}
          </span>
        </span>
        <StateBadge state={task.state} />
      </Link>
    </>
  );
}

export function TaskRow({ task, category }: { task: ArtcraftTaskSummary; category?: ArtcraftCategory }) {
  return <li><TaskLink task={task} category={category} /></li>;
}

export const categoryTitle = (catalog: ArtcraftCatalog | undefined, id: ArtcraftCategoryId): string => findCategory(catalog, id)?.title ?? id;
