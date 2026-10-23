import { useQuery } from "@tanstack/react-query";
import { getHarnessGroup } from "../../api/client";
import type { HarnessGroupDetail, HarnessGroupId, HarnessGroupLayer, HarnessInjection, HarnessRow, HarnessSummary } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ItemList, failure } from "./Finder";
import { Layers } from "./Layers";
import { GROUP_ICON, PHASE_LABEL } from "./labels";
import type { Nav, Update } from "./nav";

const SESSIONS = ["desk", "lead", "worker", "orchestrator"] as const;
const LAYER_ENGINES = ["claude", "codex", "antigravity", "muse", "qwen-local"] as const;
const GROUP_ENGINE: Partial<Record<HarnessGroupId, (typeof LAYER_ENGINES)[number]>> = {
  claude: "claude", codex: "codex", antigravity: "antigravity", muse: "muse", qwen: "qwen-local",
};

function Injection({ rows, open }: { rows: HarnessInjection[]; open: (id: string) => void }) {
  return <ul className="hv-inject" aria-label="따까리가 얹는 것">
    {rows.map((r) => <li key={r.id} data-applied={r.applies}>
      <span className="hv-badges"><Badge>{PHASE_LABEL[r.phase]}</Badge><Badge tone={r.applies ? "success" : undefined}>{r.applies ? "적용" : "미적용"}</Badge></span>
      <span className="hv-break">{r.title}</span>
      {r.condition && <span className="hv-note">{r.condition}</span>}
      {r.item_id && <Button variant="ghost" size="sm" onClick={() => open(r.item_id!)}>상세<Icon name="chevron-right" /></Button>}
    </li>)}
  </ul>;
}

function LayerCard({ layer, group, nav, update, concernLabels }: {
  layer: HarnessGroupLayer; group: HarnessGroupDetail; nav: Nav; update: Update; concernLabels: Record<string, string>;
}) {
  const selected = nav.l === layer.id;
  const concerns = Object.entries(layer.concerns);
  const engine = GROUP_ENGINE[group.id];
  return <li className="hv-stack__item" data-applied={layer.applies} data-selected={selected || undefined}>
    <span className="hv-layer__order" aria-hidden="true">{layer.order}</span>
    <div className="hv-layer__body">
      <div className="hv-layer__title">
        <h3 className="tk-heading-4 hv-break">{layer.label}</h3>
        {!layer.applies ? <Badge>로드 안 함</Badge> : <Badge tone={layer.total ? "success" : undefined}>{layer.total ? `항목 ${layer.total}` : "항목 없음"}</Badge>}
      </div>
      <span className="hv-badges">
        <Badge tone={layer.evidence === "code" ? "info" : "warning"}>{layer.evidence === "code" ? "코드로 확인" : "엔진 동작 · 확인 필요"}</Badge>
        {layer.missing > 0 && <Badge>{`없음 ${layer.missing}`}</Badge>}
        {layer.warnings > 0 && <Badge tone="warning">{`경고 ${layer.warnings}`}</Badge>}
      </span>
      <p className="hv-note">{layer.note}</p>
      {concerns.length > 0 && <div className="hv-chips" role="group" aria-label={`${layer.label}의 관심사`}>
        {concerns.map(([id, n]) => <button key={id} type="button" className="hv-chip hv-chip--small" aria-pressed={selected && nav.c === id}
          onClick={() => update(selected && nav.c === id ? { l: null } : { l: layer.id, c: id, item: null })}>{concernLabels[id] ?? id} <span>{n}</span></button>)}
      </div>}
      {layer.link && <Button variant="ghost" size="sm" onClick={() => update({ g: layer.link!.group, c: null, l: null, p: null, item: null })}>
        {layer.link.label}{layer.link.total > 0 ? ` · ${layer.link.projects}개 프로젝트 ${layer.link.total}개 항목` : ""}<Icon name="chevron-right" /></Button>}
      {layer.injection && <details className="hv-disclosure" open>
        <summary>따까리가 얹는 것 {layer.injection.length}가지(작업자 세션 기준)</summary>
        <Injection rows={layer.injection} open={(id) => update({ item: id })} />
        {engine && <Button variant="ghost" size="sm" onClick={() => update({ g: "ttakkari", v: "sessions", le: engine, c: null, l: null, p: null, item: null })}>세션별 레이어 전체 보기<Icon name="chevron-right" /></Button>}
      </details>}
    </div>
  </li>;
}

/** 위에서 아래로 얹히는 순서. 아래 레이어가 위 레이어 위에 얹힌다. */
export function LayerStack({ group, nav, update, concernLabels }: { group: HarnessGroupDetail; nav: Nav; update: Update; concernLabels: Record<string, string> }) {
  return <section className="hv-stack" aria-label="레이어 스택">
    <h2 className="tk-heading-4">얹히는 순서</h2>
    <p className="hv-note">위에서 아래로 쌓여요. 아래 레이어가 위 레이어 위에 얹힙니다. 숫자 칩을 누르면 그 레이어의 항목만 봐요.</p>
    <ol className="hv-stack__list">{group.layers.map((l) => <LayerCard key={l.id} layer={l} group={group} nav={nav} update={update} concernLabels={concernLabels} />)}</ol>
  </section>;
}

