import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { deleteReverseJob, listReverseJobs, listWorkspaces, startReverseJob } from "../api/client";
import type { ReverseMode, ReverseSummary, ReverseTargetType } from "../api/reverseTypes";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import { toast } from "../ui/toastStore";
import { EmptyState, ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { errorText } from "../features/viewer/api";
import "./reverse.css";

const KEY = ["reverse", "jobs"] as const;
const STATUS: Record<ReverseSummary["status"], string> = {
  queued: "대기 중", running: "진행 중", waiting: "모델 대기 중", partial: "부분 완료", done: "완료", failed: "실패", needs_input: "추가 설명 필요",
};
const TARGET_LABEL: Record<ReverseTargetType, string> = { auto: "자동", cli: "CLI", web: "웹", api: "API", source: "소스" };
const MODE_LABEL: Record<ReverseMode, string> = { auto: "자동 판단", analyze: "분석", reconstruct: "재현", analyze_reconstruct: "분석 후 재현" };
const TYPE_OPTIONS: ReverseTargetType[] = ["auto", "cli", "web", "api", "source"];
const MODE_OPTIONS: ReverseMode[] = ["auto", "analyze", "reconstruct", "analyze_reconstruct"];

function shortTarget(target: string) { return target.length > 90 ? target.slice(0, 87) + "…" : target; }
function shortDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "갱신 시각 미확인" : new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}
function recommendation(text: string): ReverseTargetType {
  if (/\b(cli|command|terminal|stdin|stdout|argv)\b|명령행|터미널|표준입력|표준출력/i.test(text)) return "cli";
  if (/\b(api|endpoint|http|request|response)\b|요청·응답|엔드포인트/i.test(text)) return "api";
  if (/\b(source|library|package|module)\b|소스코드|라이브러리/i.test(text)) return "source";
  if (/\b(web|website|browser|screen|ui)\b|웹앱|화면|브라우저/i.test(text)) return "web";
  return "auto";
}
function modeRecommendation(text: string): ReverseMode {
  if (/분석만|조사만|동작만 파악|소스는 만들지/i.test(text)) return "analyze";
  if (/재현만|구현만|바로 구현|코드만 만들어/i.test(text)) return "reconstruct";
  return "analyze_reconstruct";
}
function verification(j: ReverseSummary) {
  const resultLatest = j.result && "schema_version" in j.result && j.result.schema_version === 2 ? j.result.latest : undefined;
  const latest = j.latest ?? resultLatest;
  const s = j.direct_comparison?.status ?? latest?.direct_comparison?.status;
  return s ?? "unverified";
}
function nextAction(j: ReverseSummary) {
  if (["queued", "running", "waiting"].includes(j.status)) return j.waiting_reason || j.progress || "진행 상황 확인";
  if (j.status === "needs_input") return "대상 접근 방법이나 동작 예시 보충";
  if (j.status === "failed" || j.status === "partial") return "실패 원인 확인 후 재시도 또는 수정";
  if (verification(j) === "mismatch") return "불일치 항목을 확인하고 수정 요청";
  if (verification(j) === "unverified") return "직접 비교 증거와 독립 검증 상태 확인";
  return "산출물과 검증 근거 확인";
}
function groupFor(j: ReverseSummary) {
  if (["queued", "running", "waiting"].includes(j.status)) return "진행 중";
  if (["failed", "partial", "needs_input"].includes(j.status) || verification(j) === "mismatch") return "수정 필요";
  return "최근 완료";
}

