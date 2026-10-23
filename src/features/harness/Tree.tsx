import { useQuery } from "@tanstack/react-query";
import { getHarnessGroup, getHarnessProjects } from "../../api/client";
import type { HarnessGroupId, HarnessSummary } from "../../api/harnessTypes";
import { GROUP_ICON } from "./labels";
import type { Nav, Update } from "./nav";
import { Icon } from "../../ui/Icon";

/** 데스크톱(1024px 이상) 왼쪽 그룹 트리. 선택한 그룹 아래에 관심사(프로젝트별은 프로젝트)가 펼쳐진다. */
export function GroupTree({ summary, nav, update }: { summary: HarnessSummary; nav: Nav; update: Update }) {
  const active = nav.g as HarnessGroupId | "";
  const concerns = useQuery({ queryKey: ["harness-group", active], queryFn: () => getHarnessGroup(active as HarnessGroupId), enabled: active !== "" && active !== "projects" });
  const projects = useQuery({ queryKey: ["harness-projects"], queryFn: () => getHarnessProjects(), enabled: active === "projects" });
  return <nav className="hv-tree" aria-label="하네스 그룹">
    <button type="button" className="hv-tree__item" aria-current={active === "" ? "page" : undefined} onClick={() => update({ g: null, c: null, l: null, p: null, v: null, item: null, find: null, q: null })}>
      <Icon name="library" />전체 하네스
    </button>
    <ul className="hv-tree__list">
      {summary.groups.map((g) => <li key={g.id}>
        <button type="button" className="hv-tree__item" data-empty={!g.exists || undefined} aria-current={active === g.id && !nav.c && !nav.p ? "page" : undefined}
          aria-expanded={active === g.id} onClick={() => update({ g: g.id, c: null, l: null, p: null, v: null, item: null, find: null, q: null })}>
          <Icon name={GROUP_ICON[g.id]} /><span className="hv-tree__label">{g.short}</span><span className="hv-tree__count">{g.id === "projects" ? (g.projects ?? 0) : g.total}</span>
        </button>
        {active === g.id && g.id !== "projects" && concerns.data && <ul className="hv-tree__sub">
          {concerns.data.concerns.map((c) => <li key={c.id}><button type="button" className="hv-tree__item hv-tree__item--sub" data-empty={!c.exists || undefined}
            aria-current={nav.c === c.id && nav.v !== "sessions" ? "page" : undefined} onClick={() => update({ c: c.id, l: null, v: null, item: null, find: null, q: null })}>
            <span className="hv-tree__label">{c.label}</span><span className="hv-tree__count">{c.exists ? c.present : "없음"}</span></button></li>)}
          {g.id === "ttakkari" && <li><button type="button" className="hv-tree__item hv-tree__item--sub" aria-current={nav.v === "sessions" ? "page" : undefined}
            onClick={() => update({ v: "sessions", item: null, find: null, q: null })}><span className="hv-tree__label">세션별 레이어</span></button></li>}
        </ul>}
        {active === "projects" && g.id === "projects" && projects.data && <ul className="hv-tree__sub">
          {projects.data.projects.map((p) => <li key={p.key}><button type="button" className="hv-tree__item hv-tree__item--sub" aria-current={nav.p === p.key ? "page" : undefined}
            onClick={() => update({ p: p.key, c: null, item: null, find: null, q: null })}>
            <span className="hv-tree__label">{p.name}</span>{p.pool === "company" && <span className="hv-tree__tag">회사</span>}<span className="hv-tree__count">{p.total}</span></button></li>)}
        </ul>}
      </li>)}
    </ul>
  </nav>;
}
