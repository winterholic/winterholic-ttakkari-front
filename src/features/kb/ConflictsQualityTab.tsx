import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbConflicts, kbResolveConflict } from "../../api/kb";
import type { KbConflict, KbConflictClaim, KbConflictEntity, KbConflictKind, KbResolution, KbSummaryV3 } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { failure, formatTime } from "./labels";
import { CONFLICT_KIND_TEXT, conflictStatusText, domainLabel, isSystemResolution, kindLabel } from "./labelsV3";

const KIND_FILTERS: { id: "" | KbConflictKind; label: string }[] = [
  { id: "", label: "전체" }, { id: "value_contradiction", label: "값이 다른 주장" }, { id: "polarity_contradiction", label: "서로 반대되는 주장" },
  { id: "version_divergence", label: "버전에 따라 달라진 주장" }, { id: "ambiguous_entity", label: "모호한 개념" },
];
const STATUS_FILTERS: { id: "open" | "all"; label: string }[] = [{ id: "open", label: "열린 것만" }, { id: "all", label: "해결된 것 포함" }];
const PAGE = 30;

interface Choice { resolution: KbResolution; label: string; effect: string; ghost?: boolean }
// 서버는 충돌 종류에 맞는 해결만 받는다: 모호한 개념은 병합·분리, 상충 주장은 A·B 채택 또는 둘 다 유효. 나머지는 422 kb_resolution_not_applicable.
const CLAIM_CHOICES: Choice[] = [
  { resolution: "resolved_a", label: "A를 정본으로 채택", effect: "A 주장이 정본이 되고 B는 다툼 상태로 남아요." },
  { resolution: "resolved_b", label: "B를 정본으로 채택", effect: "B 주장이 정본이 되고 A는 다툼 상태로 남아요." },
  { resolution: "resolved_both_valid", label: "적용 조건 차이로 둘 다 유효", effect: "두 주장이 서로 다른 조건에서 모두 맞다고 사람이 기록해요. 정본 요약에 둘 다 반영돼요. 확실하지 않으면 고르지 마세요.", ghost: true },
];
const ENTITY_CHOICES: Choice[] = [
  { resolution: "merged", label: "하나의 개념으로 병합", effect: "두 개념의 별칭·주장·문서가 하나로 합쳐져요. 되돌리기 어려울 수 있어요." },
  { resolution: "kept_separate", label: "서로 다른 개념으로 분리 확정", effect: "앞으로 자동으로 다시 병합 후보에 올리지 않아요.", ghost: true },
];

function ClaimCard({ side, claim, openDocument }: { side: "A" | "B"; claim: KbConflictClaim; openDocument: (documentId: string, revisionId?: string) => void }) {
  return <section className="kb3-claimcard" aria-label={`주장 ${side}`}>
    <p className="kb3-claimcard__side">{side}</p>
    <p className="kb3-claimcard__text">{claim.text ?? "주장 문장을 읽지 못했어요."}</p>
    <div className="kb-badges">
      {claim.status === "superseded" && <Badge>이전 버전의 주장</Badge>}
      {claim.polarity === "negative" && <Badge tone="warning">부정</Badge>}
    </div>
    {claim.quote ? <blockquote className="kb3-quote">{claim.quote}</blockquote> : <p className="kb-note">접근할 수 있는 원문 인용이 없어요.</p>}
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>문서</dt><dd><button type="button" className="kb3-linkbtn" onClick={() => openDocument(claim.document_id, claim.revision_id)}>{claim.document_title ?? "문서 열기"}</button></dd></div>
      {claim.rev_no != null && <div className="kb-facts__row"><dt>버전</dt><dd>{claim.rev_no}</dd></div>}
      <div className="kb-facts__row"><dt>발행일</dt><dd>{claim.published_at ? formatTime(claim.published_at) : "알 수 없음"}</dd></div>
    </dl>
  </section>;
}

