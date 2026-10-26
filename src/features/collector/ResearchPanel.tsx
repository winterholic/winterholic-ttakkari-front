import { Link } from "react-router";
import type { CollectionContextRelation, CollectionCoverageEntry, CollectionMission, CollectionPaper } from "../../api/collectionMissions";
import {
  COVERAGE_STATE, COVERED_RULE, RELATION_LABEL, ROUND_REASON, TARGET_KIND,
  coverageLabel, hasResearch, paperRights, paperSource, safeHttp, searchErrorLabels, searchStats, stopText,
} from "./researchLabels";
import type { SearchStats } from "./researchLabels";

const count = (n: number | undefined) => (n ?? 0).toLocaleString("ko-KR");

/** 계획 안의 간단한 조사 범위 목록. 상태 문구는 상세 패널과 같은 표를 쓴다. */
export function CoverageTopics({ coverage }: { coverage: CollectionCoverageEntry[] }) {
  return <ul className="mission-topics" aria-label="조사 범위">{coverage.map(area => <li key={area.key ?? area.topic}>{area.topic}<span>{coverageLabel(area.state)}</span></li>)}</ul>;
}

export function GapDetail({ gap }: { gap: CollectionMission["gaps"][number] }) {
  if (gap.reason === "search_provider_failed") {
    const causes = searchErrorLabels(gap.codes);
    return <p className="kb-note">실패한 검색 {count(gap.queries)}건{causes.length ? ` · 원인: ${causes.join(", ")}` : ""} · 결과가 없던 것이 아니라 검색을 마치지 못한 것입니다.</p>;
  }
  if (gap.reason === "no_search_candidates") return <p className="kb-note">검색은 성공했지만 수집할 출처를 찾지 못했습니다(검색 실패와 다름).</p>;
  if (gap.reason === "research_coverage_incomplete" && gap.topics?.length) {
    return <p className="kb-note">{gap.topics.map(topic => `${topic.topic}: ${coverageLabel(topic.state)}`).join(" · ")}</p>;
  }
  return null;
}

function TopicStatus({ coverage, stats }: { coverage: CollectionCoverageEntry[]; stats: SearchStats }) {
  return <>
    <ul className="mission-research__topics">{coverage.map(entry => {
      const failed = entry.key ? stats.failedByTopic[entry.key] ?? 0 : 0;
      return <li key={entry.key ?? entry.topic}>
        <div className="mission-research__row"><strong>{entry.topic}</strong><span className="mission-status-badge" data-state={entry.state}>{coverageLabel(entry.state)}</span></div>
        <p className="kb-note">{COVERAGE_STATE[entry.state]?.hint ?? "이 상태는 아직 설명을 제공하지 않습니다."}
          {" "}수락 자료 {count(entry.documents)}건 · 서로 다른 출처 {count(entry.hosts)}곳 · 발견한 주소 {count(entry.sources)}개</p>
        {failed > 0 && <p className="kb-note">검색 공급자 실패 {count(failed)}건이 남아 있어 이 주제의 상태는 검색 결과 없음과 다릅니다.</p>}
      </li>;
    })}</ul>
    <p className="kb-note">{COVERED_RULE}</p>
  </>;
}

function Rounds({ research }: { research: NonNullable<CollectionMission["research"]> }) {
  return <ol className="mission-research__rounds">{(research.rounds ?? []).map(round => <li key={round.round}>
    <strong>라운드 {round.round}</strong>
    <p className="kb-note">수락 자료 누적 {count(round.documents)}건{round.new_documents_since_previous != null ? ` · 직전 점검 뒤 새 자료 ${count(round.new_documents_since_previous)}건` : ""}
      {round.duplicates ? ` · 중복 ${count(round.duplicates)}건` : ""}{round.new_papers ? ` · 새 논문 후보 ${count(round.new_papers)}편` : ""}</p>
    {round.queries?.length ? <><p className="kb-note">후속 검색어 {count(round.queries.length)}개{round.reasons?.length ? ` · 근거: ${round.reasons.map(reason => ROUND_REASON[reason] ?? "기타").join(", ")}` : ""}</p>
      <ul>{round.queries.map(query => <li key={query}>{query}</li>)}</ul></> : <p className="kb-note">새로 추가한 검색어가 없습니다.</p>}
    {round.stop && <p className="kb-note">{stopText(round.stop)}</p>}
  </li>)}</ol>;
}

function Papers({ papers }: { papers: CollectionPaper[] }) {
  return <ul className="mission-research__papers">{papers.map(paper => {
    const rights = paperRights(paper);
    const url = safeHttp(paper.canonical_url);
    return <li key={paper.identifier}>
      <strong>{paper.title?.trim() || "제목을 확인하지 못한 논문"}</strong>
      <p className="kb-note">출처: {url ? <a href={url} target="_blank" rel="noreferrer">{paperSource(paper)}</a> : paperSource(paper)}</p>
      <p className="kb-note"><span className="mission-status-badge" data-fulltext={rights.fulltext}>{rights.summary}</span> {rights.detail}</p>
    </li>;
  })}</ul>;
}

