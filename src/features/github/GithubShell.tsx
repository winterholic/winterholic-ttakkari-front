import { useEffect, useMemo, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GhApiError, ghAccounts, GH_ACCOUNTS_KEY } from "../../api/githubClient";
import { PageHeader } from "../../shell/PageHeader";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { GhContext } from "./GithubContext";
import type { GhContextValue } from "./GithubContext";
import { crumbsFor, titleFor } from "./crumbs";
import { forgetRecent, getSavedAccount, saveAccount } from "./recent";
import { preserveQuery } from "./links";
import { AccountPicker } from "./state/AccountPicker";
import { GhErrorState, GhSkeleton } from "./state/StateView";
import { useScrollRestore } from "./useScrollRestore";
import "./github.css";

const ACCOUNT_STALE = 30_000;
const NO_ACCOUNT = new GhApiError({ status: 503, code: "no_account", message: "no account" });
const NO_GH = new GhApiError({ status: 503, code: "gh_cli_missing", message: "gh not found" });

/**
 * /github/* 의 공통 틀. 선택 계정(`?as=`)이 확정되기 전에는 아래 화면을 그리지 않는다.
 * 계정이 바뀌거나 목록에서 사라지면 그 계정의 쿼리 캐시를 지워, 비공개 데이터가 다른 계정 화면으로 새지 않게 한다.
 */
export function GithubShell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const body = useRef<HTMLDivElement>(null);
  useScrollRestore(body);

  const accountsQuery = useQuery({ queryKey: GH_ACCOUNTS_KEY, queryFn: ghAccounts, staleTime: ACCOUNT_STALE });
  const all = useMemo(() => accountsQuery.data?.accounts ?? [], [accountsQuery.data]);
  const usable = useMemo(() => all.filter((a) => a.state === "success"), [all]);
  const asParam = params.get("as");
  const active = asParam && usable.some((a) => a.login === asParam) ? asParam : null;

  // `as` 가 없을 때만 자동으로 채운다: 마지막에 쓴 계정이 아직 유효하거나, 쓸 수 있는 계정이 하나뿐일 때.
  // 둘 다 아니면(=여러 계정 중 고르는 일) 사용자가 직접 고른다. 서버는 기본 계정을 추정하지 않는다.
  useEffect(() => {
    if (!accountsQuery.data || active || asParam) return;
    const saved = getSavedAccount();
    const pick = saved && usable.some((a) => a.login === saved) ? saved : usable.length === 1 ? usable[0].login : null;
    if (pick) navigate({ pathname: location.pathname, search: "?" + preserveQuery(params, pick).toString() }, { replace: true });
  }, [accountsQuery.data, active, asParam, usable, params, location.pathname, navigate]);

  useEffect(() => {
    if (active) saveAccount(active);
  }, [active]);

  // 계정 전환: 떠난 계정의 응답을 즉시 비운다.
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current && previous.current !== active) qc.removeQueries({ queryKey: ["github", previous.current] });
    previous.current = active;
  }, [active, qc]);

  // 계정이 목록에서 사라졌거나 쓸 수 없게 되면 그 계정의 캐시와 최근 목록을 지운다.
  useEffect(() => {
    if (!accountsQuery.data) return;
    const names = new Set(usable.map((a) => a.login));
    for (const q of qc.getQueryCache().findAll({ queryKey: ["github"] })) {
      const login = q.queryKey[1];
      if (typeof login === "string" && !names.has(login)) {
        qc.removeQueries({ queryKey: ["github", login] });
        forgetRecent(login);
      }
    }
  }, [accountsQuery.data, usable, qc]);

  const value = useMemo<GhContextValue | null>(() => {
    if (!active) return null;
    return {
      account: active,
      accounts: usable,
      switchAccount: (login) => navigate({ pathname: location.pathname, search: "?" + preserveQuery(params, login).toString() }),
    };
  }, [active, usable, navigate, location.pathname, params]);

  const pickAccount = (login: string) =>
    navigate({ pathname: location.pathname, search: "?" + preserveQuery(params, login).toString() }, { replace: true });

  let content;
  if (accountsQuery.isPending) content = <GhSkeleton kind="card" label="계정을 확인하는 중" />;
  else if (accountsQuery.isError) content = <GhErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />;
  else if (accountsQuery.data.gh_available === false) content = <GhErrorState error={NO_GH} />;
  else if (all.length === 0) content = <GhErrorState error={NO_ACCOUNT} />;
  else if (!active) {
    // 자동 채움 대상이면 이동이 끝날 때까지 선택 화면을 깜빡이지 않는다.
    const saved = getSavedAccount();
    const autoFilling = !asParam && ((saved && usable.some((a) => a.login === saved)) || usable.length === 1);
    content = autoFilling ? <GhSkeleton kind="card" label="계정을 여는 중" /> : <AccountPicker accounts={all} requested={asParam} onPick={pickAccount} />;
  } else content = value && <GhContext.Provider value={value}><Outlet /></GhContext.Provider>;

  const crumbs = active ? crumbsFor(location.pathname, active) : [];
  return (
    <div className="tk-screen">
      <PageHeader
        title={titleFor(location.pathname)}
        meta={active ? "계정 " + active : "GitHub 조회"}
        actions={active ? (
          <Menu
            label={"계정 전환: " + active}
            align="end"
            triggerClassName="tk-button tk-button--ghost tk-button--sm gh-account"
            items={usable.map((a) => ({
              label: a.login + (a.login === active ? " (현재)" : ""),
              icon: a.login === active ? "check" : undefined,
              onSelect: () => value?.switchAccount(a.login),
            }))}
          >
            <Icon name="user" />
            <span>{active}</span>
          </Menu>
        ) : undefined}
      />
      <div className="tk-screen__body" ref={body}>
        <div className="tk-container tk-container--lg gh">
          {crumbs.length > 1 && (
            <nav className="tk-path gh-path" aria-label="현재 위치">
              <ol>
                {crumbs.map((c, i) => (
                  <li key={i}>
                    {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {content}
        </div>
      </div>
    </div>
  );
}
