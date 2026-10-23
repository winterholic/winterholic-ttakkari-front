import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { collectQuality, importCollectItem, reviewCollectItem, trainCollectQuality } from "../../api/collector";
import type { KbScope } from "../../api/collector";
import { Button } from "../../ui/Button";
import { failure } from "./labels";

export function ItemReview({ id, scope }: { id: string; scope: KbScope }) {
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const review = useMutation({ mutationFn: (decision: "accept" | "reject" | "hold") => reviewCollectItem(id, scope, decision, reason),
    onSuccess: async (_, decision) => { setApproved(decision === "accept"); await cache.invalidateQueries({ queryKey: ["kb-collect-quality", scope] }); } });
  const accept = useMutation({ mutationFn: () => importCollectItem(id, scope) });
  return <div className="kb-results">
    <label className="kb-field">자료의 유용성 검토
      <input className="tk-input" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} placeholder="원문을 확인한 이유·판단을 적어 주세요." /></label>
    <div className="kb-actions">
      <Button size="sm" disabled={!reason.trim()} busy={review.isPending} onClick={() => review.mutate("accept")}>유용함</Button>
      <Button size="sm" disabled={!reason.trim()} busy={review.isPending} onClick={() => review.mutate("reject")}>유용하지 않음</Button>
      <Button size="sm" variant="ghost" disabled={!reason.trim()} busy={review.isPending} onClick={() => review.mutate("hold")}>판단 보류</Button>
    </div>
    {review.isSuccess && <p role="status" className="kb-note">유용성 검토를 기록했어요. 사실 확인이나 학습 허용을 뜻하지 않아요.</p>}
    {approved && <Button size="sm" busy={accept.isPending} disabled={accept.isSuccess} onClick={() => accept.mutate()}>검토한 자료 도서관에 적재</Button>}
    {accept.isSuccess && <p role="status" className="kb-note">적재 요청을 등록했어요. 작업 항목의 적재 결과를 확인해 주세요.</p>}
    {(review.isError || accept.isError) && <p role="alert" className="tk-error">{failure(review.error || accept.error)}</p>}
  </div>;
}

export function QualityPanel({ scope }: { scope: KbScope }) {
  const cache = useQueryClient();
  const status = useQuery({ queryKey: ["kb-collect-quality", scope], queryFn: () => collectQuality(scope) });
  const train = useMutation({ mutationFn: () => trainCollectQuality(scope),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["kb-collect-quality", scope] }) });
  if (status.isPending) return <p role="status">품질 검토 현황을 읽는 중</p>;
  if (status.isError) return <div className="kb-error"><p className="tk-error" role="alert">{failure(status.error)}</p><Button onClick={() => void status.refetch()}>다시 시도</Button></div>;
  const data = status.data;
  return <section className="kb-results" aria-label="품질 모델 관리">
    <h2>품질 검토와 학습</h2>
    <p className="kb-note">검토 {data.reviewed_items}건 · 유용함 {data.accepted}건 · 유용하지 않음 {data.rejected}건</p>
    <p className="kb-note">수집 이력에서 자료를 열어 유용성을 검토해 주세요. 학습 권리가 있는 자료 20건 이상과 서로 다른 출처 5곳 이상, 양쪽 판정이 있어야 모델을 만들 수 있어요.</p>
    <p className="kb-note">학습한 모델은 참고 점수만 남겨요. 문서를 자동 폐기하거나 내용을 사실로 확정하지 않아요.</p>
    {data.model ? <div className="kb-callout"><p>참고 모델 사용 중</p><p className="kb-note">학습 {data.model.metrics.train_count}건 / 출처를 분리한 개발 검증 {data.model.metrics.validation_count}건. 최종 품질 승인은 아직이에요.</p></div> : <p className="kb-empty">학습된 참고 모델이 없어요. 현재는 문서 길이·반복·중복 등의 규칙을 적용해요.</p>}
    <Button variant="primary" busy={train.isPending} disabled={data.reviewed_items < 20} onClick={() => train.mutate()}>검토 자료로 참고 모델 학습</Button>
    {train.isError && <p className="tk-error" role="alert">{failure(train.error)}</p>}
    {train.isSuccess && <p className="kb-note" role="status">참고 모델을 만들었어요. 다음 수집 작업부터 점수를 기록해요.</p>}
  </section>;
}
