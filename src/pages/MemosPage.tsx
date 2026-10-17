import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { listMemos, listMemoTags } from "../api/client";
import type { MemoCategory } from "../api/client";
import { CategoryDot, CategoryManager, useMemoCategories } from "../features/planner/MemoCategories";
import { MemoEditor } from "../features/planner/MemoEditor";
import { formatWhen } from "../features/viewer/kinds";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
import { useMediaQuery } from "../shell/useMediaQuery";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import "./planner.css";

/** 검색어가 멈춘 뒤에만 서버에 묻는다. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * 메모 상세·편집은 모바일에서 페이지, 데스크톱에서 가운데 모달로 연다.
 * `/memos/new` 는 아직 저장 전인 새 메모다. 편집기를 떠나면 남은 변경을 바로 저장한다.
 *
 * 거르기는 세 겹이다: 카테고리(하나 고르기, 맨 위 칩 줄) → 태그(여러 개, 모두 가진 메모만) → 검색어.
 * 카테고리·태그는 주소(`?c=`, `?t=`)에 두어 메모를 열고 닫거나 새로 고쳐도 보던 자리가 그대로다.
 * 새 메모는 지금 고른 카테고리로 시작한다.
 */
export function MemosPage() {
  const { memoId } = useParams();
  const mobile = useMediaQuery("(max-width: 767px)");
  // 작성 중 회전으로 편집기가 재생성되면 아직 저장 전인 새 메모의 초안과 서버 ID를 잃는다.
  const [editorLayout, setEditorLayout] = useState({ memoId, mobile });
  if (editorLayout.memoId !== memoId) setEditorLayout({ memoId, mobile });
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [manage, setManage] = useState(false);
  const search = useDebounced(q.trim());
  const category = params.get("c") ?? undefined; // 카테고리 id 또는 "none"(미분류)
  const tags = params.getAll("t");
  const qs = params.size ? `?${params}` : "";

  const cats = useMemoCategories();
  const catList = cats.data?.categories ?? [];
  const catById = new Map(catList.map((c) => [c.id, c]));
  const list = useQuery({
    queryKey: ["memos", "list", search, category ?? null, tags],
    queryFn: () => listMemos({ q: search || undefined, tags, category }),
    placeholderData: (prev) => prev,
  });
  const tagCounts = useQuery({ queryKey: ["memos", "tags", category ?? null], queryFn: () => listMemoTags(category), placeholderData: (prev) => prev });
  const memos = list.data?.memos ?? [];

  const update = (fn: (p: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        fn(next);
        return next;
      },
      { replace: true },
    );
  const pickCategory = (c: string | null) =>
    update((p) => {
      if (c) p.set("c", c);
      else p.delete("c");
      // 다른 카테고리에는 그 태그가 없을 수 있어 태그 거르기는 푼다.
      p.delete("t");
    });
  const toggleTag = (t: string) =>
    update((p) => {
      const cur = p.getAll("t");
      p.delete("t");
      for (const x of cur.includes(t) ? cur.filter((y) => y !== t) : [...cur, t]) p.append("t", x);
    });

  // 고른 태그를 앞에 두어, 좁힌 상태가 칩 줄을 넘겨도 보이게 한다.
  const tagNames = [...tags, ...(tagCounts.data?.tags ?? []).map((t) => t.name).filter((n) => !tags.includes(n))];
  const current = category && category !== "none" ? catById.get(category) : undefined;
  const showCategoryOnItems = !category && catList.length > 0;

  if (editorLayout.mobile && memoId) {
    return (
      <div className="tk-screen memo-page">
        <header className="tk-header">
          <div className="tk-header__inner">
            <Link className="tk-icon-button" to={`/memos${qs}`} aria-label="메모 목록으로"><Icon name="back" /></Link>
            <div className="tk-header__title"><h1>{memoId === "new" ? "새 메모" : "메모"}</h1></div>
            <Link className="tk-button tk-button--ghost tk-button--sm" to={`/memos${qs}`}>완료</Link>
          </div>
        </header>
        <section className="tk-screen__body memo-page__body" aria-label="메모 편집">
          <MemoEditor key={memoId} memoId={memoId} defaultCategory={category && category !== "none" ? category : null} />
        </section>
      </div>
    );
  }

  return (
    <div className="tk-screen planner-memos">
      <PageHeader
        title={current ? current.name : category === "none" ? "미분류" : "메모"}
        meta={list.data ? `${memos.length}개` : undefined}
        actions={
          <Link className="tk-button tk-button--sm tk-button--primary" to={`/memos/new${qs}`}>
            <Icon name="plus" />새 메모
          </Link>
        }
      />
      <section className="planner-memos__list tk-screen__body" aria-label="메모 목록">
        <div className="tk-filterbar planner-memos__filters" role="search">
          <div className="tk-chips memo-cats" role="group" aria-label="카테고리">
            <button className="tk-chip" type="button" aria-pressed={!category} onClick={() => pickCategory(null)}>
              전체<span className="memo-chip-count">{cats.data?.total ?? ""}</span>
            </button>
            {catList.map((c) => (
              <CategoryChip key={c.id} cat={c} pressed={category === c.id} onClick={() => pickCategory(category === c.id ? null : c.id)} />
            ))}
            {catList.length > 0 && (cats.data?.uncategorized ?? 0) > 0 && (
              <button className="tk-chip" type="button" aria-pressed={category === "none"} onClick={() => pickCategory(category === "none" ? null : "none")}>
                미분류<span className="memo-chip-count">{cats.data?.uncategorized}</span>
              </button>
            )}
            <button className="tk-chip memo-cats__manage" type="button" onClick={() => setManage(true)} aria-label={catList.length ? "카테고리 편집" : "카테고리 만들기"}>
              <Icon name={catList.length ? "settings" : "plus"} />
              {catList.length ? "편집" : "카테고리"}
            </button>
          </div>
          <span className="tk-input-wrap">
            <Icon name="search" />
            <input className="tk-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={current ? `${current.name}에서 검색` : "메모 검색"} aria-label="메모 검색" />
          </span>
          {tagNames.length > 0 && (
            <div className="tk-chips memo-tags" role="group" aria-label="태그로 좁히기">
              <Icon name="tag" />
              {tagNames.map((t) => (
                <button key={t} className="tk-chip" type="button" aria-pressed={tags.includes(t)} onClick={() => toggleTag(t)}>
                  #{t}
                </button>
              ))}
              {tags.length > 0 && (
                <button className="tk-chip memo-tags__clear" type="button" onClick={() => update((p) => p.delete("t"))}>
                  <Icon name="x" />
                  태그 해제
                </button>
              )}
            </div>
          )}
        </div>
        {list.isPending && <ListSkeleton rows={4} label="메모를 불러오는 중" />}
        {list.isError && <ErrorState error={list.error} what="메모" art="md" onRetry={() => void list.refetch()} />}
        {list.isSuccess && memos.length === 0 && (
          <EmptyState icon="memo" art={search || tags.length ? "state-no-results" : "state-empty"} title={search || tags.length ? "찾는 메모가 없어요" : category ? "이 카테고리에는 메모가 없어요" : "아직 메모가 없어요"}>
            {search || tags.length
              ? "검색어나 태그를 바꿔 보세요."
              : category
                ? "새 메모를 쓰면 이 카테고리에 들어가요."
                : "새 메모를 쓰거나, 따까리에게 \"이거 메모해 둬\"라고 해 보세요."}
          </EmptyState>
        )}
        <ul className="tk-list" aria-label="메모">
          {memos.map((m) => {
            const cat = m.category_id ? catById.get(m.category_id) : undefined;
            return (
              <li key={m.id}>
                <Link className="tk-list__item tk-list__item--interactive" to={`/memos/${m.id}${qs}`} aria-current={m.id === memoId ? "page" : undefined}>
                  <span className="tk-list__body">
                    <span className="tk-list__title">
                      {m.pinned && <Icon name="pin" />}
                      <span className="memo-item__title">{m.title || m.excerpt || "제목 없음"}</span>
                    </span>
                    {m.title && m.excerpt && <span className="tk-list__snippet">{m.excerpt}</span>}
                    <span className="tk-list__meta">
                      {showCategoryOnItems && cat && (
                        <span className="memo-item__cat">
                          <CategoryDot color={cat.color} />
                          {cat.name}
                        </span>
                      )}
                      <span>{formatWhen(m.updated_at)}</span>
                      {m.source === "agent" && <span>따까리</span>}
                      {m.tags.length > 0 && (
                        <span className="memo-item__tags">
                          {m.tags.map((t) => (
                            <span key={t} className="memo-item__tag" data-active={tags.includes(t) || undefined}>
                              #{t}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <Dialog
        open={Boolean(memoId)}
        onClose={() => navigate(`/memos${qs}`, { replace: true })}
        size="lg"
        title={memoId === "new" ? "새 메모" : "메모"}
        modal
        id="memo-dialog"
      >
        {memoId && <MemoEditor key={memoId} memoId={memoId} defaultCategory={current?.id ?? null} />}
      </Dialog>
      <CategoryManager open={manage} onClose={() => setManage(false)} onDeleted={(id) => category === id && pickCategory(null)} />
    </div>
  );
}

function CategoryChip({ cat, pressed, onClick }: { cat: MemoCategory; pressed: boolean; onClick: () => void }) {
  return (
    <button className="tk-chip memo-cat-chip" type="button" aria-pressed={pressed} onClick={onClick}>
      <CategoryDot color={cat.color} />
      <span>{cat.name}</span>
      <span className="memo-chip-count">{cat.count}</span>
    </button>
  );
}
