import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cancelCollectJob, collectItems, collectJobs, collectSources, createCollectSource, editCollectSource, retryCollectJob, runCollectSource, updateCollectSource } from "../../api/collector";
import type { CollectJob, CollectSource, KbScope } from "../../api/collector";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { COLLECT_REASON, failure, formatTime } from "./labels";
import { ItemReview, QualityPanel } from "./Quality";

export const STATUS: Record<string, string> = {
  queued: "대기", running: "수집 중", succeeded: "수집 마침", partial: "일부 수집", failed: "실패",
  cancelled: "취소", retry_wait: "재시도 대기", budget_wait: "예산 대기", policy_blocked: "정책 확인 필요", quarantined: "격리",
  accepted: "적재 대상", held: "검토 보류", blocked: "차단", not_modified: "변경 없음", discovered: "링크 발견",
  imported: "도서관 적재", exported: "내보내기 준비",
};

function SourceForm({ scope, close, editing }: { scope?: KbScope; close: () => void; editing?: CollectSource }) {
  const cache = useQueryClient();
  const [title, setTitle] = useState(editing?.title || "");
  const [url, setUrl] = useState(editing?.seeds[0] || "");
  const [license, setLicense] = useState(editing?.policy?.license_id || "");
  const [policyUrl, setPolicyUrl] = useState(editing?.policy?.policy_url || "");
  const [basis, setBasis] = useState(editing?.policy?.basis || "");
  const [interval, setInterval] = useState(editing?.interval_minutes ? String(editing.interval_minutes) : "manual");
  const [pages, setPages] = useState(String(editing?.request.max_pages || 10));
  const [grant, setGrant] = useState(Boolean(editing?.policy && ["store", "knowledge", "export"].every((purpose) => editing.policy?.permissions[purpose] === "allowed")));
  const [trainGrant, setTrainGrant] = useState(editing?.policy?.permissions.train === "allowed");
  const save = useMutation({
    mutationFn: async () => {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") throw new Error("HTTPS 주소를 입력해 주세요.");
      const body = {
        title: title.trim(), seeds: [url.trim(), ...(editing?.seeds.slice(1) || [])],
        interval_minutes: interval === "manual" ? null : Number(interval), max_pages: Number(pages),
        policy: { ...editing?.policy, allowed_hosts: [parsed.hostname], permissions: { store: "allowed", knowledge: "allowed", export: "allowed", train: trainGrant ? "allowed" : "unknown" },
          license_id: license.trim(), policy_url: policyUrl.trim(), basis: basis.trim(), checked_at: editing?.policy?.checked_at || new Date().toISOString() },
      };
      return editing ? editCollectSource(editing.id, scope, { ...body, expected_version: editing.version })
        : createCollectSource(scope, { ...body, source_key: `${parsed.hostname}:${crypto.randomUUID()}` });
    },
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ["kb-collect-sources", scope] }); close(); },
  });
  return <form className="kb-register" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
    <h2>{editing ? "수집 출처 설정" : "수집 출처 등록"}</h2>
    <label className="kb-field">이름<input className="tk-input" required value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="예: PostgreSQL 공식 문서" /></label>
    <label className="kb-field">문서·피드·사이트맵 주소<input className="tk-input" required type="url" value={url} onChange={(e) => { setUrl(e.target.value); if (editing) setGrant(false); }} placeholder="https://…" /></label>
    <div className="kb-collect-fields">
      <label className="kb-field">한 번에 수집할 최대 페이지<input className="tk-input" type="number" min={1} max={50} required value={pages} onChange={(e) => setPages(e.target.value)} /></label>
      <div className="kb-field"><label id="collect-frequency-label" htmlFor="collect-frequency">수집 주기</label>
        <Select id="collect-frequency" labelledBy="collect-frequency-label" value={interval} onChange={setInterval} options={[
          { value: "manual", label: "직접 실행" }, { value: "60", label: "매시간" }, { value: "1440", label: "매일" }, { value: "10080", label: "매주" },
        ]} /></div>
    </div>
    <fieldset className="kb-policy-fields"><legend>원문 보관·도서관 이용·내보내기 권리</legend>
      <label className="kb-field">라이선스<input className="tk-input" required value={license} onChange={(e) => setLicense(e.target.value)} placeholder="예: CC BY 4.0" /></label>
      <label className="kb-field">이용 조건 원문 주소<input className="tk-input" type="url" required value={policyUrl} onChange={(e) => setPolicyUrl(e.target.value)} /></label>
      <label className="kb-field">허용 근거<textarea className="tk-textarea" required rows={3} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="해당 용도를 허용하는 조항을 적어 주세요." /></label>
      <label className="kb-policy-consent"><input type="checkbox" checked={grant} onChange={(e) => setGrant(e.target.checked)} />위 세 용도를 허용하는 조건을 확인했어요.</label>
      <label className="kb-policy-consent"><input type="checkbox" checked={trainGrant} onChange={(e) => setTrainGrant(e.target.checked)} />선택: 위 조건에서 모델 학습용 이용도 허용함을 확인했어요.</label>
      <p className="kb-note">robots.txt와 사이트 요청 간격도 지켜요. 학습용 이용은 별도로 확인한 경우에만 허용해요.</p>
    </fieldset>
    {save.isError && <p role="alert" className="tk-error">{failure(save.error)}</p>}
    <div className="kb-actions"><Button type="submit" variant="primary" disabled={!grant} busy={save.isPending}>출처 저장</Button><Button type="button" variant="ghost" disabled={save.isPending} onClick={close}>닫기</Button></div>
  </form>;
}

