import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { getHarnessSummary } from "../api/client";
import type { HarnessGroupId, HarnessRow } from "../api/harnessTypes";
import { Detail } from "../features/harness/Detail";
import { ItemList, SearchBar, failure } from "../features/harness/Finder";
import { GroupView } from "../features/harness/Group";
import { Home } from "../features/harness/Home";
import { ProjectList, ProjectView } from "../features/harness/Projects";
import { GroupTree } from "../features/harness/Tree";
import { readNav } from "../features/harness/nav";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "../features/harness/harness.css";

/**
 * 부가 기능 > 하네스. 7개 그룹(Claude·Codex·Muse·Qwen Code·Antigravity 메인 하네스, 따까리, 프로젝트별)을 1차 내비게이션으로 두고,
 * 그룹 안에서 레이어(얹히는 순서)와 관심사별로 읽기만 한다. 백엔드 ADR 0069·0070. 값은 서버에서 마스킹돼 오고, 상태는 모두 URL 에 둔다.
 * 통합 검색은 머리글의 검색 아이콘으로 여는 보조 기능이다.
 */
export function HarnessPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const summary = useQuery({ queryKey: ["harness-summary"], queryFn: () => getHarnessSummary() });
  const nav = readNav(params);

  const update = useCallback((values: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(values)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    });
  }, [setParams]);
  const setQuery = useCallback((q: string) => update({ q: q || null, item: null, find: "1" }), [update]);
  const scrollToDetail = () => {
    if (window.matchMedia?.("(max-width: 1023px)").matches) requestAnimationFrame(() => document.querySelector(".hv-detail")?.scrollIntoView({ block: "start" }));
  };
  // 항목은 지금 보고 있는 그룹·프로젝트·검색 자리에서 연다(주소의 g·c·p·q 는 그대로 둔다).
  const select = useCallback((row: HarnessRow) => {
    update({ item: row.id });
    scrollToDetail();
  }, [update]);
  const refresh = async () => {
    await getHarnessSummary(true).then((data) => queryClient.setQueryData(["harness-summary"], data));
    for (const key of ["harness-items", "harness-item", "harness-layers", "harness-group", "harness-projects", "harness-project"]) await queryClient.invalidateQueries({ queryKey: [key] });
  };
  const data = summary.data;
  const closeItem = () => update({ item: null });
  const detail = nav.item
    ? <Detail key={nav.item} id={nav.item} query={nav.q} back={closeItem} update={update} openSession={(s) => update({ g: "ttakkari", v: "sessions", s, item: null, find: null, q: null })} />
    : <div className="hv-placeholder"><p>항목을 고르면 출처 경로, 적용 범위, 레이어, 본문이 여기에 보여요.</p><p className="hv-note">따까리 하네스의 “세션별 레이어”에서는 접수·기획·작업자 세션에 어떤 지침이 어떤 순서로 합쳐지는지 볼 수 있어요.</p></div>;

  const browser = (list: ReactNode) => <div className="hv-browser" data-selected={Boolean(nav.item)}><div className="hv-pane">{list}</div>{detail}</div>;
  let body: ReactNode = null;
  if (data) {
    if (nav.find) {
      body = <div className="hv-find">
        <div className="hv-top" data-selected={Boolean(nav.item)}>
          <SearchBar value={nav.q} onSubmit={setQuery} autoFocus />
          <div className="hv-chips hv-chips--scroll" role="group" aria-label="그룹 범위">
            <button type="button" className="hv-chip" aria-pressed={!nav.fg} onClick={() => update({ fg: null, item: null })}>전체</button>
            {data.groups.map((g) => <button key={g.id} type="button" className="hv-chip" aria-pressed={nav.fg === g.id} onClick={() => update({ fg: nav.fg === g.id ? null : g.id, item: null })}>{g.short}</button>)}
          </div>
          {nav.warn && <p className="hv-filterbar">경고 있는 항목만 <Button variant="ghost" size="sm" onClick={() => update({ warn: null })}>해제</Button></p>}
        </div>
        {browser(<ItemList key={`${nav.q}|${nav.fg}|${nav.warn}`} query={{ q: nav.q || undefined, hgroup: nav.fg || undefined, warned: nav.warn || undefined }} text={nav.q}
          selected={nav.item} select={select} showCrumb empty="조건에 맞는 항목이 없어요. 검색어를 줄이거나 그룹 범위를 풀어 보세요." />)}
      </div>;
    } else if (nav.item && !nav.g) {
      body = <div className="hv-browser hv-browser--single" data-selected="true">{detail}</div>;
    } else if (nav.g === "projects") {
      body = browser(nav.p ? <ProjectView nav={nav} update={update} selected={nav.item} select={select} /> : <ProjectList update={update} />);
    } else if (nav.g) {
      body = browser(<GroupView id={nav.g as HarnessGroupId} summary={data} nav={nav} update={update} selected={nav.item} select={select} />);
    } else {
      body = <Home summary={data} update={update} />;
    }
  }

  return <div className="tk-screen">
    <PageHeader title="하네스" meta="내 하네스를 한 곳에서 · 읽기 전용" actions={<>
      <button type="button" className="tk-icon-button" aria-label="검색" aria-pressed={nav.find} onClick={() => update(nav.find ? { find: null, q: null, fg: null, warn: null, item: null } : { find: "1", item: null })}><Icon name="search" /></button>
      <button type="button" className="tk-icon-button" aria-label="다시 읽기" onClick={() => void refresh()}><Icon name="retry" /></button>
    </>} />
    <div className="tk-screen__body"><div className="tk-container hv-page">
      {summary.isPending && <p className="hv-note" role="status">하네스를 읽는 중</p>}
      {summary.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(summary.error)}</p><Button variant="ghost" onClick={() => void summary.refetch()}>다시 시도</Button></div>}
      {data && <div className="hv-shell" data-item={Boolean(nav.item)}>
        <GroupTree summary={data} nav={nav} update={update} />
        <div className="hv-main">{body}</div>
      </div>}
    </div></div>
  </div>;
}
