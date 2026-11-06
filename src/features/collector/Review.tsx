import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { collectHoldAudit, collectItemDetail, collectReviewQueue, reprocessCollectItem } from "../../api/collector";
import type { KbScope, ReviewItem } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { COLLECT_REASON, failure, formatChars, shortHash } from "../kb/labels";
import { ItemReview } from "../kb/Quality";
import { STATUS } from "../kb/Collection";
import "./review-workspace.css";

const POLICY_REASON = /policy|rights|permission|permitted|license|licence|robots|blocked/i;
const DUPLICATE_REASON = /duplicate/i;
const PURPOSE_LABEL: Record<string, string> = { store: "원문 보관", knowledge: "도서관 활용", export: "내보내기", train: "모델 학습" };
const labelReason = (code: string) => COLLECT_REASON[code] ?? "사유 확인 필요";
const humanStatus = (status: string) => STATUS[status] ?? "상태 확인 필요";
const reviewDecision = (decision: string) => ({ accept: "유용함", reject: "유용하지 않음", hold: "판단 보류" }[decision] ?? "판정 확인 필요");
const isPolicyBlocked = (item: ReviewItem) => item.reason_codes.some(code => POLICY_REASON.test(code));
const canReprocessItem = (item: ReviewItem) => item.status === "held" && item.can_reprocess && !isPolicyBlocked(item);
const userFailure = (error: unknown) => {
  const message = failure(error);
  if (COLLECT_REASON[message] || STATUS[message]) return COLLECT_REASON[message] ?? STATUS[message];
  return /^[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*$/.test(message) ? "요청을 처리하지 못했어요. 잠시 뒤 다시 읽고 기술 상세를 확인해 주세요." : message;
};

function Detail({ id, scope }: { id: string; scope?: KbScope }) {
  const detail = useQuery({ queryKey: ["kb-collect-item", scope, id], queryFn: () => collectItemDetail(id, scope) });
  if (detail.isPending) return <p role="status">자료 정보를 읽는 중</p>;
  if (detail.isError) return <div><p className="tk-error" role="alert">{userFailure(detail.error)}</p><Button size="sm" onClick={() => void detail.refetch()}>자료 정보 다시 읽기</Button></div>;
  const d = detail.data;
  const qualityValues = Object.entries(d.quality ?? {});
  const qualityScores = qualityValues.map(([, value]) => value.score).filter((value): value is number => value != null);
  return <dl className="kb-facts">
    <div className="kb-facts__row"><dt>가져온 주소</dt><dd className="kb-hash">{d.final_url || d.url}</dd></div>
    <div className="kb-facts__row"><dt>판정</dt><dd>{d.decision ? `${reviewDecision(d.decision.state)} · ${d.decision.reason_codes.map(labelReason).join(", ") || "추가 사유 없음"}`
      : (d.status || d.reason_codes.length) ? `${humanStatus(d.status)} · ${d.reason_codes.map(labelReason).join(", ") || "추가 사유 없음"}` : "판정 정보 없음"}</dd></div>
    <div className="kb-facts__row"><dt>상세 품질 값</dt><dd>{qualityValues.length ? `평가 항목 ${qualityValues.length}개${qualityScores.length ? ` · 점수 ${qualityScores.join(", ")}` : " · 점수 미제공"} · 항목 의미와 불확실성 별도 제공 안 됨` : "품질 값 미제공 · 자동 평가 여부 미확인"}</dd></div>
    <div className="kb-facts__row"><dt>정밀 판정 실행 상태</dt><dd>엔진·모델·실행 상태 API 미제공 · 미확인</dd></div>
    <div className="kb-facts__row"><dt>권리</dt><dd>{d.rights.license_id || "라이선스 확인 안 됨"} · {(d.rights.purposes || []).map(purpose => PURPOSE_LABEL[purpose] ?? "허용 목적 확인 필요").join(", ") || "허용 목적 정보 없음"}</dd></div>
    <div className="kb-facts__row"><dt>원문 해시</dt><dd className="kb-hash">{d.hashes.raw_sha256 ? shortHash(d.hashes.raw_sha256) : "미제공"}</dd></div>
    <div className="kb-facts__row"><dt>본문 해시</dt><dd className="kb-hash">{d.hashes.text_sha256 ? shortHash(d.hashes.text_sha256) : "미제공"}</dd></div>
    <div className="kb-facts__row"><dt>처리 버전</dt><dd>{d.versions.parser || "-"} / {d.versions.normalizer || "-"}</dd></div>
    <div className="kb-facts__row"><dt>검토 이력</dt><dd>{d.reviews.length ? d.reviews.map(r => `${reviewDecision(r.decision)}${r.current ? "" : "(이전 본문)"}: ${r.reason || "사유 없음"}`).join(" · ") : "없음"}</dd></div>
    <div className="kb-facts__row"><dt>전달</dt><dd>{d.deliveries.length ? d.deliveries.map(x => `전달 상태: ${humanStatus(x.outcome || x.status)}`).join(" · ") : "없음"}</dd></div>
    <div className="kb-facts__row"><dt>기술 상세</dt><dd><details className="review-technical"><summary>원 코드·중복 근거·처리 이력 보기</summary>
      <pre>{JSON.stringify({ status: d.status, stage: d.stage, http_status: d.http_status, reason_codes: d.reason_codes,
        decision: d.decision, dedupe: d.dedupe ?? null, quality: d.quality, rights: d.rights, deliveries: d.deliveries }, null, 2)}</pre>
    </details></dd></div>
  </dl>;
}

function Row({ item, scope }: { item: ReviewItem; scope?: KbScope }) {
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const queryClient = useQueryClient();
  const policyBlocked = isPolicyBlocked(item);
  const reprocess = useMutation({
    mutationFn: () => reprocessCollectItem(item.id, scope),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["kb-collect-review", scope] }),
      queryClient.invalidateQueries({ queryKey: ["kb-collect-audit", scope] }),
      queryClient.invalidateQueries({ queryKey: ["kb-collect-jobs", scope] }),
      queryClient.invalidateQueries({ queryKey: ["kb-collect-summary", scope] }),
    ]),
  });
  const priority = policyBlocked ? "정책 확인 먼저" : item.reason_codes.some(code => DUPLICATE_REASON.test(code)) ? "중복 관계 확인" : item.status === "held" ? "보류 사유 확인" : "일반 검토";
  return <li className="kb-hit review-item">
    <div className="review-item__head"><p className="kb-hash">{item.url}</p><Badge>{priority}</Badge></div>
    <div className="kb-badges">{item.language && <Badge>{item.language === "ko" ? "한국어" : item.language === "en" ? "영어" : "언어 확인 필요"}</Badge>}{item.text_chars != null && <Badge>{formatChars(item.text_chars)}</Badge>}</div>
    <p className="review-item__meta"><span>출처 <strong>{item.source_key || "정보 없음"}</strong></span><span>상태 <strong>{humanStatus(item.status)}</strong></span></p>
    <p className="kb-note">사유: {item.reason_codes.length ? item.reason_codes.map(labelReason).join(" · ") : "제공되지 않음"}</p>
    {item.reason_codes.some(code => DUPLICATE_REASON.test(code)) && <p className="kb-note">중복 관계 대상: {item.dedupe?.exact_of ?? "미확인"} · 중복 근거는 기술 상세에서 확인</p>}
    {item.preview && <p className="kb-passage__body collect-clamp">{item.preview}</p>}
    {canReprocessItem(item) && <div className="kb-actions">
      <Button size="sm" variant="ghost" busy={reprocess.isPending} onClick={() => reprocess.mutate()}>원문으로 다시 처리</Button>
      {reprocess.isPending && <span className="kb-note" role="status">재처리 요청을 보내고 있어요.</span>}
      {reprocess.isSuccess && <span className="kb-note" role="status">재처리 작업을 등록했어요. 실행 탭에서 진행 상태를 볼 수 있어요.</span>}
      {reprocess.isError && <span className="tk-error" role="alert">재처리 작업을 등록하지 못했어요: {userFailure(reprocess.error)}</span>}
    </div>}
    {policyBlocked && <p className="kb-note">권리·정책·robots 차단 사유가 있어 재처리를 표시하지 않습니다. 정책 확인은 우회할 수 없어요.</p>}
    <div className="review-item__next-actions">
      <Button size="sm" aria-expanded={reviewOpen} onClick={() => setReviewOpen(!reviewOpen)}>{reviewOpen ? "판정·적재 검토 닫기" : "판정·적재 검토 열기"}</Button>
      <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "기술 상세 닫기" : "근거와 처리 이력"}</Button>
      <span className="kb-note">{canReprocessItem(item) ? "가능 조치: 원문 재처리" : policyBlocked ? "가능 조치: 정책 확인 후 결정" : "가능 조치: 판정 기록·기술 근거 확인"}</span>
    </div>
    {open && <Detail id={item.id} scope={scope} />}
    {reviewOpen && <div className="review-item__review"><ItemReview id={item.id} scope={scope} /></div>}
  </li>;
}

