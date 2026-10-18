import { useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { InfiniteData, UseInfiniteQueryResult, UseQueryResult } from "@tanstack/react-query";
import type { GhEnvelope } from "../../../api/githubTypes";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/Icon";
import type { IconName } from "../../../ui/Icon";
import { GhContext } from "../GithubContext";
import { ago, remaining } from "../format";
import { safeGithubHref } from "../links";
import { describeGhError } from "./errors";

/** 한도가 풀리는 시각(Unix 초)까지 남은 초. 시각이 없으면 null, 지나면 0. */
export function useCountdown(resetAt: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!resetAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resetAt]);
  return resetAt ? Math.max(0, resetAt - Math.floor(now / 1000)) : null;
}

export type SkeletonKind = "list" | "card" | "code";

/** 실제 화면과 같은 모양의 자리표시. 스크린 리더에는 "불러오는 중"만 읽힌다. */
export function GhSkeleton({ kind = "list", label = "불러오는 중" }: { kind?: SkeletonKind; label?: string }) {
  const rows = kind === "card" ? 2 : kind === "code" ? 8 : 5;
  return (
    <div className="gh-skeleton" role="status" aria-label={label} data-kind={kind}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={kind === "code" ? "tk-skeleton tk-skeleton--text" : "tk-skeleton tk-skeleton--block"} />
      ))}
    </div>
  );
}

export interface GhErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** 검증을 통과한 GitHub 웹 주소. 있으면 "GitHub 에서 열기"를 권하는 오류에 링크로 붙는다. */
  githubUrl?: string | null;
  compact?: boolean;
}

/**
 * 모든 GitHub 화면의 오류·권한·만료·한도 상태. 문구는 errors.ts 가 정하고, 여기서는 행동(재시도·계정 전환·GitHub 열기)만 붙인다.
 * 앱 로그인과는 무관한 상태임을 문구가 말한다(GitHub 상류 401 은 앱 로그아웃으로 이어지지 않는다).
 */
export function GhErrorState({ error, onRetry, githubUrl, compact }: GhErrorStateProps) {
  // 계정이 정해지기 전(계정 목록 자체가 실패한 경우)에도 같은 상태 화면을 쓰므로 컨텍스트는 없어도 된다.
  const ctx = useContext(GhContext);
  const view = describeGhError(error);
  const left = useCountdown(view.resetAt);
  const others = ctx ? ctx.accounts.filter((a) => a.login !== ctx.account) : [];
  const web = safeGithubHref(githubUrl);
  const sso = safeGithubHref(view.ssoUrl);
  const icon: IconName = view.tone === "danger" ? "warning" : view.resetAt ? "clock" : view.switchAccount ? "lock" : "info";
  const canRetry = view.retry || (view.resetAt !== undefined && left === 0);
  return (
    <div className={compact ? "gh-state gh-state--compact" : "gh-state"} role="alert" data-tone={view.tone}>
      <Icon name={icon} />
      <div className="gh-state__body">
        <p className="gh-state__title">{view.title}</p>
        <p className="gh-state__text">{view.message}</p>
        {view.resetAt !== undefined && (
          <p className="gh-state__text" aria-live="off">
            {left !== null && left > 0 ? remaining(left) + " 뒤에 풀려요" : "이제 다시 시도할 수 있어요"}
          </p>
        )}
        <div className="gh-state__actions">
          {canRetry && onRetry && <Button size="sm" onClick={onRetry}>다시 시도</Button>}
          {view.switchAccount && others.map((a) => <Button key={a.login} size="sm" variant="ghost" onClick={() => ctx?.switchAccount(a.login)}>{a.login} 계정으로 열기</Button>)}
          {sso && <a className="tk-button tk-button--sm" href={sso} target="_blank" rel="noopener noreferrer"><span>SSO 승인 화면 열기</span><Icon name="external-link" /></a>}
          {view.openOnGithub && web && <a className="tk-button tk-button--ghost tk-button--sm" href={web} target="_blank" rel="noopener noreferrer"><span>GitHub 에서 열기</span><Icon name="external-link" /></a>}
        </div>
      </div>
    </div>
  );
}

