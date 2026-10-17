import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { listArtcraftTasks, patchArtcraftTask } from "../../../api/client";
import type { ArtcraftCategory } from "../../../api/artcraftTypes";
import { useForegroundResync } from "../../../hooks/useForegroundResync";
import { PageHeader } from "../../../shell/PageHeader";
import { Badge } from "../../../ui/Badge";
import { IconButton } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { toast } from "../../../ui/toastStore";
import { ArtifactViewerHost, useArtifactViewer } from "../../viewer";
import { errorText } from "../../viewer/api";
import { EmptyState, ErrorState, ListSkeleton } from "../../viewer/screenStates";
import { InstructForm } from "./InstructForm";
import { OutputFollowup } from "./OutputFollowup";
import { OutputsGallery } from "./OutputsGallery";
import { CategoryGlyph, MaturityBadge, TaskLink, findCategory, useCatalog } from "./shared";

type Tab = "instruct" | "outputs" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "instruct", label: "지시" },
  { id: "outputs", label: "작업물" },
  { id: "history", label: "이력" },
];

function Abilities({ category }: { category: ArtcraftCategory }) {
  return (
    <details className="acw-abilities">
      <summary>되는 일 · 아직 안 되는 일</summary>
      <div className="acw-abilities__body">
        <section aria-label="되는 일">
          <h3 className="acw-block__title"><Icon name="circle-check" /> 되는 일</h3>
          <ul>{category.can.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
        <section aria-label="아직 안 되는 일">
          <h3 className="acw-block__title"><Icon name="ban" /> 아직 안 되는 일</h3>
          <ul>{category.cannot.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
        <p className="ac-note">{category.maturity.summary} 결과는 새 파일로 저장되고 원본은 그대로예요.</p>
      </div>
    </details>
  );
}

function History({ category }: { category: ArtcraftCategory }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["artcraft", "tasks", { category: category.id }], queryFn: () => listArtcraftTasks({ category: category.id, limit: 60 }), refetchInterval: 10_000 });
  const archive = useMutation({
    mutationFn: (id: string) => patchArtcraftTask(id, { archived: true }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["artcraft", "tasks"] }); toast({ message: "이력에서 숨겼어요. 작업물은 그대로 남아요." }); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  if (list.isPending) return <ListSkeleton label="작업 이력을 불러오는 중" rows={4} />;
  if (list.isError) return <ErrorState what="작업 이력" error={list.error} onRetry={() => void list.refetch()} />;
  const items = list.data.items;
  if (items.length === 0) return <EmptyState icon="history" title="아직 시킨 작업이 없어요">지시 탭에서 첫 작업을 시켜 보세요.</EmptyState>;
  return (
    <ul className="acw-tasks" aria-label={`${category.title} 작업 이력`}>
      {items.map((t) => (
        <li key={t.id} className="acw-tasks__item">
          <TaskLink task={t} category={category} />
          <IconButton size="sm" aria-label={`${t.title} 이력에서 숨기기`} onClick={() => archive.mutate(t.id)} disabled={archive.isPending}><Icon name="library" /></IconButton>
        </li>
      ))}
    </ul>
  );
}

/** 범주 세부 페이지. 지시 · 작업물 · 이력 세 탭. */
export function CategoryScreen({ categoryId }: { categoryId: string }) {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const catalog = useCatalog();
  const viewer = useArtifactViewer();
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["artcraft"] }); });
  const category = findCategory(catalog.data, categoryId);
  const requested = params.get("tab");
  const tab: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : "instruct";
  const go = (next: Tab) => setParams(next === "instruct" ? {} : { tab: next }, { replace: true });

  return (
    <div className="tk-screen">
      <PageHeader
        title={category?.title ?? "ArtCraft"}
        meta={category?.tagline}
        actions={<Link className="tk-button tk-button--ghost tk-button--sm" to="/artcraft"><Icon name="back" /><span>전체</span></Link>}
      />
      <ArtifactViewerHost followup={viewer.current ? <OutputFollowup artifactId={viewer.current} /> : undefined}>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--lg">
            <div className="ac">
              {catalog.isPending ? <ListSkeleton label="범주를 불러오는 중" rows={3} />
                : catalog.isError ? <ErrorState what="작업 범주" error={catalog.error} onRetry={() => void catalog.refetch()} />
                  : !category ? <EmptyState icon="palette" title="없는 작업 범주예요" actions={<Link className="tk-button" to="/artcraft">ArtCraft 처음으로</Link>} />
                    : (
                      <>
                        <header className="acw-intro">
                          <CategoryGlyph category={category} />
                          <div className="acw-intro__text">
                            <p className="acw-intro__lead"><MaturityBadge category={category} /> <span className="ac-sub">{category.maturity.summary}</span></p>
                            <p className="ac-sub">
                              담당 앱: {category.apps.map((a, i) => <span key={a.app}>{i > 0 && " · "}<strong>{a.title}</strong>{!a.installed && <Badge tone="danger">없음</Badge>} ({a.role})</span>)}
                            </p>
                          </div>
                        </header>
                        {!catalog.data?.available && (
                          <p className="tk-error" role="alert"><Icon name="warning" /> ArtCraft 저장소를 쓸 수 없어서 작업을 시킬 수 없어요{catalog.data?.unavailable_reason ? ` · ${catalog.data.unavailable_reason}` : ""}</p>
                        )}
                        <div className="tk-tablist" role="tablist" aria-label={`${category.title} 보기`}>
                          {TABS.map((t) => (
                            <button key={t.id} role="tab" type="button" className="tk-tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>
                          ))}
                        </div>
                        {tab === "instruct" && (
                          <>
                            <Abilities category={category} />
                            <InstructForm category={category} workspaceId={catalog.data?.workspace_id ?? null} maxFiles={catalog.data?.limits.files ?? 10} initialTemplate={params.get("template")} />
                          </>
                        )}
                        {tab === "outputs" && <OutputsGallery category={category.id} onOpen={viewer.open} />}
                        {tab === "history" && <History category={category} />}
                      </>
                    )}
            </div>
          </div>
        </div>
      </ArtifactViewerHost>
    </div>
  );
}
