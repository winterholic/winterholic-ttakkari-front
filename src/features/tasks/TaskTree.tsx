import { useState } from "react";
import type React from "react";
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
export interface TaskTreeProps {
  items: TreeItem[];
  currentId?: UUID;
  /** 뿌리부터 지금 세션까지. 이 경로는 처음부터 펼친다. */
  currentPath?: readonly UUID[];
  label: string;
  now?: Date;
  /** 주면 줄이 이동 링크 대신 고르기 버튼이 된다(대화 안 트리 카드 → 옆 서랍). */
  onSelect?: (id: UUID) => void;
  /** card: 대화 안 트리 카드. 끝난 줄 아래에 결과 한 줄을 붙인다. */
  variant?: "nav" | "card";
}

export function TaskTree({ items, currentId, currentPath, label, now = new Date(), onSelect, variant = "nav" }: TaskTreeProps) {
  // 사용자가 직접 접거나 편 것만 기억하고, 나머지는 매번 기본값(일이 도는 가지)을 따른다.
  const [touched, setTouched] = useState<Map<UUID, boolean>>(new Map());
  const auto = defaultOpen(items, currentPath);
  const isOpen = (id: UUID) => touched.get(id) ?? auto.has(id);
  const toggle = (id: UUID) => setTouched((m) => new Map(m).set(id, !isOpen(id)));

  return (
    <ul className="task-tree" data-variant={variant} aria-label={label}>
      {items.map((it) => (
        <Branch key={it.node.id} item={it} isOpen={isOpen} toggle={toggle} currentId={currentId} now={now} onSelect={onSelect} card={variant === "card"} />
      ))}
    </ul>
  );
}

interface BranchProps {
  item: TreeItem;
  isOpen: (id: UUID) => boolean;
  toggle: (id: UUID) => void;
  currentId?: UUID;
  now: Date;
  onSelect?: (id: UUID) => void;
  card: boolean;
}

function Branch(props: BranchProps) {
  const { item, isOpen, toggle, currentId, now, onSelect, card } = props;
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
        <RowLink id={node.id} title={node.title} current={current} onSelect={onSelect}>
          <StatusGlyph status={status} />
          <span className="task-row__body">
            <span className="task-row__title">
              {depth === 0 && node.pool === "work" && <span className="tk-badge tk-badge--info task-row__pool">회사</span>}
              {node.title || "제목 없는 일"}
            </span>
            {/* 카드에서는 끝난 일의 결과를 한 줄 붙여 트리만 훑어도 무엇이 나왔는지 보이게 한다 */}
            {card && node.last_result && !isActive(node.status) && <span className="task-row__result">{node.last_result}</span>}
          </span>
          {meta && <span className="task-row__meta">{meta}</span>}
        </RowLink>
      </div>
      {open && (
        <ul className="task-tree__children">
          {children.map((c) => (
            <Branch key={c.node.id} {...props} item={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function RowLink({
  id,
  title,
  current,
  onSelect,
  children,
}: {
  id: UUID;
  title: string;
  current: boolean;
  onSelect?: (id: UUID) => void;
  children: React.ReactNode;
}) {
  if (onSelect)
    return (
      <button className="task-row__link" type="button" aria-pressed={current} title={title} onClick={() => onSelect(id)}>
        {children}
      </button>
    );
  return (
    <Link className="task-row__link" to={`/chat/${id}`} aria-current={current ? "page" : undefined} title={title}>
      {children}
    </Link>
  );
}
