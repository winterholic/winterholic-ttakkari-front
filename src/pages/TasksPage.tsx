import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { searchTasks, taskLibrary } from "../api/client";
import type { AccountPool, TaskHit, TaskRoot } from "../api/types";
import { PageHeader } from "../shell/PageHeader";
import { sessionTime } from "../shell/groupSessions";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { buildForest } from "../features/tasks/buildTree";
import { groupByDay, splitMatch } from "../features/tasks/dayGroups";
import { StatusGlyph, TaskTree } from "../features/tasks/TaskTree";
import { useActiveTasks, useTaskTree } from "../features/tasks/useTasks";
import "../features/tasks/tasks.css";
import { Art } from "../ui/Art";

const SCOPES: { value: AccountPool | null; label: string }[] = [
  { value: null, label: "전체" },
  { value: "personal", label: "개인" },
  { value: "work", label: "회사" },
];
const FIELD_LABEL: Record<TaskHit["field"], string> = { title: "제목", prompt: "지시", result: "결과" };
const SEARCH_DEBOUNCE_MS = 250;

/** 지난 일은 캔버스에 그 뿌리를 불러와(pin) 그 노드를 고른 채로 연다. 접수 대화는 대화 화면으로 간다. */
function boardLink(pool: AccountPool, rootId: string | null, nodeId: string): string {
  const base = pool === "work" ? "/work" : "/chat";
  if (!rootId) return `${base}/thread`;
  return `${base}?${new URLSearchParams([["pin", rootId], ["node", nodeId]])}`;
}

/**
 * 작업: 위에는 지금 도는 일의 트리, 아래는 지난 일을 뿌리 단위로 모아 둔 서고와 검색(back ADR 0014).
 * 서고의 줄은 뿌리 하나다. 펼치면 그 일의 트리 전체를 그 자리에서 불러온다.
 */
