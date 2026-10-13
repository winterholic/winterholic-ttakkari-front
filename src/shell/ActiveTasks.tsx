import { Link } from "react-router";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { buildForest, isActive } from "../features/tasks/buildTree";
import type { TreeItem } from "../features/tasks/buildTree";
import { TaskTree } from "../features/tasks/TaskTree";
import { useActiveTasks, useTaskTree } from "../features/tasks/useTasks";

const live = (t: TreeItem) => t.activeBelow > 0 || isActive(t.node.status);

/**
 * 사이드바·드로어: ChatGPT 식 대화 목록 대신 지금 도는 일의 트리. 대화는 따까리 하나뿐이고(맨 위 "채팅"),
 * 그 아래로 뻗은 일만 여기 보인다. 끝난 지 오래된 일은 지난 작업 서고(/tasks)로 간다.
 */
export function ActiveTasks({ currentId }: { currentId?: string }) {
  const q = useActiveTasks();
  // 지금 보는 세션의 경로를 펼친다. 서고에서 연 옛 일이라 진행 중 목록에 없으면 "지금 보는 일"로 따로 보여 준다.
  const tree = useTaskTree(currentId);
  const path = tree.data?.path.map((n) => n.id);
  const inForest = !!currentId && !!q.data?.nodes.some((n) => n.id === currentId);
  const viewing = !inForest && tree.data && tree.data.path[0]?.kind !== "desk" ? buildForest([tree.data.root_id], tree.data.nodes) : [];

  if (q.isPending) {
    return (
      <div className="tk-sidebar__group" aria-busy="true" aria-label="진행 중인 일을 불러오는 중">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tk-skeleton tk-skeleton--text" />
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="tk-sidebar__group">
        <p className="tk-status tk-status--danger" role="status">
          <Icon name="circle-x" />
          진행 중인 일을 못 불러왔어요
        </p>
        <Button size="sm" onClick={() => void q.refetch()}>
          <Icon name="retry" />
          다시 시도
        </Button>
      </div>
    );
  }
  const forest = buildForest(q.data.roots, q.data.nodes);
  const running = forest.filter(live);
  const recent = forest.filter((t) => !live(t));
  return (
    <>
      {viewing.length > 0 && (
        <div className="tk-sidebar__group active-tasks">
          <p className="tk-sidebar__label">지금 보는 일</p>
          <TaskTree items={viewing} currentId={currentId} currentPath={path} label="지금 보는 일" />
        </div>
      )}
      <div className="tk-sidebar__group active-tasks">
        <p className="tk-sidebar__label">
          진행 중
          {running.length > 0 && <span className="tk-numeric">{running.length}</span>}
        </p>
        {running.length > 0 ? (
          <TaskTree items={running} currentId={currentId} currentPath={path} label="진행 중인 일" />
        ) : (
          <p className="active-tasks__empty">지금 도는 일이 없어요. 따까리에게 맡긴 일이 여기서 가지를 뻗어요.</p>
        )}
      </div>
      {recent.length > 0 && (
        <div className="tk-sidebar__group active-tasks">
          <p className="tk-sidebar__label">최근 끝남</p>
          <TaskTree items={recent} currentId={currentId} currentPath={path} label="최근 끝난 일" />
        </div>
      )}
      <Link className="tk-nav__link active-tasks__more" to="/tasks">
        <Icon name="history" />
        지난 작업 모두 보기
      </Link>
    </>
  );
}
