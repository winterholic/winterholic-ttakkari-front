import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteArtifact, listArtifacts } from "../api/client";
import type { ArtifactKind, ArtifactOut } from "../api/types";
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

const PAGE = 30;

// 백엔드 kind 필터는 하나만 받으므로 칩 하나가 kind 하나다.
const CHIPS: { kind: ArtifactKind | "all"; label: string; icon?: IconName }[] = [
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

export function LibraryPage() {
  const qc = useQueryClient();
  const { current, close } = useArtifactViewer();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const [kind, setKind] = useState<ArtifactKind | "all">("all");
  const [toDelete, setToDelete] = useState<ArtifactOut | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["artifacts", { q, kind }],
    queryFn: ({ pageParam }) => listArtifacts({ q: q || undefined, kind: kind === "all" ? undefined : kind, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
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

  const filtered = q !== "" || kind !== "all";
  const reset = () => {
    setText("");
    setKind("all");
  };

  return (
    <div className="tk-screen">
      <PageHeader title="보관함" meta={list.isSuccess ? `결과물 ${items.length}${list.hasNextPage ? "+" : ""}개` : undefined} />
      <ArtifactViewerHost alwaysOpen onDelete={setToDelete} resolveInitial={(id) => items.find((a) => a.id === id)}>
        <div className="tk-screen__body">
          <div className="tk-container tk-container--full">
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
              <p className="tk-filterbar__count" role="status">{list.isSuccess ? `${items.length}${list.hasNextPage ? "개 이상" : "개"}` : ""}</p>
            </div>
          </div>

          {list.isLoading && <ListSkeleton label="결과물을 찾는 중" />}
          {list.isError && <div className="tk-container tk-container--md"><ErrorState error={list.error} what="결과물 목록" onRetry={() => void list.refetch()} /></div>}
          {list.isSuccess && items.length === 0 && (
            filtered ? (
              <EmptyState icon="search" title="찾는 결과물이 없어요" actions={<button className="tk-button" type="button" onClick={reset}>필터 모두 풀기</button>}>
                다른 단어로 찾거나 필터를 풀어 보세요. 삭제된 결과물은 보관 기간이 지나면 찾을 수 없어요.
              </EmptyState>
            ) : (
              <EmptyState icon="library" title="아직 결과물이 없어요">에이전트가 만든 파일이나 파일 찾기에서 등록한 파일이 여기에 모여요.</EmptyState>
            )
          )}
          {list.isSuccess && items.length > 0 && (
            <div className="tk-list">
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
        <div className="tk-dialog__header"><h2 className="tk-dialog__title" id="lib-del-title">결과물을 삭제할까요?</h2></div>
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