function JobItems({ id, scope }: { id: string; scope?: KbScope }) {
  const query = useInfiniteQuery({ queryKey: ["kb-collect-items", scope, id], initialPageParam: 0, refetchInterval: 10000,
    queryFn: ({ pageParam }) => collectItems(id, scope, pageParam),
    getNextPageParam: (p) => p.offset + p.items.length < p.total ? p.offset + p.limit : undefined });
  if (query.isPending) return <p role="status">수집 항목을 읽는 중</p>;
  if (query.isError && !query.data) return <p role="alert" className="tk-error">{failure(query.error)}</p>;
  const rows = query.data.pages.flatMap((p) => p.items);
  return <div className="kb-results">
    {rows.length === 0 && <p className="kb-note">아직 수집된 항목이 없어요. 작업 상태와 오류를 확인해 주세요.</p>}
    <ul className="kb-passages">{rows.map((item) => <li key={item.id} className="kb-passage">
      <span className="kb-hash">{item.url}</span>
      <div className="kb-badges"><Badge>{STATUS[item.status] || item.status}</Badge>{item.delivery && <Badge>{STATUS[item.delivery.outcome] || item.delivery.outcome}</Badge>}</div>
      {item.preview && <p className="kb-passage__body">{item.preview}</p>}
      {item.reason_codes.length > 0 && <p className="kb-note">{item.reason_codes.map((reason) => COLLECT_REASON[reason] || reason).join(" · ")}</p>}
      {item.preview && <ItemReview id={item.id} scope={scope} />}
    </li>)}</ul>
    {query.hasNextPage && <Button variant="ghost" busy={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>항목 더 보기</Button>}
  </div>;
}

function JobRow({ job, scope }: { job: CollectJob; scope?: KbScope }) {
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const active = ["queued", "running", "retry_wait", "budget_wait"].includes(job.status);
  const action = useMutation({ mutationFn: () => active ? cancelCollectJob(job.job_id, scope) : retryCollectJob(job.job_id, scope),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["kb-collect-jobs", scope] }) });
  return <li className="kb-hit">
    <div className="kb-collect-jobhead"><Badge>{STATUS[job.status] || job.status}</Badge><span className="kb-note">{formatTime(job.created_at)}</span></div>
    <p className="kb-hash">{job.source_key}</p>
    {job.last_error && <p className="tk-error">{job.last_error.code}{job.last_error.detail ? ` · ${job.last_error.detail}` : ""}</p>}
    <div className="kb-actions"><Button size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "항목 닫기" : "수집 항목 보기"}</Button>
      <Button size="sm" variant="ghost" busy={action.isPending} onClick={() => action.mutate()}>{active ? "작업 취소" : "다시 실행"}</Button></div>
    {action.isError && <p className="tk-error" role="alert">{failure(action.error)}</p>}
    {expanded && <JobItems id={job.job_id} scope={scope} />}
  </li>;
}