function Audit({ scope }: { scope?: KbScope }) {
  const audit = useQuery({ queryKey: ["kb-collect-audit", scope], queryFn: () => collectHoldAudit(scope) });
  if (audit.isPending) return <p role="status">출처·사유별 표본을 불러오는 중</p>;
  if (audit.isError) return <div className="kb-error"><p className="tk-error" role="alert">{userFailure(audit.error)}</p><Button onClick={() => void audit.refetch()}>다시 시도</Button></div>;
  const { groups, items, day, per_group } = audit.data;
  return <section className="kb-results" aria-label="보류 표본 감사">
    <h2>보류 표본 감사</h2>
    <p className="kb-note">하루 단위로 고정된 표본입니다. 각 출처와 사유별 보류 총량과 표본 크기를 함께 확인하세요. 표본 확인은 전체 품질 승인이 아니며 자동 통과·일괄 승인을 수행하지 않습니다.</p>
    <p className="kb-note">표본 날짜 {day || "응답에 날짜 없음"} · 그룹별 요청 표본 상한 {per_group ?? "미제공"}건</p>
    {groups.length === 0 && <p className="kb-empty">감사할 보류 그룹이 없어요.</p>}
    {groups.length > 0 && items.length === 0 && <p className="kb-empty">그룹별 총량은 받았지만 표본 자료는 응답에 없습니다.</p>}
    <ul className="kb-passages">{groups.map(g => <li className="kb-passage" key={`${g.source_key}:${g.reason}`}>
      <p className="kb-hash">출처 {g.source_key}</p><p className="kb-note">사유: {labelReason(g.reason)} · 보류 총량 {g.held.toLocaleString("ko-KR")}건 중 {g.sampled.toLocaleString("ko-KR")}건 표본</p>
      <details className="review-technical"><summary>기술 상세: 원 사유 코드</summary><code>{g.reason}</code></details>
    </li>)}</ul>
    <ul className="kb-hits">{items.map(item => <Row key={item.id} item={item} scope={scope} />)}</ul>
  </section>;
}

