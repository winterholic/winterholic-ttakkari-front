import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CATEGORY_COLORS, createMemoCategory, deleteMemoCategory, listMemoCategories, orderMemoCategories, patchMemoCategory,
} from "../../api/client";
import type { CategoryColor, MemoCategoriesOut, MemoCategory } from "../../api/client";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { SortableList } from "../../ui/SortableList";
import { errorText } from "../viewer/api";

export const CATEGORIES_KEY = ["memos", "categories"] as const;

const COLOR_NAMES: Record<CategoryColor, string> = { blue: "파랑", green: "초록", amber: "주황", violet: "보라", red: "빨강", gray: "회색" };

export function useMemoCategories() {
  return useQuery({ queryKey: CATEGORIES_KEY, queryFn: listMemoCategories, staleTime: 30_000 });
}

/** 카테고리 색 점. 색이 없으면 테두리만 그린다. */
export function CategoryDot({ color }: { color: CategoryColor | null }) {
  return <span className="memo-cat-dot" data-color={color ?? undefined} aria-hidden />;
}

/** 새 카테고리는 아직 덜 쓴 색을 받는다. 고르지 않아도 목록에서 바로 구분되게. */
function nextColor(cats: MemoCategory[]): CategoryColor {
  const used = (c: CategoryColor) => cats.filter((x) => x.color === c).length;
  return [...CATEGORY_COLORS].sort((a, b) => used(a) - used(b))[0];
}

/**
 * 카테고리 관리(가운데 모달). 이름은 칸에서 바로 고치고(Enter·포커스 아웃에 저장), 손잡이로 순서를 바꾸고,
 * 점을 눌러 색을 고른다. 지우면 그 카테고리의 메모는 미분류로 남는다.
 */
export function CategoryManager({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted?: (id: string) => void }) {
  const qc = useQueryClient();
  const cats = useMemoCategories();
  const list = cats.data?.categories ?? [];
  const [draft, setDraft] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MemoCategory | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["memos"] });

  const add = useMutation({
    mutationFn: (name: string) => createMemoCategory({ name, color: nextColor(list) }),
    onSuccess: () => {
      setDraft("");
      void refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (p: { id: string; name?: string; color?: CategoryColor | null }) => patchMemoCategory(p.id, p),
    onSettled: () => void refresh(),
  });
  const order = useMutation({
    mutationFn: (next: MemoCategory[]) => orderMemoCategories(next.map((c) => c.id)),
    onMutate: (next) => {
      // 끌어 놓은 순서를 바로 보여 준다. 실패하면 다시 불러와 되돌린다.
      qc.setQueryData<MemoCategoriesOut>(CATEGORIES_KEY, (d) => (d ? { ...d, categories: next } : d));
    },
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (c: MemoCategory) => deleteMemoCategory(c.id),
    onSuccess: (_, c) => {
      setToDelete(null);
      onDeleted?.(c.id);
      void refresh();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name) add.mutate(name);
  };
  const rename = (c: MemoCategory, value: string) => {
    const name = value.trim();
    if (name && name !== c.name) patch.mutate({ id: c.id, name });
  };
  const err = add.error ?? patch.error ?? order.error ?? del.error;

  return (
    <Dialog open={open} onClose={onClose} title="카테고리" id="memo-categories">
      <div className="memo-cats-manage">
        {list.length > 0 ? (
          <SortableList
            items={list}
            label="카테고리 순서"
            onReorder={(next) => order.mutate(next)}
            render={(c, _i, handle) => (
              <div className="memo-cats-manage__row">
                {handle}
                <button
                  type="button"
                  className="memo-cats-manage__color"
                  aria-label={`${c.name} 색 고르기`}
                  aria-expanded={colorFor === c.id}
                  onClick={() => setColorFor(colorFor === c.id ? null : c.id)}
                >
                  <CategoryDot color={c.color} />
                </button>
                <input
                  key={c.name}
                  className="tk-input tk-input--sm memo-cats-manage__name"
                  defaultValue={c.name}
                  maxLength={30}
                  aria-label={`${c.name} 이름`}
                  enterKeyHint="done"
                  onBlur={(e) => rename(c, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
                  }}
                />
                <span className="memo-cats-manage__count">{c.count}</span>
                <button className="tk-icon-button tk-icon-button--sm" type="button" aria-label={`${c.name} 지우기`} onClick={() => setToDelete(c)}>
                  <Icon name="trash" />
                </button>
                {colorFor === c.id && (
                  <div className="memo-cats-manage__swatches" role="radiogroup" aria-label={`${c.name} 색`}>
                    {[null, ...CATEGORY_COLORS].map((color) => (
                      <button
                        key={color ?? "none"}
                        type="button"
                        role="radio"
                        aria-checked={c.color === color}
                        aria-label={color ? COLOR_NAMES[color] : "색 없음"}
                        className="memo-cats-manage__swatch"
                        onClick={() => {
                          patch.mutate({ id: c.id, color });
                          setColorFor(null);
                        }}
                      >
                        <CategoryDot color={color} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          />
        ) : (
          <p className="tk-help">카테고리로 메모를 나눠 두면 위쪽 줄에서 한 번에 바꿔 볼 수 있어요. 예) 회사, 집, 공부</p>
        )}
        <form className="memo-cats-manage__add" onSubmit={submit}>
          <input
            className="tk-input"
            value={draft}
            maxLength={30}
            placeholder="새 카테고리 이름"
            aria-label="새 카테고리 이름"
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" variant="primary" busy={add.isPending} disabled={!draft.trim()}>
            추가
          </Button>
        </form>
        {err && (
          <p className="tk-error" role="alert">
            {errorText(err).message}
          </p>
        )}
      </div>

      <Dialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={`'${toDelete?.name ?? ""}' 카테고리를 지울까요?`}
        footer={
          <div className="tk-button-group tk-button-group--end">
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              취소
            </Button>
            <Button variant="danger" busy={del.isPending} onClick={() => toDelete && del.mutate(toDelete)}>
              지우기
            </Button>
          </div>
        }
        id="memo-category-delete"
      >
        <p>{toDelete?.count ? `메모 ${toDelete.count}개는 지우지 않고 미분류로 옮겨요.` : "이 카테고리에는 메모가 없어요."}</p>
      </Dialog>
    </Dialog>
  );
}
