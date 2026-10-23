import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { collectDeliveries, reconcileCollectDelivery } from "../../api/collector";
import type { CollectDelivery, KbScope } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { failure, formatTime } from "../kb/labels";

const STATE: Record<string, string> = { pending: "전달 대기", delivered: "전달됨", failed: "실패", delivery_unknown: "결과 확인 필요" };
const OUTCOME: Record<string, string> = { imported: "도서관 적재", exported: "내보내기 준비", failed: "권리·무결성 검사 실패" };
const RECONCILE: Record<string, string> = {
  consistent: "기록이 서로 맞아요.", inconsistent: "기록이 맞지 않아요. 로그를 확인해 주세요.", reopened: "다시 전달하도록 열었어요.",
  pending: "아직 전달 대기 중이에요.", terminal: "권리나 무결성 문제로 끝난 전달이에요. 출처를 고친 뒤 다시 수집해 주세요.",
};

function Row({ row, scope }: { row: CollectDelivery; scope: KbScope }) {
  const cache = useQueryClient();
  const fix = useMutation({ mutationFn: () => reconcileCollectDelivery(row.outbox_id, scope),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["kb-collect-deliveries", scope] }) });
  return <li className="kb-hit">
    <div className="kb-badges"><Badge>{STATE[row.status] || row.status}</Badge>{row.outcome && <Badge>{OUTCOME[row.outcome] || row.outcome}</Badge>}<Badge>{row.sink === "knowledge" ? "도서관" : "내보내기"}</Badge></div>
    <p className="kb-note">{formatTime(row.delivered_at || row.created_at)}{row.attempts > 0 ? ` · 시도 ${row.attempts}회` : ""}{row.not_before ? ` · ${formatTime(row.not_before)} 이후 재시도` : ""}</p>
    {row.last_error && <p className="tk-error">{row.last_error}</p>}
    {row.status !== "delivered" && <Button size="sm" variant="ghost" busy={fix.isPending} onClick={() => fix.mutate()}>상태 점검</Button>}
    {fix.isSuccess && <p role="status" className="kb-note">{RECONCILE[fix.data.state] || fix.data.state}</p>}
    {fix.isError && <p role="alert" className="tk-error">{failure(fix.error)}</p>}
  </li>;
}

export function Deliveries({ scope }: { scope: KbScope }) {
  const [status, setStatus] = useState("all");
  const query = useInfiniteQuery({ queryKey: ["kb-collect-deliveries", scope, status], initialPageParam: 0, refetchInterval: 15000,
    queryFn: ({ pageParam }) => collectDeliveries(scope, status === "all" ? undefined : status, pageParam),
    getNextPageParam: (p) => p.offset + p.items.length < p.total ? p.offset + p.limit : undefined });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return <section className="kb-results" aria-label="전달 결과">
    <h2>전달 결과</h2>
    <div className="kb-field"><label id="deliveries-filter-label" htmlFor="deliveries-filter">상태</label>
      <Select id="deliveries-filter" labelledBy="deliveries-filter-label" value={status} onChange={setStatus}
        options={[{ value: "all", label: "전체" }, { value: "pending", label: "전달 대기" }, { value: "failed", label: "실패" }, { value: "delivered", label: "전달됨" }]} /></div>
    {query.isPending && <p role="status">전달 결과를 읽는 중</p>}
    {query.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(query.error)}</p><Button onClick={() => void query.refetch()}>다시 시도</Button></div>}
    {query.data && rows.length === 0 && <p className="kb-empty">표시할 전달 결과가 없어요.</p>}
    <ul className="kb-hits">{rows.map((row) => <Row key={row.outbox_id} row={row} scope={scope} />)}</ul>
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>더 보기</Button>}
  </section>;
}