type FilterKey = "reason" | "source" | "action";
export function Review({ scope }: { scope?: KbScope } = {}) {
  const [sample, setSample] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ reason: "", source: "", action: "" });
  const query = useInfiniteQuery({ queryKey: ["kb-collect-review", scope], initialPageParam: 0,
    queryFn: ({ pageParam }) => collectReviewQueue(scope, pageParam),
    getNextPageParam: page => page.offset + page.items.length < page.total ? page.offset + page.items.length : undefined });
  const rows = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);
  const filtered = useMemo(() => rows.filter(item => {
    const needle = search.trim().toLocaleLowerCase();
    const matchesSearch = !needle || [item.url, item.source_key, item.preview].some(value => value.toLocaleLowerCase().includes(needle));
    const matchesReason = !filters.reason || item.reason_codes.includes(filters.reason);
    const matchesSource = !filters.source || item.source_key === filters.source;
    const matchesAction = !filters.action || (filters.action === "reprocess" ? canReprocessItem(item) : !canReprocessItem(item));
    return matchesSearch && matchesReason && matchesSource && matchesAction;
  }), [rows, search, filters]);
  if (sample) return <div className="review-workspace"><Button size="sm" variant="ghost" onClick={() => setSample(false)}>검토 대기 목록으로</Button><Audit scope={scope} /></div>;
  if (query.isPending) return <p role="status">검토 대기 자료를 읽는 중</p>;
  if (query.isError && !query.data) return <div className="kb-error"><p className="tk-error" role="alert">{userFailure(query.error)}</p><Button onClick={() => void query.refetch()}>다시 시도</Button></div>;
  const total = query.data?.pages[0]?.total ?? 0;
  const setFilter = (key: FilterKey, value: string) => setFilters(current => ({ ...current, [key]: value }));
  const loadNextLabel = query.isFetchNextPageError ? "다음 페이지 다시 시도" : `다음 ${query.data?.pages[query.data.pages.length - 1]?.limit ?? ""}건 불러오기`;
  const pagination = (position: "top" | "bottom") => query.hasNextPage
    ? <div className={`review-pagination review-pagination--${position}`}>
      {position === "top" && query.isFetchNextPageError && <p className="tk-error" role="alert">다음 페이지를 불러오지 못했어요: {userFailure(query.error)}</p>}
      <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{loadNextLabel}</Button>
    </div>
    : position === "bottom" && rows.length > 0
      ? <p className="kb-note">전체 {total.toLocaleString("ko-KR")}건 중 {rows.length.toLocaleString("ko-KR")}건을 불러왔습니다.</p>
      : null;
  return <section className="kb-results review-workspace" aria-label="검토 대기">
    <div className="kb-actions review-workspace__heading"><div><h2>서버 검토 대기 {total.toLocaleString("ko-KR")}건</h2><p className="kb-note">전체 큐 총량입니다. 사용자 조치 필요·자동 평가 대기·정책 차단의 전체 분류는 API에서 제공하지 않습니다.</p></div>
      <Button size="sm" variant="primary" onClick={() => setSample(true)}>보류 표본 감사</Button></div>
    <p className="review-workspace__scope">현재 {rows.length.toLocaleString("ko-KR")}건을 불러왔습니다. 아래 검색·필터는 불러온 항목에만 적용됩니다. 전체 큐를 보려면 더 불러오세요.</p>
    <p className="kb-note">이 검토 응답에는 정밀 판정 엔진·모델·상태와 정밀 평가 대기 건수가 없습니다 · 미확인(사용자 조치 필요 수와 별도).</p>
    <div className="review-filters" aria-label="검토 필터">
      <label>자료 검색<input className="tk-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="주소·출처·미리보기" /></label>
      <label>보류 사유<select className="tk-input" value={filters.reason} onChange={event => setFilter("reason", event.target.value)}><option value="">모든 사유</option>{[...new Set(rows.flatMap(item => item.reason_codes))].map(code => <option key={code} value={code}>{labelReason(code)}</option>)}</select></label>
      <label>출처<select className="tk-input" value={filters.source} onChange={event => setFilter("source", event.target.value)}><option value="">모든 출처</option>{[...new Set(rows.map(item => item.source_key))].sort().map(source => <option key={source}>{source}</option>)}</select></label>
      <label>가능 조치<select className="tk-input" value={filters.action} onChange={event => setFilter("action", event.target.value)}><option value="">모든 조치</option><option value="reprocess">재처리 가능</option><option value="none">재처리 불가</option></select></label>
    </div>
    <p className="review-workspace__shared-note">자동 평가와 불확실성은 목록 API에서 제공되지 않아 미확인입니다. 우선 확인 표시는 사유 기반 제안이며 서버 순위나 자동 점수가 아닙니다. 각 행에서 출처·상태·사유·미리보기와 가능한 조치를 확인하고, 판정·적재는 필요한 자료에서만 펼치세요.</p>
    {pagination("top")}
    {rows.length === 0 && <p className="kb-empty">검토할 자료가 없어요.</p>}
    {rows.length > 0 && filtered.length === 0 && <p className="kb-empty">불러온 {rows.length}건 중 조건에 맞는 자료가 없습니다.</p>}
    {filtered.length > 0 && <p className="review-workspace__scope" aria-live="polite">불러온 {rows.length}건 중 {filtered.length}건 표시</p>}
    <ul className="kb-hits">{filtered.map(item => <Row key={item.id} item={item} scope={scope} />)}</ul>
    {pagination("bottom")}
  </section>;
}
