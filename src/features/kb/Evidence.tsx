import { useKbScope } from "./scope";
import { useQuery } from "@tanstack/react-query";
import { kbEvidence } from "../../api/client";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { KIND_LABEL, failure, formatTime, shortHash } from "./labels";

/** 패시지가 원문(정규화 본문)의 어디에 있는지와 해시 검증 결과. 저장 본문 슬라이스 일치만 뜻하며 내용이 사실이라는 확인은 아니다. */
export function EvidencePanel({ passageId }: { passageId: string }) {
  const scope = useKbScope();
  const q = useQuery({ queryKey: ["kb-evidence", scope, passageId], queryFn: () => scope === "work" ? kbEvidence(passageId, scope) : kbEvidence(passageId) });
  if (q.isPending) return <p className="kb-note" role="status">원문 위치를 읽는 중</p>;
  if (q.isError) {
    return <div className="kb-error"><p className="tk-error" role="alert">{failure(q.error)}</p><Button variant="ghost" size="sm" onClick={() => void q.refetch()}>다시 시도</Button></div>;
  }
  const ev = q.data;
  const { span, source } = ev;
  return <section className="kb-evidence" aria-label="원문 위치">
    <div className="kb-badges">
      <Badge tone={span.hash_verified ? "success" : "danger"}>{span.hash_verified ? "해시 일치" : "해시 불일치"}</Badge>
      <Badge>{`버전 ${ev.revision.rev_no}`}</Badge>
      <Badge>{`문자 ${span.revision_start.toLocaleString("ko-KR")}–${span.revision_end.toLocaleString("ko-KR")}`}</Badge>
      <Badge>{span.line_start === span.line_end ? `${span.line_start}줄` : `${span.line_start}–${span.line_end}줄`}</Badge>
    </div>
    <blockquote className="kb-context" aria-label="앞뒤 문맥을 포함한 원문">
      {ev.before && <span className="kb-context__side">{ev.before}</span>}
      <mark className="kb-mark">{ev.quote}</mark>
      {ev.after && <span className="kb-context__side">{ev.after}</span>}
    </blockquote>
    <dl className="kb-facts">
      <div className="kb-facts__row"><dt>문서</dt><dd>{ev.document.title}</dd></div>
      {source && <>
        <div className="kb-facts__row"><dt>출처</dt><dd>{KIND_LABEL[source.kind] ?? source.kind} · {source.locator ?? source.source_key}</dd></div>
        <div className="kb-facts__row"><dt>수집 시각</dt><dd>{formatTime(source.collected_at)}</dd></div>
        <div className="kb-facts__row"><dt>원본 SHA-256</dt><dd className="kb-hash" title={source.sha256}>{shortHash(source.sha256)}…</dd></div>
      </>}
      <div className="kb-facts__row"><dt>구간 SHA-256</dt><dd className="kb-hash" title={span.sha256}>{shortHash(span.sha256)}…</dd></div>
    </dl>
    <p className="kb-note">해시는 저장된 본문 구간이 바뀌지 않았다는 확인이에요. 내용이 사실인지 확인한 것은 아니에요.</p>
  </section>;
}
