import { useQuery } from "@tanstack/react-query";
import { getHarnessProject, getHarnessProjects } from "../../api/client";
import type { HarnessProjectRow, HarnessRow } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ItemRow, failure } from "./Finder";
import { ENGINE_LABEL } from "./labels";
import type { Nav, Update } from "./nav";

const PROJECT_LAYER = { root: "프로젝트 루트", nested: "하위 폴더" } as const;

function ProjectCard({ project, open }: { project: HarnessProjectRow; open: () => void }) {
  const engines = Object.entries(project.engines);
  return <li>
    <button type="button" className="hv-card hv-card--project" onClick={open} aria-label={`${project.key} 열기`}>
      <span className="hv-card__head">
        <span className="hv-card__icon" aria-hidden="true"><Icon name="folder-open" /></span>
        <span className="hv-card__title hv-break">{project.name}</span>
        <span className="hv-row__arrow" aria-hidden="true">›</span>
      </span>
      <span className="hv-path">~/development/{project.key}</span>
      <span className="hv-badges">
        <Badge tone={project.pool === "company" ? "warning" : undefined}>{project.pool === "company" ? "회사" : "개인"}</Badge>
        {engines.map(([id, n]) => <Badge key={id} tone="info">{`${ENGINE_LABEL[id as keyof typeof ENGINE_LABEL] ?? id} ${n}`}</Badge>)}
        {project.warnings > 0 && <Badge tone="warning">{`경고 ${project.warnings}`}</Badge>}
      </span>
    </button>
  </li>;
}

/** 프로젝트 목록: 회사 → 개인 순. 하네스 파일이 하나도 없는 프로젝트는 접어서 이름만 보여 준다. */
export function ProjectList({ update }: { update: Update }) {
  const result = useQuery({ queryKey: ["harness-projects"], queryFn: () => getHarnessProjects() });
  const data = result.data;
  const company = data?.projects.filter((p) => p.pool === "company") ?? [];
  const personal = data?.projects.filter((p) => p.pool !== "company") ?? [];
  const open = (key: string) => update({ p: key, c: null, item: null });
  return <div className="hv-projects">
    {result.isPending && <p role="status" className="hv-note">프로젝트를 찾는 중</p>}
    {result.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(result.error)}</p><Button variant="ghost" onClick={() => void result.refetch()}>다시 시도</Button></div>}
    {data && <>
      <p className="hv-note">프로젝트 {data.scanned}개를 살펴보니 하네스 파일이 있는 프로젝트는 {data.total}개예요. 프로젝트 → 엔진 → 관심사 순으로 봐요.</p>
      {company.length > 0 && <section aria-labelledby="hv-co-h" className="hv-block">
        <h2 id="hv-co-h" className="tk-heading-4">회사 프로젝트 <Badge tone="warning">회사</Badge></h2>
        <ul className="hv-cards">{company.map((p) => <ProjectCard key={p.key} project={p} open={() => open(p.key)} />)}</ul>
      </section>}
      <section aria-labelledby="hv-pe-h" className="hv-block">
        <h2 id="hv-pe-h" className="tk-heading-4">개인 프로젝트</h2>
        <ul className="hv-cards">{personal.map((p) => <ProjectCard key={p.key} project={p} open={() => open(p.key)} />)}</ul>
      </section>
      {data.without_harness.length > 0 && <details className="hv-disclosure">
        <summary>하네스 파일이 없는 프로젝트 {data.without_harness.length}개</summary>
        <p className="hv-note hv-break">{data.without_harness.join(" · ")}</p>
      </details>}
    </>}
  </div>;
}

export function ProjectView({ nav, update, selected, select }: { nav: Nav; update: Update; selected: string; select: (row: HarnessRow) => void }) {
  const result = useQuery({ queryKey: ["harness-project", nav.p], queryFn: () => getHarnessProject(nav.p) });
  const data = result.data;
  return <div className="hv-project">
    <div className="hv-tools"><Button variant="ghost" onClick={() => update({ p: null, c: null, item: null })}><Icon name="back" />프로젝트 목록</Button></div>
    <header className="hv-group__head">
      <span className="hv-card__icon" aria-hidden="true"><Icon name="folder-open" /></span>
      <div className="hv-group__titles">
        <h2 className="tk-heading-3 hv-break">{data?.name ?? nav.p.split("/").pop()}</h2>
        <p className="hv-path hv-path--full">~/development/{nav.p}</p>
      </div>
    </header>
    {result.isPending && <p role="status" className="hv-note">프로젝트를 읽는 중</p>}
    {result.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(result.error)}</p><Button variant="ghost" onClick={() => void result.refetch()}>다시 시도</Button></div>}
    {data && <>
      <div className="hv-badges">
        <Badge tone={data.pool === "company" ? "warning" : undefined}>{data.pool === "company" ? "회사" : "개인"}</Badge>
        <Badge>{`항목 ${data.total}`}</Badge>
        {data.warnings > 0 && <Badge tone="warning">{`경고 ${data.warnings}`}</Badge>}
      </div>
      <p className="hv-note">{PROJECT_LAYER.root}의 파일이 먼저, {PROJECT_LAYER.nested}의 파일이 그 위에 얹혀요(엔진 동작은 확인 필요).</p>
      {data.engines.map((engine) => <section key={engine.id} className="hv-engine" aria-label={`${engine.label} 항목`}>
        <h3 className="tk-heading-4">{engine.label} <span className="hv-note">항목 {engine.total}</span></h3>
        {engine.concerns.map((c) => <div key={c.id} className="hv-engine__concern">
          <h4 className="hv-subhead">{c.label} <span>{c.total}</span></h4>
          <ul className="hv-list">{c.items.map((r) => <ItemRow key={r.id} row={r} selected={selected === r.id} select={select} showEngine={false} layerLabel={PROJECT_LAYER[r.layer as keyof typeof PROJECT_LAYER]} />)}</ul>
          {c.truncated && <p className="hv-note">앞의 120개만 보여요. 검색에서 프로젝트 이름으로 더 찾을 수 있어요.</p>}
        </div>)}
      </section>)}
    </>}
  </div>;
}
