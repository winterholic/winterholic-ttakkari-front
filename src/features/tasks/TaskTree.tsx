import { useState } from "react";
import { Link } from "react-router";
import type { RunStatus, UUID } from "../../api/types";
import { STATUS_LABEL } from "../chat/runView";
import { Icon } from "../../ui/Icon";
import { sessionTime } from "../../shell/groupSessions";
import { branchStatus, defaultOpen, isActive } from "./buildTree";
import type { TreeItem } from "./buildTree";
import "./tasks.css";

/** 상태는 모양으로도 다르다(색 단독 금지). 실행 중은 민트 점, 대기는 빈 점, 끝은 체크·엑스·금지. */
export function StatusGlyph({ status }: { status: RunStatus | null }) {
  const label = status ? STATUS_LABEL[status] : "지시 전";
  let mark;
  switch (status) {
    case "running":
      mark = <span className="tk-dot tk-dot--live" />;
      break;
    case "queued":
      mark = <span className="task-glyph__ring" />;
      break;
    case "succeeded":
      mark = <Icon name="circle-check" />;
      break;
    case "failed":
      mark = <Icon name="circle-x" />;
      break;
    case "cancelled":
    case "interrupted":
      mark = <Icon name="ban" />;
      break;
    default:
      mark = <span className="tk-dot tk-dot--offline" />;
  }
  return (
    <span className="task-glyph" data-status={status ?? "idle"}>
      <span aria-hidden="true">{mark}</span>
      <span className="tk-sr-only">{label}</span>
    </span>
  );
}

/**
 * 일의 트리. 뿌리는 접수가 넘긴 기획 세션이고, 그 아래로 작업 세션이 몇 겹이든 내려간다.
 * 일이 도는 가지는 안내선이 에이전트 색으로 바뀌어 접혀 있어도 어디서 일하는지 보인다.
 * 펼침은 버튼(aria-expanded), 이동은 링크다. 화살표 키 트리 대신 Tab 순서로 다 닿는 공개 패턴을 쓴다.
 */
export function TaskTree({
  items,
  currentId,
  currentPath,
  label,
  now = new Date(),
}: {
  items: TreeItem[];
  currentId?: UUID;
  /** 뿌리부터 지금 세션까지. 이 경로는 처음부터 펼친다. */
  currentPath?: readonly UUID[];
  label: string;
  now?: Date;
}) {
  // 사용자가 직접 접거나 편 것만 기억하고, 나머지는 매번 기본값(일이 도는 가지)을 따른다.
  const [touched, setTouched] = useState<Map<UUID, boolean>>(new Map());
  const auto = defaultOpen(items, currentPath);
  const isOpen = (id: UUID) => touched.get(id) ?? auto.has(id);
  const toggle = (id: UUID) => setTouched((m) => new Map(m).set(id, !isOpen(id)));

  return (
    <ul className="task-tree" aria-label={label}>
      {items.map((it) => (
        <Branch key={it.node.id} item={it} isOpen={isOpen} toggle={toggle} currentId={currentId} now={now} />
      ))}
    </ul>
  );
}

function Branch({
  item,
  isOpen,
  toggle,
  currentId,
  now,
}: {
  item: TreeItem;
  isOpen: (id: UUID) => boolean;
  toggle: (id: UUID) => void;
  currentId?: UUID;
  now: Date;
}) {
  const { node, children, depth, activeBelow, size } = item;
  const open = children.length > 0 && isOpen(node.id);
  const status = branchStatus(item);
  const current = node.id === currentId;
  // 접힌 가지는 시각 대신 "몇 개 실행 중"을 보여 준다. 펼치면 아래 줄들이 직접 말한다.
  const meta = !open && activeBelow > 0 ? `${activeBelow}개 실행 중` : isActive(node.status) ? "" : sessionTime(node.updated_at, now);
  return (
    <li className="task-tree__item" data-root={depth === 0 ? "" : undefined} data-live={activeBelow > 0 || isActive(node.status) ? "" : undefined}>
      <div className="task-row" data-current={current ? "" : undefined}>
        {children.length > 0 ? (
          <button
            className="task-row__toggle"
            type="button"
            aria-expanded={open}
            aria-label={`${node.title} 하위 ${size}개 ${open ? "접기" : "펼치기"}`}
            onClick={() => toggle(node.id)}
          >
            <Icon name="chevron-right" />
          </button>
        ) : (
          <span className="task-row__toggle" aria-hidden="true" />
        )}
        <Link className="task-row__link" to={`/chat/${node.id}`} aria-current={current ? "page" : undefined} title={node.title}>
          <StatusGlyph status={status} />
          <span className="task-row__title">
            {depth === 0 && node.pool === "work" && <span className="tk-badge tk-badge--info task-row__pool">회사</span>}
            {node.title || "제목 없는 일"}
          </span>
          {meta && <span className="task-row__meta">{meta}</span>}
        </Link>
      </div>
      {open && (
        <ul className="task-tree__children">
          {children.map((c) => (
            <Branch key={c.node.id} item={c} isOpen={isOpen} toggle={toggle} currentId={currentId} now={now} />
          ))}
        </ul>
      )}
    </li>
  );
}
