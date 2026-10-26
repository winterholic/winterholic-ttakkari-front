import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { collectHoldAudit, collectItemDetail, collectReviewQueue, reprocessCollectItem } from "../../api/collector";
import type { KbScope, ReviewItem } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { COLLECT_REASON, failure, formatChars, shortHash } from "../kb/labels";
import { ItemReview } from "../kb/Quality";
import { STATUS } from "../kb/Collection";

function Detail({ id, scope }: { id: string; scope?: KbScope }) {
  const detail = useQuery({ queryKey: ["kb-collect-item", scope, id], queryFn: () => collectItemDetail(id, scope) });
  if (detail.isPending) return <p role="status">자료 정보를 읽는 중</p>;
  if (detail.isError) return <p className="tk-error" role="alert">{failure(detail.error)}</p>;
  const d = detail.data;
  return <dl className="kb-facts">
    <div className="kb-facts__row"><dt>가져온 주소</dt><dd className="kb-hash">{d.final_url || d.url}</dd></div>
    <div className="kb-facts__row"><dt>판정</dt><dd>{d.decision ? `${d.decision.state} · ${d.decision.reason_codes.map((r) => COLLECT_REASON[r] || r).join(", ")}` : "-"}</dd></div>
    <div className="kb-facts__row"><dt>품질 점수</dt><dd>측정하지 않음. 규칙 검사만 했어요.</dd></div>
    <div className="kb-facts__row"><dt>권리</dt><dd>{d.rights.license_id || "-"} · {(d.rights.purposes || []).join(", ") || "-"}</dd></div>
    <div className="kb-facts__row"><dt>원문 해시</dt><dd className="kb-hash">{d.hashes.raw_sha256 ? shortHash(d.hashes.raw_sha256) : "-"}</dd></div>
    <div className="kb-facts__row"><dt>본문 해시</dt><dd className="kb-hash">{d.hashes.text_sha256 ? shortHash(d.hashes.text_sha256) : "-"}</dd></div>
    <div className="kb-facts__row"><dt>처리 버전</dt><dd>{d.versions.parser || "-"} / {d.versions.normalizer || "-"}</dd></div>
    <div className="kb-facts__row"><dt>검토 이력</dt><dd>{d.reviews.length ? d.reviews.map((r) => `${r.decision}${r.current ? "" : "(이전 본문)"}`).join(", ") : "없음"}</dd></div>
    <div className="kb-facts__row"><dt>전달</dt><dd>{d.deliveries.length ? d.deliveries.map((x) => `${x.sink}:${x.outcome || x.status}`).join(", ") : "없음"}</dd></div>
  </dl>;
}

function Row({ item, scope }: { item: ReviewItem; scope?: KbScope }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const reprocess = useMutation({
    mutationFn: () => reprocessCollectItem(item.id, scope),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["kb-collect-review", scope] }),
        queryClient.invalidateQueries({ queryKey: ["kb-collect-audit", scope] }),
        queryClient.invalidateQueries({ queryKey: ["kb-collect-jobs", scope] }),
        queryClient.invalidateQueries({ queryKey: ["kb-collect-summary", scope] }),
      ]);
    },
  });
  return <li className="kb-hit">
    <p className="kb-hash">{item.url}</p>
    <div className="kb-badges"><Badge>{STATUS[item.status] || item.status}</Badge>{item.language && <Badge>{item.language}</Badge>}{item.text_chars != null && <Badge>{formatChars(item.text_chars)}</Badge>}</div>
    {item.reason_codes.length > 0 && <p className="kb-note">{item.reason_codes.map((r) => COLLECT_REASON[r] || r).join(" · ")}</p>}
    {item.preview && <p className="kb-passage__body collect-clamp">{item.preview}</p>}
    {item.status === "held" && item.can_reprocess && <div className="kb-actions">
      <Button size="sm" variant="ghost" busy={reprocess.isPending} onClick={() => reprocess.mutate()}>
        원문으로 다시 처리
      </Button>
      {reprocess.isSuccess && <span className="kb-note" role="status">재처리 작업을 등록했어요. 실행 탭에서 진행 상태를 볼 수 있어요.</span>}
      {reprocess.isError && <span className="tk-error" role="alert">재처리 작업을 등록하지 못했어요: {failure(reprocess.error)}</span>}
    </div>}
    <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "자세히 닫기" : "근거와 처리 이력"}</Button>
    {open && <Detail id={item.id} scope={scope} />}
    <ItemReview id={item.id} scope={scope} />
  </li>;
}