export function ReversePage() {
  const [target, setTarget] = useState("");
  const [purpose, setPurpose] = useState("");
  const [title, setTitle] = useState("");
  const [referencesText, setReferencesText] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [targetType, setTargetType] = useState<ReverseTargetType>("auto");
  const [mode, setMode] = useState<ReverseMode>("analyze_reconstruct");
  const [repairs, setRepairs] = useState(0);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  const [filterValidation, setFilterValidation] = useState("all");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: () => listWorkspaces() });
  const jobs = useQuery({ queryKey: KEY, queryFn: listReverseJobs,
    refetchInterval: (q) => ((q.state.data?.items ?? []).some((j) => ["queued", "running", "waiting"].includes(j.status)) ? 3000 : false),
  });
  const items = jobs.data?.items ?? [];
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: KEY }); });
  const suggestedType = recommendation(target);
  const suggestedMode = modeRecommendation(target);
  const start = useMutation({
    mutationFn: () => {
      const references = referencesText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      return startReverseJob({ description: `${target.trim()}${purpose.trim() ? `\n\n목적·성공 기준: ${purpose.trim()}` : ""}`, mode,
        ...(workspaceId ? { workspace_id: workspaceId } : {}), ...(title.trim() ? { title: title.trim() } : {}),
        ...(targetType !== "auto" ? { target_type: targetType } : {}), ...(references.length ? { references } : {}),
        ...(repairs ? { max_repair_attempts: repairs } : {}),
      });
    },
    onSuccess: (job) => { setTarget(""); setPurpose(""); setTitle(""); setReferencesText(""); void qc.invalidateQueries({ queryKey: KEY });
      toast({ message: "재현 작업을 시작했어요.", tone: "success" }); void navigate(`/reverse/${job.id}`); },
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteReverseJob(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }), onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const filtered = useMemo(() => items.filter((j) => {
    const text = `${j.title ?? ""} ${j.target} ${j.overview ?? ""}`.toLocaleLowerCase();
    return (!search || text.includes(search.toLocaleLowerCase())) &&
      (filterType === "all" || (j.target_type ?? "auto") === filterType) &&
      (filterMode === "all" || (j.mode ?? "auto") === filterMode) &&
      (filterValidation === "all" || verification(j) === filterValidation);
  }), [items, search, filterType, filterMode, filterValidation]);
  const grouped = ["진행 중", "수정 필요", "최근 완료"].map((name) => [name, filtered.filter((j) => groupFor(j) === name)] as const);
  const recommendationLabel = targetType === "auto" ? `추천 유형: ${TARGET_LABEL[suggestedType]}` : `선택한 유형: ${TARGET_LABEL[targetType]}`;

  return <div className="tk-screen">
    <PageHeader title="리버스 엔지니어링" meta={jobs.data ? `작업 ${jobs.data.items.length}개` : "대상을 관찰하고 동작을 비교해 재현합니다"} />
    <div className="tk-screen__body"><div className="tk-container tk-container--lg"><div className="rv">
      <form className="rv-start rv-create" onSubmit={(e) => { e.preventDefault(); if (target.trim() && !start.isPending) start.mutate(); }}>
        <div className="rv-create__intro"><span className="rv-eyebrow">새 작업</span><h2 className="tk-heading-4">무엇을 재현할까요?</h2>
          <p className="rv-note">설명, 사용 흐름, 예상 입출력, 경계 사례를 자연어로 적어 주세요. 참고 자료와 작업공간을 함께 지정할 수 있어요.</p></div>
        <label className="rv-label" htmlFor="rv-target">대상과 원하는 결과</label>
        <textarea id="rv-target" value={target} onChange={(e) => setTarget(e.target.value)} rows={6} maxLength={40000}
          placeholder={"예: 제어판의 로그 정리 명령을 재현하고 싶어요.\n폴더를 지정하면 30일 지난 로그만 지우고, 실행 전 삭제 목록을 보여줘야 해요.\n빈 폴더와 권한 오류 처리도 확인해 주세요."} autoComplete="off" aria-describedby="rv-help" />
        <label className="rv-label" htmlFor="rv-purpose">목적·성공 기준 <span className="rv-note">(선택)</span></label>
        <input id="rv-purpose" value={purpose} maxLength={2000} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 기존 CLI와 출력 형식이 호환되어야 해요." />
        <div className="rv-form-grid">
          <div><label className="rv-label" htmlFor="rv-title">짧은 제목 <span className="rv-note">(선택)</span></label>
            <input id="rv-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="예: 오래된 로그 정리 CLI" /></div>
          <div><label className="rv-label" htmlFor="rv-workspace">작업공간</label>
            <select id="rv-workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}><option value="">기본 작업공간</option>
              {(workspaces.data ?? []).map((ws) => <option key={ws.id} value={ws.id}>{ws.name}</option>)}</select></div>
        </div>
        <label className="rv-label" htmlFor="rv-references">참고 URL·파일·문서 <span className="rv-note">(줄바꿈으로 구분)</span></label>
        <textarea id="rv-references" className="rv-references" value={referencesText} onChange={(e) => setReferencesText(e.target.value)} rows={2} placeholder="https://… 또는 fixtures/input.json" />
        {workspaces.isError && <p className="rv-note" role="status">작업공간 목록을 읽지 못했어요. 기본 작업공간으로 시작할 수 있습니다.</p>}
        <details className="rv-advanced"><summary>고급 설정 <span>{recommendationLabel} · 추천 방식: {MODE_LABEL[suggestedMode]}</span></summary>
          <p className="rv-note">설명에서 추정한 추천입니다. 요청 전에 유형과 진행 방식을 바꿀 수 있어요.</p>
          <div className="rv-form-grid">
            <div><label className="rv-label" htmlFor="rv-type">대상 유형 · {recommendationLabel}</label><select id="rv-type" value={targetType} onChange={(e) => setTargetType(e.target.value as ReverseTargetType)}>
              {TYPE_OPTIONS.map((v) => <option key={v} value={v}>{TARGET_LABEL[v]}</option>)}</select></div>
            <div><label className="rv-label" htmlFor="rv-mode">진행 방식 · 추천: {MODE_LABEL[suggestedMode]}</label><select id="rv-mode" value={mode} onChange={(e) => setMode(e.target.value as ReverseMode)}>
              {MODE_OPTIONS.map((v) => <option key={v} value={v}>{MODE_LABEL[v]}</option>)}</select></div>
          </div>
          <label className="rv-label" htmlFor="rv-repairs">자동 수정 시도 상한: {repairs}</label><input id="rv-repairs" type="range" min="0" max="3" step="1" value={repairs} onChange={(e) => setRepairs(Number(e.target.value))} />
          <div className="rv-plan"><strong>예상 조사 순서</strong><ol>{(targetType === "cli" || suggestedType === "cli"
            ? ["CLI 입력·옵션과 정상/오류 출력 관찰", "대상 환경 및 실행 방법 확인", "원본과 구현의 argv/stdin·stdout/stderr·종료 코드 비교", "독립 검증"]
            : targetType === "api" || suggestedType === "api"
              ? ["요청·응답과 인증 조건 관찰", "상태 코드·오류·경계 입력 확인", "원본과 구현의 요청/응답 비교", "독립 검증"]
              : targetType === "web" || suggestedType === "web"
                ? ["화면·DOM·이벤트와 상태 변화 관찰", "브라우저·환경·시각 조건 기록", "원본과 구현의 주요 상호작용 비교", "독립 검증"]
                : ["제공된 자료와 실행 조건 조사", "핵심 동작 및 경계 사례 정리", "구현 결과와 원본 비교", "독립 검증"]
          ).map((step) => <li key={step}>{step}</li>)}</ol></div>
        </details>
        <p id="rv-help" className="rv-note">유형·방식 추천은 설명 기반 초안이며 서버 응답의 추천·실행 계획이 도착하면 그 근거를 확인할 수 있습니다.</p>
        <Button variant="primary" type="submit" busy={start.isPending} disabled={!target.trim()}>재현 작업 시작</Button>
      </form>

      <section className="rv-dashboard" aria-label="작업 대시보드">
        <div className="rv-dashboard__head"><div><h2 className="tk-heading-4">작업 현황</h2><p className="rv-note">수정이 필요한 차이와 검증 근거를 먼저 확인하세요.</p></div></div>
        <div className="rv-filters" aria-label="작업 필터">
          <label className="rv-filter-search"><span className="tk-sr-only">작업 검색</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제목·설명 검색" /></label>
          <label><span className="tk-sr-only">유형 필터</span><select value={filterType} onChange={(e) => setFilterType(e.target.value)}><option value="all">모든 유형</option>{TYPE_OPTIONS.map((v) => <option key={v} value={v}>{TARGET_LABEL[v]}</option>)}</select></label>
          <label><span className="tk-sr-only">방식 필터</span><select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}><option value="all">모든 방식</option>{MODE_OPTIONS.map((v) => <option key={v} value={v}>{MODE_LABEL[v]}</option>)}</select></label>
          <label><span className="tk-sr-only">검증 상태 필터</span><select value={filterValidation} onChange={(e) => setFilterValidation(e.target.value)}>
            <option value="all">모든 검증 상태</option><option value="match">일치</option><option value="mismatch">불일치</option><option value="unverified">미검증</option></select></label>
        </div>
        {jobs.isPending ? <ListSkeleton label="작업 목록을 읽는 중" rows={3} />
          : jobs.isError ? <ErrorState what="리버스 작업 목록" error={jobs.error} onRetry={() => void jobs.refetch()} />
          : filtered.length === 0 ? <EmptyState icon="search" title={items.length ? "조건에 맞는 작업이 없어요" : "아직 시작한 작업이 없어요"}>
            {items.length ? "검색어와 필터를 바꾸어 다시 찾아보세요." : "자연어 설명을 작성하면 조사·재현·검증 과정을 이곳에서 확인할 수 있어요."}
          </EmptyState> : <div className="rv-groups">{grouped.map(([name, group]) => group.length > 0 && <section className="rv-group" key={name} aria-label={name}>
            <div className="rv-group__heading"><h3>{name}</h3><span>{group.length}</span></div>
            <ul className="rv-list">{group.map((j) => {
              const compare = verification(j);
              return <li key={j.id} className="rv-card" data-status={j.status}>
                <div className="rv-card__head"><span className="rv-chip" data-status={j.status}>{STATUS[j.status]}</span><time className="rv-time" dateTime={j.updated_at}>갱신 {shortDate(j.updated_at)}</time></div>
                <Link className="rv-card__title" to={`/reverse/${j.id}`}>{j.title || shortTarget(j.target)}</Link>
                {j.title && <p className="rv-card__excerpt">{shortTarget(j.target)}</p>}
                {j.overview && <p className="rv-card__excerpt">{j.overview}</p>}
                {j.status === "failed" && j.error && <p className="tk-error" role="alert">{j.error}</p>}
                <div className="rv-card__meta"><span className="rv-compare-chip" data-result={compare}>{compare === "match" ? "직접 비교 일치" : compare === "mismatch" ? "직접 비교 불일치" : "직접 비교 미검증"}</span>
                  {j.target_type && <span>{TARGET_LABEL[j.target_type]}</span>}{j.mode && <span>{MODE_LABEL[j.mode]}</span>}</div>
                <p className="rv-card__next"><strong>다음 액션</strong>{nextAction(j)}</p>
                <div className="rv-card__foot"><span className="rv-note">{j.kind === "reconstruction" ? "재현 작업" : "이전 분석 기록"}{j.revision ? ` · rev ${j.revision.slice(0, 12)}` : ""}</span>
                  {["done", "failed", "partial", "needs_input"].includes(j.status) && <Button variant="ghost" size="sm" busy={remove.isPending} aria-label={`${j.title || shortTarget(j.target)} 지우기`} onClick={() => remove.mutate(j.id)}>지우기</Button>}
                </div>
              </li>;
            })}</ul>
          </section>)}</div>}
      </section>
    </div></div></div>
  </div>;
}