export function SourcesPanel({ scope }: { scope?: KbScope } = {}) {
  const cache = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CollectSource | undefined>();
  const sources = useQuery({ queryKey: ["kb-collect-sources", scope], queryFn: () => collectSources(scope), refetchInterval: 15000 });
  const run = useMutation({ mutationFn: (id: string) => runCollectSource(id, scope),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["kb-collect-jobs", scope] }) });
  const toggle = useMutation({ mutationFn: ({ id, enabled, version }: { id: string; enabled: boolean; version: number }) => updateCollectSource(id, scope, enabled, version),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["kb-collect-sources", scope] }) });
  return <section className="kb-results" aria-label="수집 출처">
    <div className="kb-actions"><h2>수집 출처</h2><Button size="sm" variant="primary" onClick={() => setAdding(!adding)}>출처 등록</Button></div>
    <p className="kb-note">출처를 등록하면 허용된 문서를 수집하고 기본 검사를 통과한 자료를 도서관에 쌓아요. 보류·실패 항목도 아래에서 확인할 수 있어요.</p>
    {adding && <SourceForm key={scope} scope={scope} close={() => setAdding(false)} />}
    {editing && <SourceForm key={editing.id} editing={editing} scope={scope} close={() => setEditing(undefined)} />}
    {sources.isPending && <p role="status">출처를 읽는 중</p>}
    {sources.isError && <div className="kb-error"><p className="tk-error" role="alert">{failure(sources.error)}</p><Button onClick={() => void sources.refetch()}>다시 시도</Button></div>}
    {sources.data && !sources.data.runtime_enabled && <p className="kb-callout">서버의 자동 수집이 꺼져 있어요. 실행 요청은 대기열에 남아요.</p>}
    {sources.data?.items.length === 0 && <p className="kb-empty">아직 수집 출처가 없어요.</p>}
    <ul className="kb-hits">{sources.data?.items.map((source) => <li className="kb-hit" key={source.id}>
      <h3 className="kb-hit__title">{source.title}</h3><p className="kb-hash">{source.seeds[0]}</p>
      <div className="kb-badges"><Badge>{source.enabled ? "사용 중" : "일시정지"}</Badge><Badge>{source.interval_minutes ? `${source.interval_minutes.toLocaleString()}분 주기` : "직접 실행"}</Badge><Badge>{source.auto_import ? "도서관 자동 적재" : "내보내기"}</Badge></div>
      {source.next_run_at && source.enabled && <p className="kb-note">다음 자동 수집 {formatTime(source.next_run_at)}</p>}
      <div className="kb-actions"><Button size="sm" busy={run.isPending} disabled={!source.enabled} onClick={() => run.mutate(source.id)}>지금 수집</Button>
        <Button size="sm" variant="ghost" busy={toggle.isPending} onClick={() => toggle.mutate({ id: source.id, enabled: !source.enabled, version: source.version })}>{source.enabled ? "일시정지" : "재개"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setEditing(source); }}>출처 설정</Button></div>
      {source.last_error && <p className="tk-error">{source.last_error}</p>}
    </li>)}</ul>
    {(run.isError || toggle.isError) && <p className="tk-error" role="alert">{failure(run.error || toggle.error)}</p>}
  </section>;
}

export function RunsPanel({ scope }: { scope?: KbScope } = {}) {
  const jobs = useInfiniteQuery({ queryKey: ["kb-collect-jobs", scope], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => collectJobs(scope, pageParam), getNextPageParam: (p) => p.next_cursor || undefined, refetchInterval: 10000 });
  return <section className="kb-results" aria-label="수집 이력">
    <h2>수집 이력</h2>
    {jobs.isPending && <p role="status">작업을 읽는 중</p>}
    {jobs.isError && <p className="tk-error" role="alert">{failure(jobs.error)}</p>}
    {jobs.data?.pages[0]?.jobs.length === 0 && <p className="kb-note">수집을 시작하면 작업별 진행 상황과 결과가 여기에 보여요.</p>}
    <ul className="kb-hits">{jobs.data?.pages.flatMap((p) => p.jobs).map((job) => <JobRow key={job.job_id} job={job} scope={scope} />)}</ul>
    {jobs.hasNextPage && <Button variant="ghost" busy={jobs.isFetchingNextPage} onClick={() => void jobs.fetchNextPage()}>이전 작업 더 보기</Button>}
  </section>;
}

export function Collection() {
  const [qualityOpen, setQualityOpen] = useState(false);
  return <section className="kb-results" aria-label="지식 수집 관리">
    <SourcesPanel />
    <RunsPanel />
    <Button variant="ghost" aria-expanded={qualityOpen} onClick={() => setQualityOpen(!qualityOpen)}>{qualityOpen ? "품질 모델 관리 닫기" : "품질 모델 관리"}</Button>
    {qualityOpen && <QualityPanel />}
  </section>;
}