export function GhEmpty({ icon = "info", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="tk-empty tk-empty--boxed">
      <Icon name={icon} />
      <p className="tk-empty__title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

/** 응답 메타(캐시·한도) 알림. 실제 값이 있을 때만 띠를 낸다. */
export function GhNotes({ env }: { env: GhEnvelope<unknown> | undefined }) {
  if (!env) return null;
  return (
    <>
      {env.stale && (
        <p className="tk-banner tk-banner--warning" role="status">
          <Icon name="clock" />
          <span className="tk-banner__text">GitHub 응답이 늦거나 실패해 {ago(env.fetched_at) || "이전"}에 받아 둔 내용을 보여 줘요.</span>
        </p>
      )}
      {env.rate?.low && (
        <p className="tk-banner tk-banner--warning" role="status">
          <Icon name="gauge" />
          <span className="tk-banner__text">이 계정의 GitHub 호출 한도가 얼마 남지 않았어요(남은 {env.rate.remaining ?? 0}회).</span>
        </p>
      )}
    </>
  );
}

export interface QueryViewProps<T> {
  query: UseQueryResult<GhEnvelope<T>>;
  children: (data: T, env: GhEnvelope<T>) => ReactNode;
  skeleton?: SkeletonKind;
  label?: string;
  isEmpty?: (data: T) => boolean;
  empty?: { icon?: IconName; title: string; text?: string };
  githubUrl?: string | null;
}

/** 단일 응답 화면의 로딩·오류·빈 상태·정상을 한 곳에서 가른다. */
export function QueryView<T>({ query, children, skeleton, label, isEmpty, empty, githubUrl }: QueryViewProps<T>) {
  if (query.isPending) return <GhSkeleton kind={skeleton} label={label} />;
  if (query.isError) return <GhErrorState error={query.error} onRetry={() => void query.refetch()} githubUrl={githubUrl} />;
  const env = query.data;
  if (isEmpty?.(env.data) && empty) return <GhEmpty icon={empty.icon} title={empty.title}>{empty.text}</GhEmpty>;
  return (
    <>
      <GhNotes env={env} />
      {children(env.data, env)}
    </>
  );
}

export interface InfiniteViewProps<T> {
  query: UseInfiniteQueryResult<InfiniteData<GhEnvelope<T[]>, number>>;
  children: (items: T[]) => ReactNode;
  skeleton?: SkeletonKind;
  label?: string;
  empty: { icon?: IconName; title: string; text?: string };
  githubUrl?: string | null;
  moreLabel?: string;
}

/** "더 보기" 목록. 다음 페이지만 실패해도 받은 목록은 그대로 두고 그 아래에 오류를 붙인다(부분 상태). */
export function InfiniteView<T>({ query, children, skeleton, label, empty, githubUrl, moreLabel = "더 보기" }: InfiniteViewProps<T>) {
  if (query.isPending) return <GhSkeleton kind={skeleton} label={label} />;
  if (query.isError && !query.data) return <GhErrorState error={query.error} onRetry={() => void query.refetch()} githubUrl={githubUrl} />;
  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p) => p.data);
  if (items.length === 0) return <GhEmpty icon={empty.icon} title={empty.title}>{empty.text}</GhEmpty>;
  const nextFailed = query.isFetchNextPageError;
  return (
    <>
      <GhNotes env={pages[0]} />
      {children(items)}
      {nextFailed && <GhErrorState compact error={query.error} onRetry={() => void query.fetchNextPage()} githubUrl={githubUrl} />}
      {query.hasNextPage && !nextFailed && (
        <Button variant="ghost" block busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{moreLabel}</Button>
      )}
    </>
  );
}