function EntityCard({ side, entity }: { side: "A" | "B"; entity: KbConflictEntity }) {
  return <section className="kb3-claimcard" aria-label={`개념 ${side}`}>
    <p className="kb3-claimcard__side">{side}</p>
    <p className="kb3-claimcard__text">{entity.name}</p>
    <div className="kb-badges"><Badge tone="info">{kindLabel(entity.entity_kind)}</Badge>{entity.domain && <Badge>{domainLabel(entity.domain)}</Badge>}{entity.document_count !== undefined && <Badge>{`문서 ${entity.document_count}`}</Badge>}</div>
  </section>;
}

/** 해결된 충돌의 결과 표시. 상태 이름만으로 "양쪽이 옳다"고 읽히지 않도록 누가 어떻게 닫았는지를 같이 보여 준다. */
function Outcome({ conflict }: { conflict: KbConflict }) {
  const st = conflictStatusText(conflict);
  const system = isSystemResolution(conflict.resolved_by);
  return <div className="kb3-outcome">
    <div className="kb-badges"><Badge tone={st.tone}>{st.label}</Badge>{system && <Badge mono>자동 종결</Badge>}</div>
    {st.detail && <p className="kb-note">{st.detail}</p>}
    {!system && conflict.note && <p className="kb-note">메모: {conflict.note}</p>}
    {conflict.resolved_at && <p className="kb-note">{formatTime(conflict.resolved_at)}{system ? "" : conflict.resolved_by ? ` · ${conflict.resolved_by === "user" ? "직접 판단" : conflict.resolved_by}` : ""}</p>}
  </div>;
}

function ConflictItem({ conflict, openDocument, onDone }: {
  conflict: KbConflict; openDocument: (documentId: string, revisionId?: string) => void;
  onDone: (conflict: KbConflict, outcome: KbConflict, canonical: string | null) => void;
}) {
  const cache = useQueryClient();
  const [pending, setPending] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const isEntity = conflict.kind === "ambiguous_entity";
  const isOpen = conflict.status === "open";
  const choices = isEntity ? ENTITY_CHOICES : CLAIM_CHOICES;
  const resolve = useMutation({
    mutationFn: (choice: Choice) => kbResolveConflict(conflict.id, choice.resolution, note),
    onSuccess: async (out, choice) => {
      const canon = out.canonical ? (out.canonical.summary || out.canonical.key_facts.join(" · ") || null) : null;
      onDone(conflict, out.conflict ?? { ...conflict, status: out.status ?? choice.resolution, resolved_by: "user" }, canon);
      await Promise.all(["kb-conflicts", "kb-summary", "kb-graph", "kb-entity", "kb-search", "kb-document"].map((k) => cache.invalidateQueries({ queryKey: [k] })));
    },
  });
  const comparable = isEntity ? Boolean(conflict.entity_a && conflict.entity_b) : Boolean(conflict.claim_a && conflict.claim_b);
  return <li className="kb3-conflict" data-status={conflict.status} aria-label={conflict.entity_name ? `${conflict.entity_name} ${CONFLICT_KIND_TEXT[conflict.kind] ?? conflict.kind}` : (CONFLICT_KIND_TEXT[conflict.kind] ?? conflict.kind)}>
    <div className="kb3-conflict__head">
      <Badge tone="warning">{CONFLICT_KIND_TEXT[conflict.kind] ?? conflict.kind}</Badge>
      {conflict.entity_name && <span className="kb3-conflict__entity">{conflict.entity_name}</span>}
      {conflict.predicate && <span className="tk-badge kb3-tag">{conflict.predicate}</span>}
      {conflict.created_at && <span className="kb-note">{formatTime(conflict.created_at)}</span>}
    </div>
    {!isOpen && <Outcome conflict={conflict} />}
    {isOpen && conflict.note && <p className="kb-note">서버 메모: {conflict.note}</p>}
    {comparable
      ? <div className="kb3-compare">
        {isEntity ? <><EntityCard side="A" entity={conflict.entity_a!} /><EntityCard side="B" entity={conflict.entity_b!} /></>
          : <><ClaimCard side="A" claim={conflict.claim_a!} openDocument={openDocument} /><ClaimCard side="B" claim={conflict.claim_b!} openDocument={openDocument} /></>}
      </div>
      : <p className="tk-error" role="alert">서버가 비교할 두 쪽을 모두 주지 않았어요(접근할 수 없거나 사라진 주장일 수 있어요). {isOpen ? "이 충돌은 여기서 해결할 수 없어요." : ""}</p>}
    {isOpen && comparable && !pending && <div className="kb-actions">
      {choices.map((c) => <Button key={c.resolution} size="sm" variant={c.ghost ? "ghost" : "primary"} onClick={() => setPending(c)}>{c.label}</Button>)}
    </div>}
    {pending && <div className="kb-callout" role="group" aria-label="해결 확인">
      <p><strong>{pending.label}</strong></p>
      <p className="kb-note">{pending.effect}</p>
      <label className="kb-field"><span>메모 (선택)</span><input className="tk-input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="판단 근거를 남겨 두면 나중에 확인할 수 있어요" /></label>
      <div className="kb-actions">
        <Button size="sm" variant="primary" busy={resolve.isPending} onClick={() => resolve.mutate(pending)}>확정</Button>
        <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => { setPending(null); resolve.reset(); }}>취소</Button>
      </div>
    </div>}
    {resolve.isError && <p className="tk-error" role="alert">{failure(resolve.error)}</p>}
  </li>;
}

