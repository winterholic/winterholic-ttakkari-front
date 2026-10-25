import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isKbUnsupported, kbConflicts, kbResolveConflict } from "../../api/kb";
import type { KbConflict, KbConflictClaim, KbConflictEntity, KbConflictKind, KbResolution, KbSummaryV3 } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { failure, formatTime } from "./labels";
import { kindLabel } from "./labelsV3";

const KIND_FILTERS: { id: "" | KbConflictKind; label: string }[] = [
  { id: "", label: "전체" }, { id: "value_contradiction", label: "값이 다른 주장" }, { id: "polarity_contradiction", label: "서로 반대되는 주장" }, { id: "ambiguous_entity", label: "모호한 개념" },
];
const KIND_TEXT: Record<KbConflictKind, string> = {
  value_contradiction: "값이 다른 주장", polarity_contradiction: "서로 반대되는 주장", ambiguous_entity: "같은 개념인지 불확실",
};

interface Choice { resolution: KbResolution; label: string; effect: string; ghost?: boolean }
const CLAIM_CHOICES: Choice[] = [
  { resolution: "resolved_a", label: "A를 정본으로 채택", effect: "A 주장이 정본이 되고 B는 다툼 상태로 남아요." },
  { resolution: "resolved_b", label: "B를 정본으로 채택", effect: "B 주장이 정본이 되고 A는 다툼 상태로 남아요." },
  { resolution: "resolved_both_valid", label: "적용 버전 차이로 둘 다 보존", effect: "두 주장 모두 유효하다고 기록해요. 정본 요약에 둘 다 반영돼요.", ghost: true },
];
const ENTITY_CHOICES: Choice[] = [
  { resolution: "merged", label: "하나의 개념으로 병합", effect: "두 개념의 별칭·주장·문서가 하나로 합쳐져요. 되돌리기 어려울 수 있어요." },
  { resolution: "kept_separate", label: "서로 다른 개념으로 분리 확정", effect: "앞으로 자동으로 다시 병합 후보에 올리지 않아요.", ghost: true },
];

function ClaimCard({ side, claim, openDocument }: { side: "A" | "B"; claim: KbConflictClaim; openDocument: (documentId: string, revisionId?: string) => void }) {
  return <section className="kb3-claimcard" aria-label={`주장 ${side}`}>
    <p className="kb3-claimcard__side">{side}</p>
    <p className="kb3-claimcard__text">{claim.text}</p>
    <blockquote className="kb3-quote">{claim.quote}</blockquote>
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>문서</dt><dd><button type="button" className="kb3-linkbtn" onClick={() => openDocument(claim.document_id, claim.revision_id)}>{claim.document_title}</button></dd></div>
      {claim.rev_no !== undefined && <div className="kb-facts__row"><dt>버전</dt><dd>{claim.rev_no}</dd></div>}
      <div className="kb-facts__row"><dt>발행일</dt><dd>{claim.published_at ? formatTime(claim.published_at) : "알 수 없음"}</dd></div>
    </dl>
  </section>;
}

function EntityCard({ side, entity }: { side: "A" | "B"; entity: KbConflictEntity }) {
  return <section className="kb3-claimcard" aria-label={`개념 ${side}`}>
    <p className="kb3-claimcard__side">{side}</p>
    <p className="kb3-claimcard__text">{entity.name}</p>
    <div className="kb-badges"><Badge tone="info">{kindLabel(entity.entity_kind)}</Badge>{entity.domain && <Badge>{entity.domain}</Badge>}{entity.document_count !== undefined && <Badge>{`문서 ${entity.document_count}`}</Badge>}</div>
  </section>;
}

