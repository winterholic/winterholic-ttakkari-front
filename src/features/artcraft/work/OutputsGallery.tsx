import { useMemo, useState } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { listArtcraftOutputs } from "../../../api/client";
import type { ArtcraftCategoryId } from "../../../api/artcraftTypes";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import { useDebounced } from "../../viewer/hooks";
import { EmptyState, ErrorState, ListSkeleton } from "../../viewer/screenStates";
import { OutputGrid } from "./shared";

const PAGE = 24;
const KINDS: { kind: string; label: string }[] = [
  { kind: "all", label: "전체" },
  { kind: "image", label: "이미지" },
  { kind: "pdf", label: "PDF" },
  { kind: "docx", label: "문서" },
  { kind: "sheet", label: "표" },
  { kind: "pptx", label: "슬라이드" },
  { kind: "video", label: "영상" },
  { kind: "audio", label: "오디오" },
];

/** 작업물 갤러리. 범주를 주면 그 범주만, 아니면 전체. 타일을 누르면 뷰어가 열린다(?artifact=). */
export function OutputsGallery({ category, onOpen }: { category?: ArtcraftCategoryId; onOpen: (id: string) => void }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 300);
  const [kind, setKind] = useState("all");
  const list = useInfiniteQuery({
    queryKey: ["artcraft", "outputs", { category, q, kind }],
    queryFn: ({ pageParam }) => listArtcraftOutputs({ category, q: q || undefined, kind: kind === "all" ? undefined : kind, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.has_more ? all.length * PAGE : undefined),
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const filtered = q !== "" || kind !== "all";

  return (
    <div className="acw-gallery">
      <div className="acw-filters">
        <label className="tk-input-wrap">
          <Icon name="search" />
          <input className="tk-input" type="search" value={text} placeholder="파일 이름으로 찾기" aria-label="작업물 검색" onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="tk-segmented tk-segmented--scroll" role="radiogroup" aria-label="종류">
          {KINDS.map((k) => (
            <label key={k.kind}>
              <input type="radio" name={`acw-kind-${category ?? "all"}`} checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              {k.label}
            </label>
          ))}
        </div>
      </div>
      {list.isPending ? <ListSkeleton label="작업물을 불러오는 중" rows={4} />
        : list.isError ? <ErrorState what="작업물" error={list.error} onRetry={() => void list.refetch()} />
          : items.length === 0 ? (
            <EmptyState icon="image" title={filtered ? "조건에 맞는 작업물이 없어요" : "아직 작업물이 없어요"}>
              {filtered ? "검색어나 종류를 바꿔 보세요." : "작업을 시키면 결과 파일이 여기에 모여요."}
            </EmptyState>
          ) : (
            <>
              <OutputGrid items={items} onOpen={onOpen} showTask />
              {list.hasNextPage && (
                <div className="acw-more">
                  <Button busy={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>더 보기</Button>
                </div>
              )}
            </>
          )}
    </div>
  );
}