/** 서버가 summary 로 주는 값만 보여 준다. 주지 않는 진단은 추정하지 않고 "서버 미지원"으로 둔다. */
function Quality({ summary }: { summary: KbSummaryV3 | undefined }) {
  const v3 = summary?.v3;
  const r = summary?.retrieval;
  const cov = v3?.embedding_coverage ?? (r ? { indexed: r.indexed, total: r.total, ratio: r.total > 0 ? r.indexed / r.total : null } : undefined);
  const unsupported = <Badge tone="warning">서버 미지원</Badge>;
  const n = (v: number) => v.toLocaleString("ko-KR");
  return <section className="kb3-panel" aria-label="품질 진단">
    <h2 className="kb3-panel__title">품질 진단</h2>
    <ul className="kb3-quality">
      <li><span>임베딩 색인 범위</span>{cov
        ? <span>{r?.enabled === false ? "의미 검색이 꺼져 있어요 · " : ""}{cov.ratio === null ? "패시지 없음" : `${Math.round(cov.ratio * 100)}% (${n(cov.indexed)} / ${n(cov.total)})`}{r?.last_error ? " · 일부 처리 오류 있음" : ""}</span> : unsupported}</li>
      <li><span>통짜 패시지로만 들어간 긴 문서(목표 0건)</span>{v3 ? <Badge tone={v3.single_passage_documents === 0 ? "success" : "warning"}>{`${n(v3.single_passage_documents)}건`}</Badge> : unsupported}</li>
      <li><span>처리 기록이 없는 문서(백필 대상)</span>{v3 ? <Badge tone={v3.documents_without_pipeline_job === 0 ? "success" : "warning"}>{`${n(v3.documents_without_pipeline_job)}건`}</Badge> : unsupported}</li>
      <li><span>관계 확정 / 후보</span>{v3 ? <span>{n(v3.relations_active)}개 / {n(v3.relations_candidate)}개</span> : unsupported}</li>
      <li><span>근거 해시 무결성 일괄 검증</span>{unsupported}</li>
      <li><span>검색 평가 요약(E0·v3)</span>{unsupported}</li>
    </ul>
    <p className="kb-note">서버 미지원 항목은 백엔드가 진단 API 를 제공하면 채워져요. 숫자를 추정해서 보여 주지 않아요. 개별 근거의 해시 일치는 원문 위치 보기에서 확인할 수 있어요.</p>
  </section>;
}

