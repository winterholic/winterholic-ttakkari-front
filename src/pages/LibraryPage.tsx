import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteArtifact, listArtifacts, moveArtifact } from "../api/client";
import type { ArtifactArea, ArtifactKind, ArtifactOut } from "../api/types";
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

// 백엔드 kind 필터는 하나만 받으므로 칩 하나가 kind 하나다.
type Filter = ArtifactKind | "all";
const CHIPS: { kind: Filter; label: string; icon?: IconName }[] = [
  { kind: "all", label: "전체" },
  { kind: "markdown", label: "문서", icon: "file-text" },
  { kind: "docx", label: "Word", icon: "file-text" },
  { kind: "pdf", label: "PDF", icon: "file-pdf" },
  { kind: "sheet", label: "표", icon: "sheet" },
  { kind: "image", label: "이미지", icon: "image" },
  { kind: "pptx", label: "발표", icon: "presentation" },
  { kind: "code", label: "코드", icon: "file-code" },
  { kind: "html", label: "HTML", icon: "globe" },
];

// 기본 "파일"은 사용자가 올렸거나 넘겨받은 결과물만 보인다. 에이전트가 작업 중 만든 파일과 고친 파일은 "에이전트 파일"에 모은다.
const AREAS: { area: ArtifactArea; label: string; icon: IconName }[] = [
  { area: "files", label: "파일", icon: "library" },
  { area: "agent", label: "에이전트 파일", icon: "terminal" },
];

export function LibraryPage() {
  const qc = useQueryClient();
  const { current, close } = useArtifactViewer();
  const [params, setParams] = useSearchParams();
  const area: ArtifactArea = params.get("tab") === "agent" ? "agent" : "files";
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const [kind, setKind] = useState<Filter>("all");
  const [toDelete, setToDelete] = useState<ArtifactOut | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["artifacts", { q, kind, area }],
    queryFn: ({ pageParam }) =>
      listArtifacts({
        q: q || undefined,
        kind: kind === "all" ? undefined : kind,
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
      setNotice(`${r.filename} 을(를) ${r.area === "agent" ? "에이전트 파일" : "파일"}로 옮겼어요.`);
      if (current === r.id) close();
    },
  });

  const selectArea = (next: ArtifactArea) => {
    setNotice(null);
    // 열려 있던 파일은 다른 쪽 목록에 없을 수 있어 같이 닫는다. close() 는 history.back() 이라 쓰지 않고 한 번에 바꾼다.
    setParams(next === "files" ? {} : { tab: next }, { replace: true });
  };

  const filtered = q !== "" || kind !== "all";
  const reset = () => {
    setText("");
    setKind("all");
  };

  return (
    <div className="tk-screen library-page">
      <PageHeader title="보관함" meta={list.isSuccess ? `${area === "agent" ? "에이전트 파일" : "파일"} ${items.length}${list.hasNextPage ? "+" : ""}개` : undefined} />
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
                  <button key={c.kind} className="tk-chip" type="button" aria-pressed={kind === c.kind} onClick={() => setKind(c.kind)}>
                    {c.icon && <Icon name={c.icon} />}{c.label}
                  </button>
                ))}
              </div>
              <p className="tk-filterbar__count" role="status">{switching ? "찾는 중" : list.isSuccess ? `${items.length}${list.hasNextPage ? "개 이상" : "개"}` : ""}</p>
            </div>
            {notice && <p className="tk-filterbar__count" role="status">{notice}</p>}
            {move.isError && <p className="tk-error" role="alert">옮기지 못했어요. {errorText(move.error).message}</p>}
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
                <EmptyState icon="terminal" title="에이전트 파일이 없어요">에이전트가 작업 중에 만든 중간 산출물과 고친 파일이 여기에 모여요. 필요한 파일은 열어서 "파일로 옮기기"를 눌러 주세요.</EmptyState>
              ) : (
                <EmptyState icon="library" art="state-empty" title="아직 파일이 없어요">직접 올린 파일과 에이전트가 사용자에게 넘긴 결과물이 여기에 모여요.</EmptyState>
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
          <p><strong>{toDelete?.filename}</strong> 을(를) 보관함에서 지워요. 관리 영역에 복사해 둔 파일도 함께 지워지고 되돌릴 수 없어요. 워크스페이스의 원본 파일은 그대로 있어요.</p>
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