function Audit({ scope }: { scope?: KbScope }) {
  const audit = useQuery({ queryKey: ["kb-collect-audit", scope], queryFn: () => collectHoldAudit(scope) });
  if (audit.isPending) return <p role="status">표본을 고르는 중</p>;
  if (audit.isError) return <div className="kb-error"><p className="tk-error" role="alert">{failure(audit.error)}</p><Button onClick={() => void audit.refetch()}>다시 시도</Button></div>;
  const { groups, items } = audit.data;
  return <section className="kb-results" aria-label="보류 표본 감사">
    <h2>보류 표본 감사</h2>
    <p className="kb-note">보류된 자료를 출처와 사유별로 나눠 하루 단위로 고정된 표본을 보여 줘요. 잘못 걸러진 자료가 없는지 확인하고 유용하면 적재해 주세요.</p>
    {groups.length === 0 && <p className="kb-empty">보류된 자료가 없어요.</p>}
    <ul className="kb-passages">{groups.map((g) => <li className="kb-passage" key={`${g.source_key}:${g.reason}`}>
      <p className="kb-hash">{g.source_key}</p><p className="kb-note">{COLLECT_REASON[g.reason] || g.reason} · 보류 {g.held}건 중 {g.sampled}건 표본</p></li>)}</ul>
    <ul className="kb-hits">{items.map((item) => <Row key={item.id} item={item} scope={scope} />)}</ul>
  </section>;
}

export function Review({ scope }: { scope?: KbScope } = {}) {
  const [sample, setSample] = useState(false);
  const query = useInfiniteQuery({ queryKey: ["kb-collect-review", scope], initialPageParam: 0,
    queryFn: ({ pageParam }) => collectReviewQueue(scope, pageParam),
    getNextPageParam: (p) => p.offset + p.items.length < p.total ? p.offset + p.limit : undefined });
  if (sample) return <><Button size="sm" variant="ghost" onClick={() => setSample(false)}>검토 대기 목록으로</Button><Audit scope={scope} /></>;
  if (query.isPending) return <p role="status">검토 대기 자료를 읽는 중</p>;
  if (query.isError && !query.data) return <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button onClick={() => void query.refetch()}>다시 시도</Button></div>;
  const total = query.data.pages[0]?.total ?? 0;
  const rows = query.data.pages.flatMap((p) => p.items);
  return <section className="kb-results" aria-label="검토 대기">
    <div className="kb-actions"><h2>검토 대기 {total.toLocaleString("ko-KR")}건</h2><Button size="sm" variant="ghost" onClick={() => setSample(true)}>보류 표본 감사</Button></div>
    <p className="kb-note">보류됐거나, 자동 적재가 꺼진 출처에서 통과한 자료예요. 원문을 보고 유용하면 도서관에 적재할 수 있어요. 검토는 유용성만 뜻하고 사실 확인이 아니에요.</p>
    {rows.length === 0 && <p className="kb-empty">검토할 자료가 없어요.</p>}
    <ul className="kb-hits">{rows.map((item) => <Row key={item.id} item={item} scope={scope} />)}</ul>
    {query.isError && <p className="tk-error" role="alert">{failure(query.error)}</p>}
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>더 보기</Button>}
  </section>;
}
