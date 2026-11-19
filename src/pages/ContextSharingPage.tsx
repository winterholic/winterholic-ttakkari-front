import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import * as api from "../api/contextSharing";
import type { CredentialTtlDays, DraftDocument, DraftPatchIn, KeyIssued, KeyScope, ShareKey, ShareProject, SnapshotPolicy, SourceDocument } from "../api/contextSharingTypes";
import { describeShareError } from "../features/context-sharing/errors";
import { PageHeader } from "../shell/PageHeader";
import { Dialog } from "../ui/Dialog";
import "../features/context-sharing/context-sharing.css";
import { ProjectListView } from "../features/context-sharing/ProjectListView";
import { ProjectDetailView } from "../features/context-sharing/ProjectDetailView";
import { PublicationFlow } from "../features/context-sharing/PublicationFlow";
import { ProjectApiKeyPanel } from "../features/context-sharing/ProjectApiKeyPanel";
import { ShareLinkPanel } from "../features/context-sharing/ShareLinkPanel";

type DraftEdit = Partial<DraftDocument> & { verified?: boolean };

const scopeLabel = (s: ShareProject["scope"]) => s === "work" ? "회사" : s === "shared" ? "공통" : "개인";
const problem = (e: unknown) => describeShareError(e);
const date = (s: string | null | undefined) => s ? new Date(s).toLocaleString("ko-KR") : "확인 전";