function ConflictItem({ conflict, openDocument, onDone }: {
  conflict: KbConflict; openDocument: (documentId: string, revisionId?: string) => void;
  onDone: (conflict: KbConflict, choice: Choice, canonical: string | null) => void;
}) {
  const cache = useQueryClient();
  const [pending, setPending] = useState<Choice | null>(null);
  const [note, setNote] = useState("");
  const isEntity = conflict.kind === "ambiguous_entity";
  const choices = isEntity ? ENTITY_CHOICES : CLAIM_CHOICES;
  const resolve = useMutation({
    mutationFn: (choice: Choice) => kbResolveConflict(conflict.id, choice.resolution, note),
    onSuccess: async (out, choice) => {
      onDone(conflict, choice, out.canonical?.summary ?? null);
      await Promise.all(["kb-conflicts", "kb-summary", "kb-graph", "kb-entity", "kb-search", "kb-document"].map((k) => cache.invalidateQueries({ queryKey: [k] })));
    },
  });
  const comparable = isEntity ? Boolean(conflict.entity_a && conflict.entity_b) : Boolean(conflict.claim_a && conflict.claim_b);
  return <li className="kb3-conflict" aria-label={conflict.entity_name ? `${conflict.entity_name} ${KIND_TEXT[conflict.kind]}` : KIND_TEXT[conflict.kind]}>
    <div className="kb3-conflict__head">
      <Badge tone="warning">{KIND_TEXT[conflict.kind] ?? conflict.kind}</Badge>
      {conflict.entity_name && <span className="kb3-conflict__entity">{conflict.entity_name}</span>}
      {conflict.created_at && <span className="kb-note">{formatTime(conflict.created_at)}</span>}
    </div>
    {comparable
      ? <div className="kb3-compare">
        {isEntity ? <><EntityCard side="A" entity={conflict.entity_a!} /><EntityCard side="B" entity={conflict.entity_b!} /></>
          : <><ClaimCard side="A" claim={conflict.claim_a!} openDocument={openDocument} /><ClaimCard side="B" claim={conflict.claim_b!} openDocument={openDocument} /></>}
      </div>
      : <p className="tk-error" role="alert">서버가 비교할 두 쪽을 모두 주지 않았어요. 이 충돌은 해결할 수 없어요.</p>}
    {comparable && !pending && <div className="kb-actions">
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

function Quality({ summary }: { summary: KbSummaryV3 | undefined }) {
  const r = summary?.retrieval;
  const pct = r && r.total > 0 ? Math.round((r.indexed / r.total) * 100) : null;
  const unsupported = <Badge tone="warning">서버 미지원</Badge>;
  return <section className="kb3-panel" aria-label="품질 진단">
    <h2 className="kb3-panel__title">품질 진단</h2>
    <ul className="kb3-quality">
      <li><span>임베딩 색인 범위</span>{r ? <span>{pct === null ? "패시지 없음" : `${pct}% (${r.indexed.toLocaleString("ko-KR")} / ${r.total.toLocaleString("ko-KR")})`}{r.last_error ? " · 일부 처리 오류 있음" : ""}</span> : unsupported}</li>
      <li><span>통짜 패시지 잔존(목표 0건)</span>{unsupported}</li>
      <li><span>근거 해시 무결성 검증</span>{unsupported}</li>
      <li><span>검색 평가 요약(E0·v3)</span>{unsupported}</li>
    </ul>
    <p className="kb-note">서버 미지원 항목은 백엔드가 진단 API 를 제공하면 채워져요. 숫자를 추정해서 보여 주지 않아요.</p>
  </section>;
}

export function ConflictsQualityTab({ summary, entityId, clearEntity, openDocument }: {
  summary: KbSummaryV3 | undefined; entityId: string; clearEntity: () => void; openDocument: (documentId: string, revisionId?: string) => void;
}) {
  const [kind, setKind] = useState<"" | KbConflictKind>("");
  const [done, setDone] = useState<{ id: string; title: string; label: string; canonical: string | null }[]>([]);
  const q = useQuery({ queryKey: ["kb-conflicts", "open", kind], queryFn: () => kbConflicts({ status: "open", kind: kind || undefined }) });
  const all = q.data?.items ?? [];
  const items = entityId ? all.filter((c) => c.entity_id === entityId) : all;
  return <div className="kb3-conflicts">
    <section className="kb3-panel" aria-label="열린 충돌">
      <h2 className="kb3-panel__title">열린 충돌과 모호한 개념</h2>
      <div className="kb-revisions" role="group" aria-label="충돌 종류">
        {KIND_FILTERS.map((f) => <button key={f.id} type="button" className="kb-chip" aria-pressed={kind === f.id} onClick={() => setKind(f.id)}>{f.label}</button>)}
      </div>
      {entityId && <p className="kb-note">한 개념의 충돌만 보고 있어요. <button type="button" className="kb3-linkbtn" onClick={clearEntity}>전체 보기</button></p>}
      {done.length > 0 && <ul className="kb3-done" aria-label="방금 해결한 충돌">{done.map((d) => <li key={d.id} className="kb-callout" role="status">
        <p>{d.title}: {d.label} 처리를 마쳤어요.</p>{d.canonical && <p className="kb-note">갱신된 정본 요약: {d.canonical}</p>}</li>)}</ul>}
      {q.isPending && <p className="kb-note" role="status">충돌 목록을 읽는 중</p>}
      {q.isError && <div className="kb-error">
        <p className={isKbUnsupported(q.error) ? "kb-note" : "tk-error"} role={isKbUnsupported(q.error) ? "status" : "alert"}>{failure(q.error)}</p>
        {!isKbUnsupported(q.error) && <Button variant="ghost" onClick={() => void q.refetch()}>다시 시도</Button>}
      </div>}
      {q.data && items.length === 0 && <div className="kb-empty"><p>{entityId ? "이 개념에는 열린 충돌이 없어요." : "열린 충돌이 없어요."}</p><p className="kb-note">문서끼리 다른 값을 말하거나 같은 이름의 개념이 애매하면 여기에 올라와요.</p></div>}
      {items.length > 0 && <ul className="kb3-conflictlist" aria-label="충돌 목록">{items.map((c) => <ConflictItem key={c.id} conflict={c} openDocument={openDocument}
        onDone={(cf, choice, canonical) => setDone((prev) => [{ id: cf.id, title: cf.entity_name ?? KIND_TEXT[cf.kind], label: choice.label, canonical }, ...prev])} />)}</ul>}
    </section>
    <Quality summary={summary} />
  </div>;
}