export function ConflictsQualityTab({ summary, entityId, status, setStatus, clearEntity, openDocument }: {
  summary: KbSummaryV3 | undefined; entityId: string; status: "open" | "all"; setStatus: (s: "open" | "all") => void;
  clearEntity: () => void; openDocument: (documentId: string, revisionId?: string) => void;
}) {
  const [kind, setKind] = useState<"" | KbConflictKind>("");
  const [done, setDone] = useState<{ id: string; title: string; outcome: KbConflict; canonical: string | null }[]>([]);
  const q = useInfiniteQuery({
    queryKey: ["kb-conflicts", status, kind, entityId || undefined],
    queryFn: ({ pageParam }) => kbConflicts({ status, kind: kind || undefined, entity_id: entityId || undefined, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => ((last.offset ?? 0) + last.items.length < last.total ? (last.offset ?? 0) + (last.limit ?? PAGE) : undefined),
  });
  const all = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  // 서버 /conflicts 에 entity_id 를 보내고, 목업이나 구형 서버가 전체를 돌려준 경우에도 클라이언트에서 한 번 더 거른다.
  const items = entityId ? all.filter((c) => c.entity_id === entityId || c.entity_a?.id === entityId || c.entity_b?.id === entityId) : all;
  const entityLabel = items[0]?.entity_name;
  return <div className="kb3-conflicts">
    <section className="kb3-panel" aria-label="충돌">
      <h2 className="kb3-panel__title">충돌과 모호한 개념</h2>
      <div className="kb-revisions" role="group" aria-label="충돌 상태">
        {STATUS_FILTERS.map((f) => <button key={f.id} type="button" className="kb-chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>{f.label}</button>)}
      </div>
      <div className="kb-revisions" role="group" aria-label="충돌 종류">
        {KIND_FILTERS.map((f) => <button key={f.id} type="button" className="kb-chip" aria-pressed={kind === f.id} onClick={() => setKind(f.id)}>{f.label}</button>)}
      </div>
      {entityId && <p className="kb-note">{entityLabel ? `“${entityLabel}” 개념의 충돌만 보고 있어요.` : "선택한 개념의 충돌만 보고 있어요."} <button type="button" className="kb3-linkbtn" onClick={clearEntity}>전체 보기</button></p>}
      {done.length > 0 && <ul className="kb3-done" aria-label="방금 해결한 충돌">{done.map((d) => <li key={d.id} className="kb-callout" role="status">
        <p>{d.title}: {conflictStatusText(d.outcome).label}</p>{d.canonical && <p className="kb-note">갱신된 정본: {d.canonical}</p>}</li>)}</ul>}
      {q.isPending && <p className="kb-note" role="status">충돌 목록을 읽는 중</p>}
      {q.isError && !q.data && <div className="kb-error">
        <p className={isKbUnsupported(q.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(q.error) ? "status" : "alert"}>{failure(q.error)}</p>
        {!isKbUnsupported(q.error) && <Button variant="ghost" onClick={() => void q.refetch()}>다시 시도</Button>}
      </div>}
      {q.data && items.length === 0 && <div className="kb-empty">
        <p>{entityId ? "이 개념에 해당하는 충돌이 없어요." : status === "open" ? "열린 충돌이 없어요." : "충돌이 없어요."}</p>
        <p className="kb-note">문서끼리 다른 값을 말하거나 같은 이름의 개념이 애매하면 여기에 올라와요.</p>
      </div>}
      {items.length > 0 && <>
        <p className="kb-note" role="status">{all.length !== items.length ? `불러온 ${all.length}건 중 ${items.length}건` : `${total.toLocaleString("ko-KR")}건 중 ${items.length.toLocaleString("ko-KR")}건`}</p>
        <ul className="kb3-conflictlist" aria-label="충돌 목록">{items.map((c) => <ConflictItem key={c.id} conflict={c} openDocument={openDocument}
          onDone={(cf, outcome, canonical) => setDone((prev) => [{ id: cf.id, title: cf.entity_name ?? CONFLICT_KIND_TEXT[cf.kind] ?? cf.kind, outcome, canonical }, ...prev])} />)}</ul>
      </>}
      {q.hasNextPage && <Button variant="ghost" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>충돌 더 보기</Button>}
      {q.isError && q.data && <p className="tk-error" role="alert">{failure(q.error)}</p>}
    </section>
    <Quality summary={summary} />
  </div>;
}