export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const pool = (params.get("pool") as AccountPool | null) ?? null;
  const [text, setText] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(text.trim());

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);
  // 검색어는 주소에 남겨 뒤로 가기로 돌아왔을 때 결과가 그대로 있게 한다.
  useEffect(() => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (q) next.set("q", q);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const setPool = (value: AccountPool | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set("pool", value);
        else next.delete("pool");
        return next;
      },
      { replace: true },
    );

  return (
    <div className="tk-screen">
      <PageHeader title="작업" meta="따까리에게 맡긴 일의 가지와 지난 기록"
        actions={<Link className="tk-button tk-button--sm" to="/tasks/failed">실패한 작업</Link>} />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--thread tasks-page">
          <div className="tk-filterbar tasks-page__filters" role="search">
            <div className="tk-filterbar__row">
              <span className="tk-input-wrap">
                <Icon name="search" />
                <input
                  className="tk-input"
                  type="search"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="제목·지시·결과에서 찾기"
                  aria-label="지난 작업 검색"
                  enterKeyHint="search"
                />
              </span>
            </div>
            <div className="tk-segmented" role="radiogroup" aria-label="모드">
              {SCOPES.map((s) => (
                <label key={s.label}>
                  <input type="radio" name="tasks-pool" checked={pool === s.value} onChange={() => setPool(s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          {q ? <SearchResults q={q} pool={pool} /> : (
            <>
              <ActiveSection pool={pool} />
              <LibrarySection pool={pool} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveSection({ pool }: { pool: AccountPool | null }) {
  const q = useActiveTasks();
  if (!q.isSuccess) return null;
  const roots = q.data.roots.filter((id) => !pool || q.data.nodes.find((n) => n.id === id)?.pool === pool);
  if (roots.length === 0) return null;
  return (
    <section className="tk-section tasks-page__active" aria-labelledby="tasks-active-title">
      <div className="tk-section__head">
        <h2 className="tk-section__title" id="tasks-active-title">진행 중·최근</h2>
      </div>
      <div className="tasks-page__tree">
        <TaskTree items={buildForest(roots, q.data.nodes)} label="진행 중·최근 일" />
      </div>
    </section>
  );
}

function LibrarySection({ pool }: { pool: AccountPool | null }) {
  const list = useInfiniteQuery({
    queryKey: ["tasks", "library", pool],
    queryFn: ({ pageParam }) => taskLibrary({ pool: pool ?? undefined, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_before,
  });
  const roots = list.data?.pages.flatMap((p) => p.roots) ?? [];
  return (
    <section className="tk-section" aria-labelledby="tasks-library-title">
      <div className="tk-section__head">
        <h2 className="tk-section__title" id="tasks-library-title">지난 작업</h2>
      </div>
      {list.isPending && (
        <div aria-busy="true" aria-label="지난 작업을 불러오는 중">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tk-skeleton tk-skeleton--block tasks-page__skeleton" />
          ))}
        </div>
      )}
      {list.isError && (
        <div className="tk-empty tk-empty--boxed">
          <Art name="state-error" />
          <p className="tk-empty__title">지난 작업을 못 불러왔어요</p>
          <Button size="sm" onClick={() => void list.refetch()}>
            <Icon name="retry" />
            다시 시도
          </Button>
        </div>
      )}
      {list.isSuccess && roots.length === 0 && (
        <div className="tk-empty tk-empty--boxed">
          <Art name="state-empty" />
          <p className="tk-empty__title">아직 쌓인 일이 없어요</p>
          <p className="tk-body-sm tk-text-tertiary">따까리에게 일을 맡기면 끝난 일이 여기에 날짜별로 모여요.</p>
          <Link className="tk-button tk-button--sm" to={pool === "work" ? "/work" : "/chat"}>
            따까리에게 말하기
          </Link>
        </div>
      )}
      {roots.length > 0 && (
        <ul className="tk-list tk-list--inset">
          {groupByDay(roots, (r) => r.updated_at).map((g) => (
            <li key={g.label}>
              <p className="tk-list__group">{g.label}</p>
              <ul className="tasks-page__group">
                {g.items.map((r) => (
                  <LibraryRow key={r.id} root={r} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="tasks-page__more">
          <Button size="sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? "불러오는 중" : "더 보기"}
          </Button>
        </div>
      )}
    </section>
  );
}

function rootMeta(r: TaskRoot): string {
  const parts = [];
  if (r.kind === "desk") parts.push("따까리 대화");
  else if (r.kind === "chat") parts.push("일반 대화");
  if (r.descendants > 0) parts.push(`하위 ${r.descendants}개`);
  if (r.active > 0) parts.push(`${r.active}개 실행 중`);
  if (r.failed > 0) parts.push(`실패 ${r.failed}`);
  return parts.join(" · ");
}

function LibraryRow({ root }: { root: TaskRoot }) {
  const [open, setOpen] = useState(false);
  const canOpen = root.descendants > 0;
  const status = root.active > 0 ? "running" : root.status;
  const meta = rootMeta(root);
  return (
    <li className="tasks-row" data-open={open ? "" : undefined}>
      <div className="tk-list__item tasks-row__head">
        {canOpen ? (
          <button
            className="task-row__toggle"
            type="button"
            aria-expanded={open}
            aria-label={`${root.title} 하위 ${root.descendants}개 ${open ? "접기" : "펼치기"}`}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="chevron-right" />
          </button>
        ) : (
          <span className="task-row__toggle" aria-hidden="true" />
        )}
        <Link className="tasks-row__link" to={boardLink(root.pool, root.kind === "desk" ? null : root.id, root.id)}>
          <span className="tk-list__body">
            <span className="tasks-row__top">
              <StatusGlyph status={status} />
              <span className="tk-list__title">
                {root.pool === "work" && <span className="tk-badge tk-badge--info task-row__pool">회사</span>}
                {root.title || "제목 없는 일"}
              </span>
            </span>
            {meta && <span className="tk-list__meta">{meta}</span>}
            {root.last_result && <span className="tk-list__snippet">{root.last_result}</span>}
          </span>
          <span className="tk-list__end">{sessionTime(root.updated_at)}</span>
        </Link>
      </div>
      {open && <RootTree id={root.id} />}
    </li>
  );
}

function RootTree({ id }: { id: string }) {
  const t = useTaskTree(id);
  if (t.isPending) return <p className="tasks-row__note">가지를 불러오는 중</p>;
  if (t.isError)
    return (
      <p className="tasks-row__note">
        가지를 못 불러왔어요.{" "}
        <button className="tk-button tk-button--xs" type="button" onClick={() => void t.refetch()}>
          다시 시도
        </button>
      </p>
    );
  // 뿌리 줄은 바로 위에 있으니 자식부터 보여 준다.
  const [root] = buildForest([t.data.root_id], t.data.nodes);
  return (
    <div className="tasks-row__tree">
      <TaskTree items={root?.children ?? []} label="이 일의 가지" />
    </div>
  );
}

function SearchResults({ q, pool }: { q: string; pool: AccountPool | null }) {
  const r = useQuery({ queryKey: ["tasks", "search", q, pool], queryFn: () => searchTasks(q, pool ?? undefined) });
  if (r.isPending)
    return (
      <p className="tk-status tk-status--agent" role="status">
        <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />
        찾는 중
      </p>
    );
  if (r.isError)
    return (
      <div className="tk-empty tk-empty--boxed">
        <Art name="state-error" size="sm" />
        <p className="tk-empty__title">찾지 못했어요</p>
        <Button size="sm" onClick={() => void r.refetch()}>
          <Icon name="retry" />
          다시 시도
        </Button>
      </div>
    );
  if (r.data.length === 0)
    return (
      <div className="tk-empty tk-empty--boxed">
        <Art name="state-no-results" size="sm" />
        <p className="tk-empty__title">'{q}'가 든 일이 없어요</p>
        <p className="tk-body-sm tk-text-tertiary">더 짧은 낱말로 찾거나 모드를 '전체'로 바꿔 보세요.</p>
      </div>
    );
  return (
    <section className="tk-section" aria-label="검색 결과">
      <p className="tk-caption tk-text-tertiary" role="status">
        {r.data.length}건
      </p>
      <ul className="tk-list tk-list--inset">
        {r.data.map((h) => (
          <li key={h.node.id}>
            <Link className="tk-list__item tk-list__item--interactive tasks-hit" to={boardLink(h.node.pool, h.node.kind === "desk" ? null : h.root_id, h.node.id)}>
              <span className="tk-list__body">
                {h.path.length > 1 && (
                  <span className="tasks-hit__path">
                    {h.path.slice(0, -1).map((p) => p.title).join(" › ")}
                  </span>
                )}
                <span className="tasks-row__top">
                  <StatusGlyph status={h.node.status} />
                  <span className="tk-list__title">
                    <Highlight text={h.node.title} q={q} />
                  </span>
                </span>
                {h.field !== "title" && (
                  <span className="tk-list__snippet">
                    <span className="tk-badge tk-badge--neutral tasks-hit__field">{FIELD_LABEL[h.field]}</span>
                    <Highlight text={h.snippet} q={q} />
                  </span>
                )}
              </span>
              <span className="tk-list__end">{sessionTime(h.node.updated_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  return (
    <>
      {splitMatch(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  );
}