function RelationTarget({ relation }: { relation: CollectionContextRelation }) {
  const target = relation.target;
  const url = safeHttp(target?.url);
  const title = target?.title?.trim() || target?.url || target?.identifier || "제목 없는 자료";
  const href = target?.kind === "kb_document" && target.document_id ? `/knowledge-library?view=docs&doc=${encodeURIComponent(target.document_id)}` : null;
  return <li>
    <span className="mission-status-badge">{RELATION_LABEL[relation.type] ?? "관계 확인 필요"}</span>{" "}
    {TARGET_KIND[target?.kind ?? ""] ?? "자료"}:{" "}
    {href ? <Link to={href}>{title}</Link> : url ? <a href={url} target="_blank" rel="noreferrer">{title}</a> : title}
    {relation.type === "lexical_overlap" && relation.matched_terms?.length ? <span className="kb-note"> · 겹친 용어 {relation.matched_terms.join(", ")}</span> : null}
  </li>;
}

function ContextClaims({ mission }: { mission: CollectionMission }) {
  const links = mission.plan.context_links;
  const claims = links?.claims ?? [];
  if (!links) return <p className="kb-note">사용자 맥락은 있지만 아직 수집 자료와 연결한 결과가 없습니다. 첫 점검 뒤에 표시됩니다.</p>;
  return <>
    <p className="kb-note">연결은 사실 확인이 아닙니다. ‘내용 유사’는 확인해 볼 단서일 뿐 근거나 반박이 아닙니다.</p>
    <ul className="mission-research__claims">{claims.map(claim => {
      const relations = (links.relations ?? []).filter(relation => relation.claim_id === claim.id);
      return <li key={claim.id}>
        <p>{claim.text}</p>
        <p className="kb-note"><span className="mission-status-badge">사용자 제공·미검증</span></p>
        {relations.length > 0 ? <ul>{relations.map((relation, index) => <RelationTarget key={`${relation.type}-${index}`} relation={relation} />)}</ul>
          : <p className="kb-note">연결된 자료 없음</p>}
      </li>;
    })}</ul>
  </>;
}

export function ResearchPanel({ mission }: { mission: CollectionMission }) {
  if (!hasResearch(mission)) return null;
  const { plan, research } = mission;
  const coverage = research?.coverage ?? plan.coverage ?? [];
  const stats = searchStats(plan, mission.run_seq ?? 1);
  const covered = coverage.filter(entry => entry.state === "covered").length;
  const papers = plan.papers ?? [];
  const claimCount = plan.context_links?.claims?.length ?? 0;
  const hasContext = Boolean(plan.context?.text?.trim() || plan.context_links);
  const searchBudget = research?.search_budget ?? plan.budget.searches;
  return <section className="mission-research" aria-label="자율 조사">
    <h3>자율 조사</h3>
    {research && <>
      <p className="kb-note" aria-label="조사 라운드">후속 조사 라운드 {count(research.round)}회 점검{plan.budget.rounds ? `(상한 ${count(plan.budget.rounds)}회)` : ""} · 검색 {count(research.searches_used)}{searchBudget ? `/${count(searchBudget)}` : ""}회 사용</p>
      <p className="kb-note" role="status" aria-label="조사 종료 사유">{stopText(research.stop, plan.budget.rounds)}</p>
    </>}
    {coverage.length > 0 && <p className="kb-note">하위 주제 {count(coverage.length)}개 중 {count(covered)}개를 충분히 확보했습니다.</p>}
    {stats.failed > 0 && <p className="kb-note" role="status" aria-label="검색 실패">검색 공급자 호출 실패 {count(stats.failed)}건이 남아 있습니다. 결과 없음과는 다른 상태입니다.</p>}
    {stats.emptyOk > 0 && <p className="kb-note" aria-label="결과 없는 검색">검색은 성공했지만 결과가 없던 검색 {count(stats.emptyOk)}회</p>}
    {coverage.length > 0 && <details><summary>하위 주제별 조사 상태</summary><TopicStatus coverage={coverage} stats={stats} /></details>}
    {research?.rounds?.length ? <details><summary>라운드 기록 {count(research.rounds.length)}건</summary><Rounds research={research} /></details> : null}
    {papers.length > 0 && <details><summary>논문 {count(papers.length)}편 · 서지 정보만 {count(papers.filter(paper => !paperRights(paper).fulltext).length)}편</summary><Papers papers={papers} /></details>}
    {hasContext && <details><summary>사용자 맥락 {count(claimCount)}건 · 사용자 제공·미검증</summary><ContextClaims mission={mission} /></details>}
  </section>;
}
