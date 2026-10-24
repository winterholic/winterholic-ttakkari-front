import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteArtifact, listArtifacts, moveArtifact } from "../api/client";
import type { ArtifactCategory, ArtifactOut, ArtifactTabArea } from "../api/types";
import { errorText } from "../features/viewer/api";
import { ArtifactViewerHost } from "../features/viewer/ArtifactViewerHost";
import { useDebounced } from "../features/viewer/hooks";
import { dayGroup } from "../features/viewer/kinds";
import { ModalDialog } from "../features/viewer/ModalDialog";
import { ArtifactRowContent, EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { useArtifactViewer } from "../features/viewer/useArtifactViewer";
import { PageHeader } from "../shell/PageHeader";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import "./library.css";

const PAGE = 30;

// 탐색용 카테고리 필터
type CategoryFilter = ArtifactCategory | "all";
const CHIPS: { category: CategoryFilter; label: string; icon?: IconName }[] = [
  { category: "all", label: "전체" },
  { category: "document", label: "문서", icon: "file-text" },
  { category: "spreadsheet", label: "표·데이터", icon: "sheet" },
  { category: "presentation", label: "발표 자료", icon: "presentation" },
  { category: "image", label: "이미지", icon: "image" },
  { category: "video", label: "동영상", icon: "film" },
  { category: "audio", label: "오디오", icon: "music" },
  { category: "code", label: "코드", icon: "file-code" },
  { category: "archive", label: "압축파일", icon: "file-archive" },
  { category: "other", label: "기타", icon: "file-text" },
];

// 보관함 3개 탭: 내 보관함(files), AI 작업 파일(agent), 전체(all)
const AREAS: { area: ArtifactTabArea; label: string; icon: IconName }[] = [
  { area: "files", label: "내 보관함", icon: "library" },
  { area: "agent", label: "AI 작업 파일", icon: "terminal" },
  { area: "all", label: "전체", icon: "folder" },
];

export function LibraryPage() {
  const qc = useQueryClient();
  const { current, close } = useArtifactViewer();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab");
  const area: ArtifactTabArea = rawTab === "agent" ? "agent" : rawTab === "all" ? "all" : "files";
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [toDelete, setToDelete] = useState<ArtifactOut | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["artifacts", { q, category, area }],
    queryFn: ({ pageParam }) =>
      listArtifacts({
        q: q || undefined,
        category: category === "all" ? undefined : category,
        area,
        limit: PAGE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
    // 필터·검색어를 바꾸면 새 결과가 올 때까지 이전 목록을 둔다. 없으면 매번 로딩 뼈대로 바뀌어 깜빡인다.
    placeholderData: keepPreviousData,
  });
  const switching = list.isPlaceholderData;
  const moreError = list.isFetchNextPageError ? list.error : null;
  const items = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const groups = useMemo(() => {
    const out: { label: string; items: ArtifactOut[] }[] = [];
    for (const a of items) {
      const label = dayGroup(a.created_at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [items]);

  const del = useMutation({
    mutationFn: (a: ArtifactOut) => deleteArtifact(a.id),
    onSuccess: (_r, a) => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      qc.removeQueries({ queryKey: ["artifact", a.id] });
      setToDelete(null);
      if (current === a.id) close();
    },
  });

  const move = useMutation({
    mutationFn: (a: ArtifactOut) => moveArtifact(a.id, a.area === "agent" ? "files" : "agent"),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      qc.setQueryData(["artifact", r.id], r);
      setNotice(
        r.area === "agent"
          ? `${r.filename} 을(를) 내 보관함에서 뺐어요.`
          : `${r.filename} 을(를) 내 보관함에 보관했어요.`
      );
      if (current === r.id) close();
    },
  });

  const selectArea = (next: ArtifactTabArea) => {
    setNotice(null);
    setParams(next === "files" ? {} : { tab: next }, { replace: true });
  };

  const filtered = q !== "" || category !== "all";
  const reset = () => {
    setText("");
    setCategory("all");
  };

  const tabTitle = area === "agent" ? "AI 작업 파일" : area === "all" ? "전체 파일" : "내 보관함";

  return (
    <div className="tk-screen library-page">
      <PageHeader title="보관함" meta={list.isSuccess ? `${tabTitle} ${items.length}${list.hasNextPage ? "+" : ""}개` : undefined} />
      <ArtifactViewerHost alwaysOpen onDelete={setToDelete} onMove={(a) => !move.isPending && move.mutate(a)} resolveInitial={(id) => items.find((a) => a.id === id)}>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--full">
            <div className="tk-segmented tk-segmented--block library-tabs" role="radiogroup" aria-label="보관함 구분">
              {AREAS.map((t) => (
                <label key={t.area}>
                  <input type="radio" name="library-area" checked={area === t.area} onChange={() => selectArea(t.area)} />
                  <Icon name={t.icon} />
                  {t.label}
                </label>
              ))}
            </div>
            <div className="tk-filterbar" role="search">
              <div className="tk-filterbar__row">
                <span className="tk-input-wrap">
                  <Icon name="search" />
                  <input className="tk-input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="이름·세션·내용으로 찾기" aria-label="보관함 검색" />
                </span>
              </div>
              <div className="tk-chips" role="group" aria-label="형식 필터">
                {CHIPS.map((c) => (
                  <button key={c.category} className="tk-chip" type="button" aria-pressed={category === c.category} onClick={() => setCategory(c.category)}>
                    {c.icon && <Icon name={c.icon} />}{c.label}
                  </button>
                ))}
              </div>
              <p className="tk-filterbar__count" role="status">{switching ? "찾는 중" : list.isSuccess ? `${items.length}${list.hasNextPage ? "개 이상" : "개"}` : ""}</p>
            </div>
            {notice && <p className="tk-filterbar__count" role="status">{notice}</p>}
            {move.isError && <p className="tk-error" role="alert">상태를 변경하지 못했어요. {errorText(move.error).message}</p>}
          </div>

          {list.isLoading && <ListSkeleton label="파일을 찾는 중" />}
          {list.isError && <div className="tk-container tk-container--md"><ErrorState error={list.error} what="파일 목록" art="md" onRetry={() => void list.refetch()} /></div>}
          {list.isSuccess && items.length === 0 && (
            filtered ? (
              <EmptyState icon="search" art="state-no-results" title="찾는 파일이 없어요" actions={<button className="tk-button" type="button" onClick={reset}>필터 모두 풀기</button>}>
                다른 단어로 찾거나 필터를 풀어 보세요. 삭제된 파일은 보관 기간이 지나면 찾을 수 없어요.
              </EmptyState>
            ) : (
              area === "agent" ? (
                <EmptyState icon="terminal" title="AI 작업 파일이 없어요">에이전트가 작업 중에 만든 중간 산출물과 전달한 결과물이 여기에 모여요. 필요한 파일은 열어서 &quot;내 보관함에 보관&quot;을 눌러 주세요.</EmptyState>
              ) : area === "all" ? (
                <EmptyState icon="folder" title="아직 파일이 없어요">내 보관함 파일과 AI 작업 파일 전체가 여기에 모여요.</EmptyState>
              ) : (
                <EmptyState icon="library" art="state-empty" title="아직 내 보관함에 보관된 파일이 없어요">직접 올린 파일이나 대화에서 보관을 요청한 파일이 여기에 모여요.</EmptyState>
              )
            )
          )}
          {list.isSuccess && items.length > 0 && (
            <div className="tk-list" aria-busy={switching || undefined}>
              {groups.map((g) => (
                <div key={g.label} role="group" aria-label={g.label}>
                  <p className="tk-list__group">{g.label}</p>
                  {g.items.map((a) => (
                    <ArtifactButton key={a.id} a={a} />
                  ))}
                </div>
              ))}
              {list.hasNextPage && (
                <div className="tk-button-group tk-button-group--fill">
                  <button className="tk-button" type="button" aria-busy={list.isFetchingNextPage || undefined} onClick={() => void list.fetchNextPage()}>
                    {list.isFetchingNextPage ? "불러오는 중" : "더 보기"}
                  </button>
                </div>
              )}
              {moreError && <p className="tk-error" role="alert">더 불러오지 못했어요. {errorText(moreError).message}</p>}
            </div>
          )}
        </div>
      </ArtifactViewerHost>

      <ModalDialog open={toDelete !== null} onClose={() => setToDelete(null)} className="tk-dialog tk-dialog--sm" labelledBy="lib-del-title">
        <div className="tk-dialog__header"><h2 className="tk-dialog__title" id="lib-del-title">파일을 삭제할까요?</h2></div>
        <div className="tk-dialog__body">
          <p><strong>{toDelete?.filename}</strong> 을(를) 완전히 삭제해요. 관리 영역에 복사해 둔 파일도 함께 지워지고 되돌릴 수 없어요. 워크스페이스의 원본 파일은 그대로 있어요.</p>
          <p className="tk-menu__meta" style={{ marginTop: "0.5rem" }}>내 보관함에서만 빼고 파일은 유지하려면 삭제 대신 &quot;내 보관함에서 빼기&quot;를 이용해 주세요.</p>
          {del.isError && <p className="tk-error" role="alert">지우지 못했어요. {errorText(del.error).message}</p>}
        </div>
        <div className="tk-dialog__footer">
          <button className="tk-button" type="button" onClick={() => setToDelete(null)}>취소</button>
          <button className="tk-button tk-button--danger" type="button" aria-busy={del.isPending || undefined} onClick={() => toDelete && !del.isPending && del.mutate(toDelete)}>삭제</button>
        </div>
      </ModalDialog>
    </div>
  );
}

function ArtifactButton({ a }: { a: ArtifactOut }) {
  const { current, open } = useArtifactViewer();
  return (
    <button className="tk-list__item tk-artifact" type="button" aria-current={current === a.id || undefined} onClick={() => open(a.id)}>
      <ArtifactRowContent a={a} />
    </button>
  );
}
