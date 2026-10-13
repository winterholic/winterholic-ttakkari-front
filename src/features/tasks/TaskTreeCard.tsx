import type { UUID } from "../../api/types";
import { Icon } from "../../ui/Icon";
import { branchStatus, buildForest, isActive } from "./buildTree";
import type { TreeItem } from "./buildTree";
import { StatusGlyph, TaskTree } from "./TaskTree";
import { useTaskTree } from "./useTasks";

function summary(root: TreeItem): string {
  let live = 0, done = 0, failed = 0;
  const walk = (t: TreeItem) =>
    t.children.forEach((c) => {
      if (isActive(c.node.status)) live += 1;
      else if (c.node.status === "succeeded") done += 1;
      else if (c.node.status === "failed") failed += 1;
      walk(c);
    });
  walk(root);
  return [live && `${live}개 실행 중`, done && `완료 ${done}`, failed && `실패 ${failed}`].filter(Boolean).join(" · ");
}

/**
 * 대화 안에서 자라는 일의 트리(back ADR 0014). 따까리가 일을 넘긴 답 바로 아래에 붙고,
 * 기획 세션이 작업 세션을 나눌 때마다 가지가 늘어난다. 줄을 누르면 옆 서랍에 그 세션이 열린다.
 */
export function TaskTreeCard({ rootId, selectedId, onSelect }: { rootId: UUID; selectedId?: UUID | null; onSelect: (id: UUID) => void }) {
  const q = useTaskTree(rootId, { idlePoll: false });
  if (q.isPending)
    return (
      <div className="tree-card" aria-busy="true" aria-label="맡긴 일을 불러오는 중">
        <div className="tk-skeleton tk-skeleton--text" />
      </div>
    );
  if (q.isError)
    return (
      <div className="tree-card">
        <p className="tree-card__note">
          맡긴 일을 불러오지 못했어요.{" "}
          <button className="tk-button tk-button--xs" type="button" onClick={() => void q.refetch()}>
            다시 시도
          </button>
        </p>
      </div>
    );
  const [root] = buildForest([q.data.root_id], q.data.nodes);
  if (!root) return null;
  const status = branchStatus(root);
  const live = isActive(status);
  const sum = summary(root);
  return (
    <section className="tree-card" data-live={live ? "" : undefined} aria-label={`맡긴 일: ${root.node.title}`}>
      <div className="tree-card__head">
        <StatusGlyph status={status} />
        <button
          className="tree-card__title"
          type="button"
          aria-pressed={selectedId === root.node.id}
          onClick={() => onSelect(root.node.id)}
        >
          {root.node.title || "제목 없는 일"}
          <Icon name="chevron-right" />
        </button>
        {sum && <span className="tree-card__summary">{sum}</span>}
      </div>
      {!live && root.node.last_result && <p className="tree-card__result">{root.node.last_result}</p>}
      {root.children.length > 0 ? (
        <TaskTree items={root.children} label={`${root.node.title}의 가지`} variant="card" onSelect={onSelect} currentId={selectedId ?? undefined} />
      ) : (
        live && (
          <p className="tree-card__note">
            <span className="tk-dot tk-dot--live" aria-hidden="true" />
            기획 세션이 일을 나누는 중
          </p>
        )
      )}
    </section>
  );
}