export function GroupView({ id, summary, nav, update, selected, select }: {
  id: HarnessGroupId; summary: HarnessSummary; nav: Nav; update: Update; selected: string; select: (row: HarnessRow) => void;
}) {
  const result = useQuery({ queryKey: ["harness-group", id], queryFn: () => getHarnessGroup(id) });
  const group = result.data;
  const card = summary.groups.find((g) => g.id === id);
  const layerLabels = Object.fromEntries((group?.layers ?? []).map((l) => [l.id, l.label]));
  const concern = group ? (group.concerns.find((c) => c.id === nav.c) ?? group.concerns.find((c) => c.exists) ?? group.concerns[0])?.id : undefined;
  const sessions = id === "ttakkari" && nav.v === "sessions";
  const engine = GROUP_ENGINE[id];
  return <div className="hv-group">
    <div className="hv-tools">
      <Button variant="ghost" className="hv-back-home" onClick={() => update({ g: null, c: null, l: null, p: null, v: null, item: null })}><Icon name="back" />전체 하네스</Button>
    </div>
    <header className="hv-group__head">
      <span className="hv-card__icon" aria-hidden="true"><Icon name={GROUP_ICON[id]} /></span>
      <div className="hv-group__titles">
        <h2 className="tk-heading-3 hv-break">{card?.label ?? id}</h2>
        <p className="hv-note">{card?.blurb}</p>
      </div>
    </header>
    {result.isPending && <p role="status" className="hv-note">그룹을 읽는 중</p>}
    {result.isError && <div className="hv-error"><p className="tk-error" role="alert">{failure(result.error)}</p><Button variant="ghost" onClick={() => void result.refetch()}>다시 시도</Button></div>}
    {group && <>
      <div className="hv-badges">
        <Badge tone={group.exists ? "success" : "warning"}>{group.exists ? "설정 있음" : "설정 없음"}</Badge>
        <Badge>{`항목 ${group.total.toLocaleString()}`}</Badge>
        {group.missing > 0 && <Badge>{`없음 ${group.missing}`}</Badge>}
        {group.inactive > 0 && <Badge>{`비활성 ${group.inactive}`}</Badge>}
        {group.warnings > 0 && <Badge tone="warning">{`경고 ${group.warnings}`}</Badge>}
      </div>
      {group.notes.length > 0 && <ul className="hv-notes">{group.notes.map((n) => <li key={n}><Icon name="info" /><span>{n}</span></li>)}</ul>}
      {id === "ttakkari" && <nav className="hv-tabs" aria-label="따까리 하네스 보기">
        <button type="button" aria-pressed={!sessions} onClick={() => update({ v: null, item: null })}>관심사별</button>
        <button type="button" aria-pressed={sessions} onClick={() => update({ v: "sessions", item: null })}>세션별 레이어</button>
      </nav>}
      {sessions
        ? <Layers state={{ session: SESSIONS.find((s) => s === nav.s) ?? "lead", engine: LAYER_ENGINES.find((e) => e === nav.le) ?? "claude", pool: nav.pool === "work" ? "work" : "personal" }}
          update={update} openItem={(item) => update({ item })} />
        : <>
          <LayerStack group={group} nav={nav} update={update} concernLabels={summary.labels.concerns} />
          <section className="hv-concerns" aria-label="관심사">
            <h2 className="tk-heading-4">관심사별 보기</h2>
            <div className="hv-chips hv-chips--scroll" role="group" aria-label="관심사">
              {group.concerns.map((c) => <button key={c.id} type="button" className="hv-chip" data-muted={!c.exists || undefined} aria-pressed={concern === c.id}
                onClick={() => update({ c: c.id, l: null, item: null })}>
                {c.label} <span>{c.exists ? c.present : "없음"}</span>{c.warnings > 0 && <i className="hv-chip__dot" aria-label={`경고 ${c.warnings}`} />}
              </button>)}
            </div>
            {nav.l && <p className="hv-filterbar">레이어: <strong>{layerLabels[nav.l] ?? nav.l}</strong> <Button variant="ghost" size="sm" onClick={() => update({ l: null })}>해제</Button></p>}
            {concern && <ItemList key={`${id}-${concern}-${nav.l}`} query={{ hgroup: id, concern, layer: nav.l || undefined }} selected={selected} select={select}
              layerLabels={layerLabels} showEngine={id === "antigravity"} empty="이 관심사에는 항목이 없어요." />}
            {!engine && id === "ttakkari" && <p className="hv-note">접수·기획·작업자 세션에 실제로 합쳐지는 순서는 위의 “세션별 레이어”에서 봐요.</p>}
          </section>
        </>}
    </>}
  </div>;
}
