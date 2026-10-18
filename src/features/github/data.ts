import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { InfiniteData, UseInfiniteQueryResult, UseQueryResult } from "@tanstack/react-query";
import { ghKey } from "../../api/githubClient";
import type { GhEnvelope } from "../../api/githubTypes";

// 목록 30초·상세 60초는 백엔드 캐시 TTL(ADR 0042 §5.6)과 맞춘다. 뒤로가기로 돌아오면 이 안에서는 다시 묻지 않는다.
export const LIST_STALE = 30_000;
export const DETAIL_STALE = 60_000;
// 40자 SHA 로 고정된 내용은 바뀌지 않는다.
export const PINNED_STALE = 10 * 60_000;

type KeyPart = string | number | undefined;

/** 계정(account)이 키의 첫 마디다. 다른 계정의 응답이 같은 키로 섞일 수 없다. */
export function useGhQuery<T>(account: string, key: KeyPart[], fetcher: () => Promise<GhEnvelope<T>>, opts: { staleTime?: number; enabled?: boolean } = {}): UseQueryResult<GhEnvelope<T>> {
  return useQuery({
    queryKey: ghKey(account, ...key),
    queryFn: fetcher,
    staleTime: opts.staleTime ?? DETAIL_STALE,
    enabled: opts.enabled ?? true,
  });
}

/** `has_more` 로 다음 페이지를 판단하는 "더 보기" 목록. 상류 URL 은 쓰지 않고 page 번호만 올린다. */
export function useGhInfinite<T>(
  account: string,
  key: KeyPart[],
  fetcher: (page: number) => Promise<GhEnvelope<T[]>>,
  opts: { staleTime?: number; enabled?: boolean } = {},
): UseInfiniteQueryResult<InfiniteData<GhEnvelope<T[]>, number>> {
  return useInfiniteQuery({
    queryKey: ghKey(account, ...key),
    queryFn: ({ pageParam }) => fetcher(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page?.has_more ? last.page.page + 1 : undefined),
    staleTime: opts.staleTime ?? LIST_STALE,
    enabled: opts.enabled ?? true,
  });
}