export function ContextSharingPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const projectId = params.get("project");
  const draftId = params.get("draft");
  const routeKey = `${projectId ?? ""}|${draftId ?? ""}`;
  const routeRef = useRef(routeKey);
  const routeVersionRef = useRef(0);
  useLayoutEffect(() => { routeRef.current = routeKey; routeVersionRef.current += 1; }, [routeKey]);
  const mountedRef = useRef(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [createTitle, setCreateTitle] = useState("");
  const [createSummary, setCreateSummary] = useState("");
  const [confirmWork, setConfirmWork] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const [excluded, setExcluded] = useState<string[]>([]);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [readConfirm, setReadConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [staleDraft, setStaleDraft] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ kind: "key" | "project"; key?: ShareKey } | null>(null);
  const [keyLabel, setKeyLabel] = useState("");
  const [keyScopes, setKeyScopes] = useState<KeyScope[]>(["read", "search"]);
  const [keyTtl, setKeyTtl] = useState<CredentialTtlDays>(3);
  const [keyPolicy, setKeyPolicy] = useState<SnapshotPolicy>("pinned");
  const [issued, setIssued] = useState<KeyIssued | null>(null);
  const [keyPending, setKeyPending] = useState(false);
  const keyPendingRef = useRef(false);
  const [siteConfirm, setSiteConfirm] = useState(false);
  const [sitePending, setSitePending] = useState(false);
  const [siteError, setSiteError] = useState("");
  const [siteNotice, setSiteNotice] = useState("");
  const [consoleKeyProject, setConsoleKeyProject] = useState("");
  const [consoleKeyPending, setConsoleKeyPending] = useState(false);

  const projectsQ = useQuery({ queryKey: api.SHARE_PROJECTS_KEY, queryFn: api.shareProjects });
  const siteQ = useQuery({ queryKey: api.SHARE_SITE_KEY, queryFn: api.getSite });
  const consoleKeysQ = useQuery({ queryKey: api.shareKeysKey(""), queryFn: () => api.listKeys(), enabled: !projectId });
  const projects = projectsQ.data?.projects ?? [];
  const selected = projects.find((p) => p.entity_id === projectId);
  const sourcesQ = useQuery({ queryKey: api.shareSourcesKey(projectId ?? ""), queryFn: () => api.shareSources(projectId!), enabled: !!projectId });
  const draftsQ = useQuery({ queryKey: api.shareDraftsKey(projectId ?? ""), queryFn: () => api.listDrafts({ entityId: projectId!, limit: 50 }), enabled: !!projectId });
  const draftQ = useQuery({ queryKey: api.shareDraftKey(draftId ?? ""), queryFn: () => api.getDraft(draftId!), enabled: !!draftId });
  const draft = draftQ.data;
  const keysQ = useQuery({ queryKey: api.shareKeysKey(selected?.slug ?? ""), queryFn: () => api.listKeys(selected!.slug!), enabled: !!selected?.slug });
  const docs = draft?.documents ?? [];
  const visibleDocs = docs.filter((d) => !excluded.includes(d.id));
  const changedDocs = docs.filter((d) => {
    const e = edits[d.id];
    return !!e && ((e.title !== undefined && e.title !== d.title) || (e.content !== undefined && e.content !== d.content) || (e.verified !== undefined && e.verified !== !!d.verified_at));
  });
  const dirty = !!draft && (title !== draft.title || summary !== draft.summary || changedDocs.length > 0 || excluded.length > 0);
  const unverified = visibleDocs.filter((d) => {
    const e = edits[d.id] ?? {};
    const contentChanged = (e.content !== undefined && e.content !== d.content) || (e.title !== undefined && e.title !== d.title);
    return !(contentChanged ? (e.verified ?? false) : (e.verified ?? !!d.verified_at));
  });
  const published = draft?.status === "published";
  const activePublication = selected?.publication?.status === "active";
  const workProject = selected?.scope === "work";
  const issuableProjects = projects.filter((p) => p.slug && p.publication?.status === "active");
  const consoleProjectSlug = issuableProjects.some((p) => p.slug === consoleKeyProject) ? consoleKeyProject : issuableProjects[0]?.slug ?? "";

  // Route changes discard transient edits and any one-time key held only in memory.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIssued(null); setError(""); setNotice(""); setReadConfirm(false);
    keyPendingRef.current = false; setKeyPending(false); setConsoleKeyPending(false);
    setSelection([]); setExcluded([]); setEdits({}); setOpenDoc(null);
  }, [projectId, draftId]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(draft.title); setSummary(draft.summary); setEdits({}); setExcluded([]); setReadConfirm(false);
  }, [draft]);

  const setRoute = (patch: { project?: string | null; draft?: string | null }) => {
    const next = new URLSearchParams(params);
    if ("project" in patch) { if (patch.project) next.set("project", patch.project); else next.delete("project"); }
    if ("draft" in patch) { if (patch.draft) next.set("draft", patch.draft); else next.delete("draft"); }
    setParams(next);
  };
  const refreshProjects = () => { void projectsQ.refetch(); };
  const apiError = (e: unknown) => { const p = problem(e); setError(`${p.title}\n${p.body}`); };
  const draftLink = (id: string) => `/context-sharing?project=${encodeURIComponent(projectId ?? "")}&draft=${encodeURIComponent(id)}`;
  const setDocEdit = (doc: DraftDocument, field: "title" | "content" | "verified", value: string | boolean) => {
    setEdits((old) => ({ ...old, [doc.id]: { ...old[doc.id], [field]: value,  } }));
  };

  async function create() {
    if (!selected || !selection.length || (workProject && !confirmWork)) return;
    setError("");
    try {
      const d = await api.createDraft({ entity_id: selected.entity_id, document_ids: selection, ...(createTitle.trim() ? { title: createTitle.trim() } : {}), summary: createSummary.trim(), confirm_work_scope: workProject && confirmWork });
      await qc.invalidateQueries({ queryKey: api.shareDraftsKey(selected.entity_id) });
      setRoute({ draft: d.id });
    } catch (e) { apiError(e); }
  }
  function patchBody(): DraftPatchIn {
    if (!draft) return {};
    const body: DraftPatchIn = { expected_digest: draft.digest };
    if (title !== draft.title) body.title = title.trim();
    if (summary !== draft.summary) body.summary = summary.trim();
    const documentEdits = changedDocs.map((d) => {
      const e = edits[d.id] ?? {};
      return { id: d.id, ...(e.title !== undefined && e.title !== d.title ? { title: e.title } : {}), ...(e.content !== undefined && e.content !== d.content ? { content: e.content } : {}), ...(e.verified !== undefined && (e.verified !== !!d.verified_at || ((e.content !== undefined && e.content !== d.content || e.title !== undefined && e.title !== d.title) && e.verified)) ? { owner_verified: e.verified } : {}) };
    });
    if (documentEdits.length) body.documents = documentEdits;
    if (excluded.length) body.remove_document_ids = excluded;
    return body;
  }
  async function saveDraft() {
    if (!draft || !dirty || published) return;
    setError("");
    try {
      const updated = await api.patchDraft(draft.id, patchBody());
      qc.setQueryData(api.shareDraftKey(draft.id), updated);
      setNotice("변경 사항을 저장했습니다. 새 digest 를 다시 검토하세요."); setReadConfirm(false);
    } catch (e) {
      apiError(e);
      if (e instanceof ApiError && e.code === "digest_mismatch") setStaleDraft(true);
    }
  }
  async function reloadDraft() {
    if (!draftId) return;
    setTitle(""); setSummary(""); setEdits({}); setExcluded([]); setReadConfirm(false);
    await draftQ.refetch();
  }
  async function publish() {
    if (!draft || dirty || draft.blocked || !readConfirm || published) return;
    setError("");
    try {
      const result = await api.publishDraft(draft.id, draft.preview.digest);
      qc.setQueryData(api.shareDraftKey(draft.id), result.draft);
      setNotice("게시했습니다. 게시된 내용을 기준으로 외부 공유 키를 발급할 수 있습니다."); setReadConfirm(false);
      void qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY });
    } catch (e) {
      apiError(e);
      if (e instanceof ApiError && e.code === "digest_mismatch") { setReadConfirm(false); await draftQ.refetch(); }
    }
  }
  async function issue() {
    if (!selected?.slug || !keyScopes.length || selected.publication?.status !== "active" || keyPendingRef.current) return;
    const requestRoute = routeKey;
    const requestRouteVersion = routeVersionRef.current;
    const canUpdate = () => mountedRef.current && routeRef.current === requestRoute && routeVersionRef.current === requestRouteVersion;
    keyPendingRef.current = true;
    setKeyPending(true);
    setIssued(null); setError("");
    try {
      const k = await api.issueKey({ project_slug: selected.slug, label: keyLabel.trim(), scopes: keyScopes, credential_type: "reusable_api_v2", ttl_days: keyTtl, snapshot_policy: keyPolicy });
      if (!canUpdate()) return;
      setIssued(k); void keysQ.refetch(); void qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY });
    }
    catch (e) { if (canUpdate()) apiError(e); }
    finally { if (canUpdate()) { keyPendingRef.current = false; setKeyPending(false); } }
  }
  async function setSiteEnabled(enabled: boolean) {
    setSitePending(true); setSiteError(""); setSiteNotice("");
    try {
      const updated = await api.patchSite({ enabled });
      qc.setQueryData(api.SHARE_SITE_KEY, updated);
      setSiteNotice(enabled ? "사이트를 다시 열었습니다." : "사이트를 임시로 닫았습니다.");
      setSiteConfirm(false);
    } catch (e) {
      const p = problem(e);
      setSiteError(`사이트 운영 상태를 변경하지 못했습니다.\n${p.title}: ${p.body}`);
    } finally { setSitePending(false); }
  }
  async function issueConsoleKey() {
    if (!consoleProjectSlug || !keyScopes.length || consoleKeyPending) return;
    const requestRoute = routeKey;
    const requestRouteVersion = routeVersionRef.current;
    const canUpdate = () => mountedRef.current && routeRef.current === requestRoute && routeVersionRef.current === requestRouteVersion;
    setConsoleKeyPending(true); setIssued(null); setError(""); setNotice("");
    try {
      const result = await api.issueKey({ project_slug: consoleProjectSlug, label: keyLabel.trim(), scopes: keyScopes });
      if (!canUpdate()) return;
      setIssued(result);
      await consoleKeysQ.refetch();
    } catch (e) { if (canUpdate()) apiError(e); }
    finally { if (canUpdate()) setConsoleKeyPending(false); }
  }
  async function confirmWrite() {
    const action = confirmAction;
    if (!action) return;
    setConfirmAction(null); setError("");
    try {
      if (action.kind === "key" && action.key) {
        const result = await api.revokeKey(action.key.id);
        setNotice(result.status === "revoking" ? "키 폐기 처리 중입니다. Gateway 확인이 끝날 때까지 진행 중으로 표시됩니다." : "키를 폐기했습니다.");
        await Promise.all([keysQ.refetch(), consoleKeysQ.refetch(), qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY })]);
      } else if (action.kind === "project" && selected?.slug) {
        const result = await api.revokeProject(selected.slug);
        setNotice(`스냅샷 ${result.revoked_snapshots}개·키 ${result.revoked_keys}개를 폐기했습니다.`);
        await Promise.all([keysQ.refetch(), consoleKeysQ.refetch(), qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY }), qc.invalidateQueries({ queryKey: ["context-sharing", "links"] })]);
      }
    } catch (e) { apiError(e); }
  }
  async function copyKey() {
    if (!issued) return;
    const copied = issued;
    const requestRoute = routeKey;
    const requestRouteVersion = routeVersionRef.current;
    const canUpdate = () => mountedRef.current && routeRef.current === requestRoute && routeVersionRef.current === requestRouteVersion;
    try { await navigator.clipboard.writeText(copied.key); if (canUpdate()) { setIssued((current) => current === copied ? null : current); setNotice("키를 복사했습니다. 원문은 화면에서 지웠습니다."); } }
    catch { if (canUpdate()) { setIssued((current) => current === copied ? null : current); setError("클립보드에 복사하지 못해 원문을 지웠습니다. 필요하면 새 키를 발급하세요."); } }
  }

  async function copyConnectGuide(k: KeyIssued) {
    const requestRoute = routeKey;
    const requestRouteVersion = routeVersionRef.current;
    const canUpdate = () => mountedRef.current && routeRef.current === requestRoute && routeVersionRef.current === requestRouteVersion;
    try { await navigator.clipboard.writeText(connectGuide(k)); if (canUpdate()) setNotice("연결 예시를 복사했습니다."); }
    catch { if (canUpdate()) setError("연결 예시를 복사하지 못했습니다."); }
  }

  function connectGuide(k: KeyIssued) {
    const base = k.connect.url?.replace(/\/+$/, "");
    const project = k.connect.project_id;
    if (!base || !project) return "연결 정보가 부족합니다. Gateway 주소와 connect.project_id를 확인하세요.";
    const readExample = k.scopes.includes("read")
      ? `curl -H "Authorization: Bearer $CONTEXT_GATEWAY_KEY" \\\n  "$CONTEXT_GATEWAY_URL/api/v1/projects/$GATEWAY_PROJECT_ID/context"`
      : "이 키에는 읽기 권한이 없어 프로젝트 context 조회 예시는 생략했습니다.";
    return `# 키 원문은 설정 파일이나 명령 인자에 넣지 말고 환경변수로 전달하세요.
export CONTEXT_GATEWAY_URL="${base}"
export GATEWAY_PROJECT_ID="${project}"
read -s CONTEXT_GATEWAY_KEY && export CONTEXT_GATEWAY_KEY

# REST · Authorization 헤더
${readExample}

# Claude Code MCP · HTTP transport, 환경변수 치환
{
  "mcpServers": {
    "ttakkari-context": {
      "type": "http",
      "url": "${base}/mcp",
      "headers": { "Authorization": "Bearer \u0024{CONTEXT_GATEWAY_KEY}" }
    }
  }
}`;
  }

  const header = <PageHeader title={projectId ? selected?.name ?? "공유 프로젝트 상세" : "공유 프로젝트"} meta={projectId ? "현재 공개 맥락과 게시 이력을 확인합니다." : "프로젝트의 현재 게시 맥락과 공유 상태를 관리합니다."} actions={<Link className="tk-button tk-button--secondary" to="/context-library">맥락 도서관</Link>} />;

  return <div className="tk-screen share-page">
    {header}
    <main className="tk-screen__body"><div className="tk-container tk-container--lg share-layout">
      {!projectId && <ProjectListView projects={projects} loading={projectsQ.isLoading} error={projectsQ.isError} errorMessage={problem(projectsQ.error).body || problem(projectsQ.error).title} onRetry={refreshProjects} />}
      <details className="share-secondary share-operations">
        <summary>전체 사이트·기존 키 운영</summary>
      <section className="share-section share-ops" aria-label="사이트 운영">
        <div className="share-section-head"><div><h2>공유 사이트</h2><p>전체 외부 조회를 일시 중단하거나 다시 열 수 있습니다.</p></div>
          {siteQ.isLoading ? <span className="share-status share-status--loading" role="status">상태 확인 중</span> : siteQ.data && <span className={`share-status ${siteQ.data.enabled ? "share-status--on" : "share-status--off"}`}>{siteQ.data.enabled ? "외부 공유 열림" : "외부 공유 일시 중단"}</span>}
        </div>
        {siteQ.isError && <div className="share-alert" role="alert"><strong>사이트 운영 상태를 확인하지 못했습니다.</strong><p>{problem(siteQ.error).title}: {problem(siteQ.error).body}</p><button className="tk-button tk-button--secondary" onClick={() => void siteQ.refetch()}>상태 다시 불러오기</button></div>}
        {siteQ.data && <div className="share-site-details">
          <div><span className="share-muted">외부 주소</span><a href={siteQ.data.public_url} target="_blank" rel="noreferrer">{siteQ.data.public_url}</a></div>
          <p>{siteQ.data.enabled ? "현재 외부 요청을 받고 있습니다." : "외부 요청이 중단되어 있습니다. 기존 키와 열린 세션도 조회할 수 없습니다."}</p>
          <button className={`tk-button ${siteQ.data.enabled ? "tk-button--danger" : "tk-button--primary"}`} disabled={sitePending} onClick={() => siteQ.data?.enabled ? setSiteConfirm(true) : void setSiteEnabled(true)}>
            {sitePending ? "처리 중" : siteQ.data.enabled ? "사이트 임시 닫기" : "사이트 다시 열기"}
          </button>
        </div>}
        {siteError && !siteConfirm && <p className="share-alert" role="alert">{siteError}</p>}{siteNotice && <p className="share-notice" role="status">{siteNotice}</p>}
        <Dialog open={siteConfirm} onClose={() => setSiteConfirm(false)} title="사이트를 임시로 닫을까요?" modal>
          <p>기존 키와 이미 열린 세션을 포함해 외부 읽기가 중단됩니다. 이 조작은 키를 폐기하거나 프로젝트 공유를 철회하지 않습니다.</p>
          <p>사이트를 다시 열면 게시 데이터와 각 키의 원래 만료 시각이 유지됩니다. 키 폐기와 프로젝트 공유 철회는 각각 별도 작업입니다.</p>
          {siteError && <p className="share-alert" role="alert">{siteError}</p>}
          <div className="share-actions"><button className="tk-button tk-button--danger" disabled={sitePending} onClick={() => void setSiteEnabled(false)}>{sitePending ? "처리 중" : "닫기 실행"}</button><button className="tk-button tk-button--secondary" disabled={sitePending} onClick={() => setSiteConfirm(false)}>취소</button></div>
        </Dialog>
      </section>
      {!projectId && <>
        <section className="share-section" aria-label="접근 키 관리">
          <div className="share-section-head"><div><h2>접근 키</h2><p>키는 발급 순간에만 원문이 보이며, 만료 시각은 서버 정책을 따릅니다.</p></div></div>
          <div className="share-console-key-form">
            <label className="share-field">발급 대상 프로젝트<select className="tk-field" value={consoleProjectSlug} onChange={(e) => setConsoleKeyProject(e.target.value)} disabled={!issuableProjects.length || projectsQ.isLoading || consoleKeyPending}>
              {projectsQ.isLoading ? <option value="">프로젝트 불러오는 중</option> : !issuableProjects.length && <option value="">게시 중인 프로젝트 없음</option>}{issuableProjects.map((p) => <option key={p.slug} value={p.slug!}>{p.name}</option>)}
            </select></label>
            <label className="share-field">키 이름<input className="tk-field" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} disabled={consoleKeyPending} placeholder="예: Claude Desktop" /></label>
            <fieldset className="share-scopes"><legend>허용 범위</legend>{(["read", "search", "export"] as KeyScope[]).map((s) => <label className="share-check" key={s}><input type="checkbox" checked={keyScopes.includes(s)} disabled={consoleKeyPending} onChange={(e) => setKeyScopes((v) => e.target.checked ? [...v, s] : v.filter((x) => x !== s))} /><span>{s === "read" ? "읽기" : s === "search" ? "검색" : "내보내기"}</span></label>)}</fieldset>
            <button className="tk-button tk-button--primary" disabled={!consoleProjectSlug || !keyScopes.length || consoleKeyPending} onClick={() => void issueConsoleKey()}>{consoleKeyPending ? "발급 중" : "키 발급"}</button>
          </div>
          {issued && <section className="share-issued" aria-label="발급된 키"><strong>원문 키 · 지금 한 번만 보입니다</strong><code>{issued.key}</code><button className="tk-button" onClick={() => void copyKey()}>키 복사</button><button className="tk-button tk-button--secondary" onClick={() => setIssued(null)}>닫기</button></section>}
          {error && <p role="alert" className="share-alert">{error}</p>}
          {consoleKeysQ.isLoading ? <p role="status">키 목록을 불러오는 중</p> : consoleKeysQ.isError ? <div role="alert"><p>{problem(consoleKeysQ.error).body || problem(consoleKeysQ.error).title}</p><button className="tk-button tk-button--secondary" onClick={() => void consoleKeysQ.refetch()}>키 목록 다시 불러오기</button></div> : consoleKeysQ.data && <ul className="share-key-list" aria-label="접근 키 목록">{consoleKeysQ.data.keys.map((k) => <li key={k.id}><div className="share-key-primary"><strong>{k.label || "이름 없는 키"}</strong><span>{projects.find((p) => p.slug === k.project_slug)?.name ?? k.project_slug}</span></div><span className={`share-key-state share-key-state--${k.status}`}>{k.status === "active" ? "활성" : k.status === "expired" ? "만료" : k.status === "revoking" ? "폐기 처리 중" : "폐기됨"}</span><span>만료 {date(k.expires_at)}</span>{k.status === "active" && <button className="tk-button tk-button--secondary" onClick={() => setConfirmAction({ kind: "key", key: k })}>키 폐기: {k.label}</button>}</li>)}</ul>}
        </section>
        <p className="share-agent-hint">“이 프로젝트 맥락 공유해 줘”, “키 발급해 줘”라고 대화에서 맡기면 따까리가 처리합니다.</p>
        <p className="share-site-settings">연결 설정: {projectsQ.isLoading ? "확인 중" : projectsQ.isError ? "확인 실패" : projectsQ.data?.gateway.configured ? "설정됨" : "미설정"} · 연결 설정 진단은 기존 <code>/status</code>이며, 위 사이트 운영 상태와 별도입니다.</p>
      </>}
      </details>
      {projectId && error && <p className="share-alert" role="alert">{error.split("\n").map((line, i) => <span key={`${line}-${i}`}>{line}</span>)}</p>}{notice && <p className="share-notice" role="status">{notice}</p>}
      {projectsQ.data && !projectsQ.data.gateway.configured && <aside className="share-callout"><strong>Context Gateway 연결이 설정되지 않았습니다</strong><p>서버 설정(control 주소·토큰)이 끝나야 게시와 키 발급을 할 수 있습니다. 초안과 검토는 계속할 수 있습니다.</p><p>비어 있는 설정: {projectsQ.data.gateway.missing.join(", ")}</p></aside>}
      {selected && <>
        <ProjectDetailView project={selected} onBack={() => setIssued(null)}>
        {selected.publication?.status === "revoked" && <p className="share-callout">이 프로젝트는 철회됨 상태입니다. 새로 게시하기 전까지 키를 발급할 수 없습니다.</p>}
        {selected.slug && <ShareLinkPanel key={selected.slug} project={selected} />}
        <ProjectApiKeyPanel>
          {!activePublication && <p>{selected.publication?.status === "revoked" ? "철회됨. 새로 게시하기 전까지 키를 발급할 수 없습니다." : "게시한 뒤에 키를 발급할 수 있습니다."}</p>}
          {activePublication && <>
            <p>재사용 API Key · 기본 3일 · 읽기, 검색, 내보내기 권한을 각각 선택할 수 있습니다.</p>
            <label className="share-field">키 이름<input className="tk-field" value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} placeholder="예: Claude Code" /></label>
            <label className="share-field">만료 기간<select className="tk-field" value={keyTtl} onChange={(e) => setKeyTtl(Number(e.target.value) as CredentialTtlDays)}><option value={1}>1일</option><option value={3}>3일 · 기본</option><option value={7}>7일</option><option value={30}>30일</option></select></label>
            <label className="share-field">snapshot 정책<select className="tk-field" value={keyPolicy} onChange={(e) => setKeyPolicy(e.target.value as SnapshotPolicy)}><option value="pinned">현재 snapshot 고정</option><option value="latest">이후 최신 게시물 따라가기</option></select></label>
            <fieldset className="share-scopes"><legend>허용 범위</legend>{(["read", "search", "export"] as KeyScope[]).map((s) => <label className="share-check" key={s}><input type="checkbox" checked={keyScopes.includes(s)} onChange={(e) => setKeyScopes((v) => e.target.checked ? [...v, s] : v.filter((x) => x !== s))} /><span>{s === "read" ? "읽기" : s === "search" ? "검색" : "내보내기"}</span></label>)}</fieldset>
            <button className="tk-button tk-button--primary" disabled={!keyScopes.length || keyPending} onClick={() => void issue()}>{keyPending ? "발급 중" : "재사용 API Key 발급"}</button>
            {issued && <section className="share-issued" aria-label="발급된 키"><strong>원문 키 · 지금 한 번만 보입니다</strong><code>{issued.key}</code><span>만료 {date(issued.expires_at)} · 마지막 사용 {issued.usage_status === "unavailable" ? "사용 기록 확인 불가" : date(issued.last_used_at)}</span><button className="tk-button" onClick={() => void copyKey()}>키 복사 후 원문 지우기</button><button className="tk-button tk-button--secondary" onClick={() => setIssued(null)}>닫기</button>
              <label className="share-field">REST / MCP 연결 설정<textarea aria-label="REST / MCP 연결 설정" readOnly value={connectGuide(issued)} /></label>
              <button className="tk-button tk-button--secondary" onClick={() => void copyConnectGuide(issued)}>연결 예시 복사</button>
              {issued.connect.url && <a href={issued.connect.url} target="_blank" rel="noreferrer">Gateway 주소 확인</a>}
            </section>}
            {keysQ.isLoading && <p role="status">API Key 목록을 불러오는 중</p>}
            {keysQ.isError && <p role="alert">{problem(keysQ.error).body}<button className="tk-button" onClick={() => void keysQ.refetch()}>다시 불러오기</button></p>}
            {keysQ.data && <ul className="share-credential-list" aria-label="발급한 키">{keysQ.data.keys.map((k) => <li key={k.id}><div className="share-key-primary"><strong>{k.label || "이름 없는 키"}</strong><span>{k.credential_type === "single_use_v1" || k.single_use ? "기존 1회용 키" : "재사용 API Key"} · {(k.scopes ?? []).join(" / ") || "권한 확인 불가"} · {k.snapshot_policy === "latest" ? "최신 게시물" : k.snapshot_policy === "pinned" ? `고정 ${k.pinned_snapshot_id ?? "snapshot"}` : "기존 정책"}</span></div><span className={`share-key-state share-key-state--${k.status}`}>{k.status === "active" ? "활성" : k.status === "expired" ? "만료" : k.status === "revoking" ? "폐기 처리 중" : "폐기됨"}</span><span>만료 {date(k.expires_at)}</span><span>마지막 사용 {k.usage_status === "unavailable" ? "사용 기록 확인 불가" : date(k.last_used_at)}</span>{k.status === "active" && <button className="tk-button tk-button--secondary" onClick={() => setConfirmAction({ kind: "key", key: k })}>키 폐기: {k.label}</button>}</li>)}</ul>}
            {selected.slug && <button className="tk-button tk-button--danger" onClick={() => setConfirmAction({ kind: "project" })}>공유 철회</button>}
          </>}
        </ProjectApiKeyPanel>
        <PublicationFlow open={!!draftId}>
        {!draftId && <>
          <section className="share-section"><div className="share-section-head"><div><h2>문서 선택</h2><p>게시할 프로젝트와 문서만 고릅니다. 색인된 조각을 바탕으로 초안이 만들어집니다.</p></div><Link to="/context-library">도서관에서 출처 확인</Link></div>
            {sourcesQ.isLoading ? <p role="status">문서 목록을 불러오는 중</p> : sourcesQ.isError ? <div role="alert"><p>{problem(sourcesQ.error).body || problem(sourcesQ.error).title}</p><button className="tk-button" onClick={() => void sourcesQ.refetch()}>다시 불러오기</button></div> : <>
              {!sourcesQ.data?.sources.some((s) => s.enabled && s.documents.length) && <p>고를 수 있는 문서가 없습니다</p>}
              {sourcesQ.data?.sources.map((s) => <fieldset className="share-source" key={s.source_id}><legend>{s.label} · {scopeLabel(s.scope)}</legend>{!s.enabled && <p>꺼진 출처라 고를 수 없습니다</p>}{s.truncated && <p>출처 결과가 잘렸습니다. 앞 500개만 보입니다.</p>}{s.enabled && s.documents.map((d: SourceDocument) => <label className="share-check" key={d.document_id}><input type="checkbox" checked={selection.includes(d.document_id)} disabled={!selection.includes(d.document_id) && selection.length >= 50} onChange={(e) => setSelection((v) => e.target.checked ? [...v, d.document_id] : v.filter((id) => id !== d.document_id))} /><span><strong>{d.title}</strong><small>{d.logical_path} · {d.chars.toLocaleString()}자 · 색인 {date(d.indexed_at)}</small></span></label>)}</fieldset>)}
              <p className="share-muted">선택 {selection.length}/50</p>
              <label className="share-field">초안 제목<input className="tk-field" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} /></label>
              <label className="share-field">요약<textarea className="tk-field" value={createSummary} onChange={(e) => setCreateSummary(e.target.value)} /></label>
              {workProject && <label className="share-check"><input type="checkbox" checked={confirmWork} onChange={(e) => setConfirmWork(e.target.checked)} /><span>외부 공유 의도 확인 · 회사(work) 범위 문서를 외부에 공유하려는 의도입니다.</span></label>}
              <button className="tk-button tk-button--primary" disabled={!selection.length || (workProject && !confirmWork)} onClick={() => void create()}>초안 만들기</button>
            </>}
          </section>
          <section className="share-section"><h2>이 프로젝트의 초안</h2>{draftsQ.isLoading ? <p role="status">초안을 불러오는 중</p> : draftsQ.isError ? <p role="alert">{problem(draftsQ.error).body}</p> : draftsQ.data?.drafts.length ? <ul className="share-drafts">{draftsQ.data.drafts.map((d) => <li key={d.id}><Link to={draftLink(d.id)}>{d.title} · {d.status === "published" ? "게시됨" : "초안"} · 문서 {d.document_count}개</Link></li>)}</ul> : <p>아직 만든 초안이 없습니다.</p>}</section>
        </>}
        {draftId && draftQ.isLoading && <p role="status">초안을 불러오는 중</p>}
        {draftId && draftQ.isError && <section><p>{problem(draftQ.error).title === "초안을 찾을 수 없습니다" ? "초안을 찾을 수 없습니다" : problem(draftQ.error).body}</p><Link to={`/context-sharing?project=${encodeURIComponent(projectId ?? "")}`}>프로젝트로 돌아가기</Link></section>}
        {draft && <>
          {published && <p className="share-callout">이미 게시한 초안입니다. 게시한 초안은 읽기 전용입니다.</p>}
          {dirty && <p className="share-callout" role="status">저장하지 않은 변경이 있습니다</p>}
          <section className="share-section"><h2>초안 편집</h2>
            <label className="share-field">초안 제목<input className="tk-field" value={title} readOnly={published} onChange={(e) => setTitle(e.target.value)} /></label>
            <label className="share-field">요약<textarea className="tk-field" value={summary} readOnly={published} onChange={(e) => setSummary(e.target.value)} /></label>
            {docs.map((d) => { const e = edits[d.id] ?? {}; const isExcluded = excluded.includes(d.id); const contentWasEdited = (e.content !== undefined && e.content !== d.content) || (e.title !== undefined && e.title !== d.title); const verifiedNow = contentWasEdited ? false : (e.verified ?? !!d.verified_at); return <fieldset className={`share-doc${isExcluded ? " is-excluded" : ""}`} key={d.id} aria-label={d.logical_path}>
              <legend>{d.logical_path}</legend><p><strong>{e.title ?? d.title}</strong> · {d.content_origin === "indexed_chunks" ? "색인 조각 기반" : d.content_origin}</p>
              <p><span>{verifiedNow ? `원본 대조 확인함 · ${date(d.verified_at)}` : "원본 미대조"}</span>{isExcluded && <span>제외 예정</span>}</p>
              {!published && <><button type="button" className="tk-button tk-button--secondary" onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)}>내용 보기·편집</button><button type="button" className="tk-button tk-button--secondary" disabled={visibleDocs.length <= 1} onClick={() => setExcluded((v) => [...v, d.id])}>초안에서 제외</button>{isExcluded && <button type="button" className="tk-button" onClick={() => setExcluded((v) => v.filter((x) => x !== d.id))}>제외 취소</button>}
                <label className="share-check"><input type="checkbox" checked={verifiedNow} onChange={(ev) => setDocEdit(d, "verified", ev.target.checked)} /><span>원본과 대조해 확인함</span></label>
                {openDoc === d.id && <div className="share-doc-editor"><label className="share-field">문서 제목<input className="tk-field" value={e.title ?? d.title} onChange={(ev) => setDocEdit(d, "title", ev.target.value)} /></label><label className="share-field">내용<textarea className="tk-field share-content" value={e.content ?? d.content} onChange={(ev) => setDocEdit(d, "content", ev.target.value)} /></label></div>}
              </>}
            </fieldset>; })}
            {!published && <div className="share-actions"><button className="tk-button tk-button--primary" disabled={!dirty} onClick={() => void saveDraft()}>변경 저장</button><button className="tk-button tk-button--secondary" disabled={!dirty} onClick={() => { setTitle(draft.title); setSummary(draft.summary); setEdits({}); setExcluded([]); }}>변경 되돌리기</button></div>}
          </section>
          {staleDraft && <button className="tk-button" onClick={() => { setStaleDraft(false); void reloadDraft(); }}>내 편집을 버리고 최신 내용 불러오기</button>}
          <section className="share-section" aria-label="게시 전 검토"><h2>게시 전 검토</h2><p>{draft.preview.blocked ? "고위험 항목이 남아 있어 게시할 수 없습니다." : "정규식 탐지는 보조 수단입니다. 게시 전에 본문 전체를 직접 읽어 확인하세요."}</p><p>정규식 탐지는 보조 수단이며, 사람 이름·숫자나 맥락상 비공개 내용을 모두 찾지 못합니다.</p><p><span>고위험 {draft.preview.counts.high}건</span><span>주의 {draft.preview.counts.medium}건</span></p>
            {draft.preview.findings.map((f, i) => <article className="share-finding" key={`${f.rule}-${i}`}><strong>{f.severity === "high" ? "고위험" : "주의"} · {f.category}</strong><p>{f.document_id ? `${docs.find((d) => d.id === f.document_id)?.title ?? "문서"} · ${f.line}행` : f.field}</p><code>{f.excerpt}</code></article>)}
            <ul>{draft.preview.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </section>
          {!published && <section className="share-section" aria-label="게시 승인"><h2>게시 승인</h2><p>승인 대상 digest {draft.preview.digest.slice(0, 12)}</p><label className="share-check"><input type="checkbox" checked={readConfirm} onChange={(e) => setReadConfirm(e.target.checked)} /><span>현재 내용을 읽었고, 이 내용을 외부에 공유해도 됨을 확인합니다.</span></label>
            {!readConfirm && <p>읽었다는 확인이 필요합니다.</p>}{dirty && <p>저장하지 않은 변경이 있어 게시할 수 없습니다.</p>}{unverified.length > 0 && <p>원본 미대조 문서 {unverified.length}개는 verified_at: null 상태로 게시됩니다. 원본 대조와 별개로 아래 게시 승인이 필요합니다.</p>}
            <button className="tk-button tk-button--primary" disabled={!readConfirm || dirty || draft.blocked} onClick={() => void publish()}>게시</button>
          </section>}
        </>}
        </PublicationFlow>
        </ProjectDetailView>
      </>}
      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)} title={confirmAction?.kind === "key" ? "키를 폐기할까요?" : "프로젝트 공유를 철회할까요?"} modal>
        <p>{confirmAction?.kind === "key" ? "이 키로는 더 이상 연결할 수 없습니다." : "게시한 스냅샷과 발급 키를 Gateway 에서 즉시 읽을 수 없게 폐기합니다."}</p>
        <div className="share-actions"><button className="tk-button tk-button--danger" onClick={() => void confirmWrite()}>{confirmAction?.kind === "key" ? "폐기 실행" : "철회 실행"}</button><button className="tk-button tk-button--secondary" onClick={() => setConfirmAction(null)}>취소</button></div>
      </Dialog>
    </div></main>
  </div>;
}
