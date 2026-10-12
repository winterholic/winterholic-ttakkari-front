import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { listMemos, listMemoTags } from "../api/client";
import { MemoEditor } from "../features/planner/MemoEditor";
import { formatWhen } from "../features/viewer/kinds";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { PageHeader } from "../shell/PageHeader";
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
 * 메모(ADR 0008). 화면은 목록이고, 메모 상세·편집은 `/memos/:id` 일 때 가운데 모달로 연다(전체 화면 패널은 쓰지 않는다).
 * `/memos/new` 는 아직 저장 전인 새 메모다. 모달을 닫으면 편집기가 내려가며 남은 변경을 바로 저장한다.
 */
export function MemosPage() {
  const { memoId } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const search = useDebounced(q.trim());
  const list = useQuery({ queryKey: ["memos", search, tag], queryFn: () => listMemos({ q: search || undefined, tag: tag ?? undefined }), placeholderData: (prev) => prev });
  const tags = useQuery({ queryKey: ["memos", "tags"], queryFn: listMemoTags });
  const memos = list.data?.memos ?? [];

  return (
    <div className="tk-screen planner-memos">
      <PageHeader
        title="메모"
        meta={list.data ? `${memos.length}개` : undefined}
        actions={
          <Link className="tk-button tk-button--sm tk-button--primary" to="/memos/new">
            <Icon name="plus" />새 메모
          </Link>
        }
      />
      <section className="planner-memos__list tk-screen__body" aria-label="메모 목록">
        <div className="tk-filterbar" role="search">
          <span className="tk-input-wrap">
            <Icon name="search" />
            <input className="tk-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="메모 검색" aria-label="메모 검색" />
          </span>
          {tags.data && tags.data.tags.length > 0 && (
            <div className="tk-chips" role="group" aria-label="태그">
              <button className="tk-chip" type="button" aria-pressed={tag === null} onClick={() => setTag(null)}>
                전체
              </button>
              {tags.data.tags.map((t) => (
                <button key={t.name} className="tk-chip" type="button" aria-pressed={tag === t.name} onClick={() => setTag(tag === t.name ? null : t.name)}>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {list.isPending && <ListSkeleton rows={4} label="메모를 불러오는 중" />}
        {list.isError && <ErrorState error={list.error} what="메모" onRetry={() => void list.refetch()} />}
        {list.isSuccess && memos.length === 0 && (
          <EmptyState icon="memo" title={search || tag ? "찾는 메모가 없어요" : "아직 메모가 없어요"}>
            {search || tag ? "검색어나 태그를 바꿔 보세요." : "새 메모를 쓰거나, 따까리에게 \"이거 메모해 둬\"라고 해 보세요."}
          </EmptyState>
        )}
        <ul className="tk-list" aria-label="메모">
          {memos.map((m) => (
            <li key={m.id}>
              <Link className="tk-list__item tk-list__item--interactive" to={`/memos/${m.id}`} aria-current={m.id === memoId ? "page" : undefined}>
                <span className="tk-list__body">
                  <span className="tk-list__title">
                    {m.pinned && <Icon name="pin" />}
                    {m.title || m.excerpt || "제목 없음"}
                  </span>
                  {m.title && m.excerpt && <span className="tk-list__snippet">{m.excerpt}</span>}
                  <span className="tk-list__meta">
                    <span>{formatWhen(m.updated_at)}</span>
                    {m.source === "agent" && <span>따까리</span>}
                    {m.tags.map((t) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <Dialog
        open={Boolean(memoId)}
        onClose={() => navigate("/memos", { replace: true })}
        size="lg"
        title={memoId === "new" ? "새 메모" : "메모"}
        modal
        id="memo-dialog"
      >
        {memoId && <MemoEditor key={memoId} memoId={memoId} />}
      </Dialog>
    </div>
  );
}
