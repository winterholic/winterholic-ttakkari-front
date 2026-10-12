import type { ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon } from "./Icon";
import "./sortable.css";

/**
 * 손잡이로 끌어 순서를 바꾸는 목록. 터치(길게 누르기)·마우스·키보드(손잡이에 포커스 → Space → 화살표) 모두 된다.
 * 손잡이에서만 끌리게 해 목록 안의 스위치·메뉴 버튼은 그대로 눌린다.
 */
export function SortableList<T extends { id: string }>({
  items, onReorder, render, label, disabled = false,
}: {
  items: T[];
  disabled?: boolean;
  onReorder: (next: T[]) => void;
  render: (item: T, index: number, handle: ReactNode) => ReactNode;
  label: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // 폰에서는 스크롤과 구분하려고 잠깐 눌러야 끌린다.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((x) => x.id === e.active.id);
    const to = items.findIndex((x) => x.id === e.over!.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: { draggable: "Space 로 집고 위·아래 화살표로 옮긴 뒤 Space 로 놓아요." } }}>
      <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ol className="tk-list sortable-list" aria-label={label}>
          {items.map((item, i) => <SortableRow key={item.id} id={item.id} disabled={disabled}>{(handle) => render(item, i, handle)}</SortableRow>)}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, disabled, children }: { id: string; disabled?: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = (
    <button ref={setActivatorNodeRef} className="sortable-handle" type="button" disabled={disabled} aria-label="끌어서 순서 바꾸기" {...attributes} {...listeners}>
      <Icon name="grip" />
    </button>
  );
  return (
    <li ref={setNodeRef} className="sortable-row" data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children(handle)}
    </li>
  );
}
