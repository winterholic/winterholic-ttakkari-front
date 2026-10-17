import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { listArtcraftOutputs, listArtcraftTasks } from "../../../api/client";
import type { ArtcraftCategory } from "../../../api/artcraftTypes";
import { useForegroundResync } from "../../../hooks/useForegroundResync";
import { PageHeader } from "../../../shell/PageHeader";
import { Icon } from "../../../ui/Icon";
import { ArtifactViewerHost, useArtifactViewer } from "../../viewer";
import { ErrorState, ListSkeleton } from "../../viewer/screenStates";
import { OutputFollowup } from "./OutputFollowup";
import { CategoryGlyph, MaturityBadge, OutputGrid, TaskRow, findCategory, isActive, useCatalog } from "./shared";

function CategoryCard({ category }: { category: ArtcraftCategory }) {
  return (
    <li>
      <Link className="acw-card" to={`/artcraft/c/${category.id}`}>
        <CategoryGlyph category={category} />
        <span className="acw-card__title">{category.title}</span>
        <span className="acw-card__tag">{category.tagline}</span>
        <span className="acw-card__foot">
          <MaturityBadge category={category} />
          <span className="acw-card__apps">{category.apps.map((a) => a.title).join(" · ")}</span>
        </span>
      </Link>
    </li>
  );
}

/** ArtCraft 허브: 진행 중 작업 → 범주 카드(이미지·영상·소리·문서·도면) → 최근 작업물·작업. */
export function HubScreen() {
  const qc = useQueryClient();
  const viewer = useArtifactViewer();
  const catalog = useCatalog();
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["artcraft"] }); });
  const tasks = useQuery({ queryKey: ["artcraft", "tasks", { scope: "hub" }], queryFn: () => listArtcraftTasks({ limit: 12 }), refetchInterval: 5000 });
  const outputs = useQuery({ queryKey: ["artcraft", "outputs", { scope: "hub" }], queryFn: () => listArtcraftOutputs({ limit: 6 }), staleTime: 15_000 });
  const active = tasks.data?.items.filter((t) => isActive(t.state)) ?? [];
  const recent = tasks.data?.items.filter((t) => !isActive(t.state)).slice(0, 5) ?? [];
  const data = catalog.data;

  return (
    <div className="tk-screen">
      <PageHeader
        title="ArtCraft"
        meta="에이전트에게 창작 작업 시키기"
        actions={<Link className="tk-button tk-button--ghost tk-button--sm" to="/artcraft/manage"><Icon name="settings" /><span>관리</span></Link>}
      />
      <ArtifactViewerHost followup={viewer.current ? <OutputFollowup artifactId={viewer.current} /> : undefined}>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--lg">
            <div className="ac acw-hub">
              <p className="ac-note">사진·PDF·문서·영상 같은 파일을 올리고 말로 시키면, 에이전트가 ArtCraft 앱으로 작업해 결과 파일을 돌려줘요. 하고 싶은 일을 골라 보세요.</p>
              {data && !data.available && (
                <p className="tk-error" role="alert"><Icon name="warning" /> ArtCraft 저장소를 쓸 수 없어서 작업을 시킬 수 없어요{data.unavailable_reason ? ` · ${data.unavailable_reason}` : ""}</p>
              )}
              {active.length > 0 && (
                <section className="acw-section" aria-label="진행 중 작업">
                  <h2 className="acw-section__title"><span className="tk-dot tk-dot--live" aria-hidden="true" /> 진행 중 {active.length}</h2>
                  <ul className="acw-tasks">{active.map((t) => <TaskRow key={t.id} task={t} category={findCategory(data, t.category)} />)}</ul>
                </section>
              )}
              {catalog.isPending ? <ListSkeleton label="작업 범주를 불러오는 중" rows={4} />
                : catalog.isError ? <ErrorState what="작업 범주" error={catalog.error} onRetry={() => void catalog.refetch()} />
                  : data?.sections.map((section) => (
                    <section className="acw-section" key={section.id} aria-label={section.title}>
                      <h2 className="acw-section__title">{section.title}</h2>
                      <ul className="acw-cards">
                        {section.categories.map((id) => {
                          const category = findCategory(data, id);
                          return category ? <CategoryCard key={id} category={category} /> : null;
                        })}
                      </ul>
                    </section>
                  ))}
              {(outputs.data?.items.length ?? 0) > 0 && (
                <section className="acw-section" aria-label="최근 작업물">
                  <h2 className="acw-section__title">최근 작업물</h2>
                  <OutputGrid items={outputs.data?.items ?? []} onOpen={viewer.open} showTask />
                </section>
              )}
              {recent.length > 0 && (
                <section className="acw-section" aria-label="최근 작업">
                  <h2 className="acw-section__title">최근 작업</h2>
                  <ul className="acw-tasks">{recent.map((t) => <TaskRow key={t.id} task={t} category={findCategory(data, t.category)} />)}</ul>
                </section>
              )}
            </div>
          </div>
        </div>
      </ArtifactViewerHost>
    </div>
  );
}
