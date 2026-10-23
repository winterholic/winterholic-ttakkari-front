import { useState } from "react";
import type { HarnessGroupCard, HarnessSummary } from "../../api/harnessTypes";
import { Badge } from "../../ui/Badge";
import { Icon } from "../../ui/Icon";
import { WarningPanel, WarningToggle } from "./Finder";
import { GROUP_ICON, formatTime } from "./labels";
import type { Update } from "./nav";

function Card({ card, open }: { card: HarnessGroupCard; open: () => void }) {
  const lead = card.concerns.slice(0, 4);
  return <li>
    <button type="button" className="hv-card" data-empty={!card.exists || undefined} onClick={open} aria-label={`${card.label} 열기`}>
      <span className="hv-card__head">
        <span className="hv-card__icon" aria-hidden="true"><Icon name={GROUP_ICON[card.id]} /></span>
        <span className="hv-card__title">{card.label}</span>
        <span className="hv-row__arrow" aria-hidden="true">›</span>
      </span>
      <span className="hv-card__blurb">{card.blurb}</span>
      <span className="hv-badges">
        <Badge tone={card.exists ? "success" : "warning"}>{card.exists ? "설정 있음" : "설정 없음"}</Badge>
        {card.id === "projects"
          ? <Badge>{`프로젝트 ${card.projects ?? 0}개`}</Badge>
          : <Badge>{`항목 ${card.total.toLocaleString()}`}</Badge>}
        {card.id === "projects" && (card.company_projects ?? 0) > 0 && <Badge tone="warning">{`회사 ${card.company_projects}`}</Badge>}
        {card.missing > 0 && <Badge>{`없음 ${card.missing}`}</Badge>}
        {card.warnings > 0 && <Badge tone="warning">{`경고 ${card.warnings}`}</Badge>}
      </span>
      {lead.length > 0 && <span className="hv-card__concerns">{lead.map((c) => <span key={c.id}>{c.label} <b>{c.total.toLocaleString()}</b></span>)}{card.concerns.length > lead.length && <span>외 {card.concerns.length - lead.length}</span>}</span>}
    </button>
  </li>;
}

/** 첫 화면: 7개 하네스 그룹 카드. 카드를 누르면 그룹 안에서 레이어와 관심사별로 본다. */
export function Home({ summary, update }: { summary: HarnessSummary; update: Update }) {
  const [warnOpen, setWarnOpen] = useState(false);
  const open = (id: string) => update({ g: id, c: null, l: null, p: null, v: null, item: null });
  const main = summary.groups.filter((g) => g.kind === "main");
  const rest = summary.groups.filter((g) => g.kind !== "main");
  const inactive = summary.categories.reduce((n, c) => n + c.inactive, 0);
  return <div className="hv-home">
    <p className="hv-note">내 하네스를 일곱 묶음으로 나눠 놓았어요. 묶음을 열면 위에서 아래로 얹히는 순서(레이어)와 지침·스킬·훅 같은 관심사별 목록이 나와요.</p>
    <section aria-labelledby="hv-main-h" className="hv-block">
      <h2 id="hv-main-h" className="tk-heading-4">메인 하네스 · 엔진 CLI 전역 설정</h2>
      <ul className="hv-cards">{main.map((g) => <Card key={g.id} card={g} open={() => open(g.id)} />)}</ul>
    </section>
    <section aria-labelledby="hv-rest-h" className="hv-block">
      <h2 id="hv-rest-h" className="tk-heading-4">따까리와 프로젝트</h2>
      <ul className="hv-cards">{rest.map((g) => <Card key={g.id} card={g} open={() => open(g.id)} />)}</ul>
    </section>
    <section className="hv-stats" aria-label="요약">
      <div className="hv-stat"><span className="hv-stat__value">{summary.total.toLocaleString()}</span><span className="hv-stat__label">전체 항목</span></div>
      <div className="hv-stat"><span className="hv-stat__value">{inactive.toLocaleString()}</span><span className="hv-stat__label">비활성</span></div>
      <div className="hv-stat"><span className="hv-stat__value">{(summary.total - summary.present).toLocaleString()}</span><span className="hv-stat__label">없는 항목</span></div>
      <WarningToggle summary={summary} open={warnOpen} toggle={() => setWarnOpen((v) => !v)} />
    </section>
    {warnOpen && <WarningPanel summary={summary} openItem={(id) => update({ item: id })} onlyWarned={() => update({ find: "1", warn: "1" })} />}
    <p className="hv-note hv-foot">읽은 시각 {formatTime(summary.generated_at)} · 파일은 수정하지 않고 비밀 값은 서버에서 가려요.</p>
  </div>;
}
