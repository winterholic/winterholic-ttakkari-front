import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CredentialTtlDays, LinkIssued, ShareProject, ShareLink, SnapshotPolicy } from "../../api/contextSharingTypes";
import * as api from "../../api/contextSharing";
import { describeShareError } from "./errors";
import { Dialog } from "../../ui/Dialog";

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ko-KR") : "기록 없음";

export function ShareLinkPanel({ project }: { project: ShareProject }) {
  const qc = useQueryClient();
  const slug = project.slug ?? "";
  const [label, setLabel] = useState("");
  const [ttl, setTtl] = useState<CredentialTtlDays>(3);
  const [policy, setPolicy] = useState<SnapshotPolicy>("pinned");
  const [allowExport, setAllowExport] = useState(false);
  const [issued, setIssued] = useState<LinkIssued | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);
  const mountedRef = useRef(true);
  const slugRef = useRef(slug);
  useLayoutEffect(() => { slugRef.current = slug; }, [slug]);
  const linksQ = useQuery({ queryKey: api.shareLinksKey(slug), queryFn: () => api.listLinks(slug), enabled: !!slug });
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const isCurrent = () => mountedRef.current && slugRef.current === slug;

  async function issue() {
    if (!slug || project.publication?.status !== "active" || !label.trim()) return;
    setIssued(null); setError(""); setNotice(""); setPending(true);
    try {
      const result = await api.issueLink({ project_slug: slug, label: label.trim(), ttl_days: ttl, snapshot_policy: policy, allow_export: allowExport });
      // The raw URL is held only in component memory. It is never returned from a query function.
      if (!isCurrent()) return;
      setIssued(result);
      await Promise.all([linksQ.refetch(), qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY })]);
    } catch (e) {
      if (!isCurrent()) return;
      setIssued(null);
      const p = describeShareError(e);
      setError(`${p.title}: ${p.body}`);
    } finally { if (isCurrent()) setPending(false); }
  }

  async function copyUrl() {
    if (!issued) return;
    const copied = issued;
    try {
      await navigator.clipboard.writeText(copied.url);
      if (isCurrent()) { setIssued((current) => current === copied ? null : current); setNotice("링크를 복사했습니다. 원문은 화면에서 지웠습니다."); }
    } catch {
      if (isCurrent()) { setIssued((current) => current === copied ? null : current); setError("클립보드에 복사하지 못해 원문을 지웠습니다. 필요하면 새 링크를 발급하세요."); }
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null); setError(""); setNotice("");
    try {
      await api.revokeLink(target.id);
      if (!isCurrent()) return;
      await Promise.all([linksQ.refetch(), qc.invalidateQueries({ queryKey: api.SHARE_PROJECTS_KEY })]);
      if (isCurrent()) setNotice("링크 폐기를 요청했습니다. 진행 중이면 상태가 ‘폐기 처리 중’으로 표시됩니다.");
    } catch (e) {
      if (!isCurrent()) return;
      const p = describeShareError(e);
      setError(`${p.title}: ${p.body}`);
      if (isCurrent()) await linksQ.refetch();
    }
  }

  const lastUsed = (link: ShareLink) => link.usage_status === "unavailable" ? "사용 기록 확인 불가" : date(link.last_used_at);
  return <section className="share-section share-link-panel" aria-label="사람용 공유 링크">
    <div className="share-section-head"><div><h2>사람용 공유 링크</h2><p>링크를 가진 사람은 인증 입력 없이 반복해서 열 수 있습니다. 링크 URL은 발급 때 한 번만 표시됩니다.</p></div>
      <span className="share-status">활성 공유 링크 {typeof project.active_link_count === "number" ? `${project.active_link_count}개` : "확인 불가"}</span>
    </div>
    <div className="share-credential-form">
      <label className="share-field">링크 이름<input className="tk-field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="예: 기획 검토용" disabled={pending} /></label>
      <label className="share-field">만료 기간<select className="tk-field" value={ttl} onChange={(e) => setTtl(Number(e.target.value) as CredentialTtlDays)} disabled={pending}><option value={1}>1일</option><option value={3}>3일 · 기본</option><option value={7}>7일</option><option value={30}>30일</option></select></label>
      <label className="share-field">공유할 snapshot<select className="tk-field" value={policy} onChange={(e) => setPolicy(e.target.value as SnapshotPolicy)} disabled={pending}><option value="pinned">현재 snapshot 고정</option><option value="latest">이후 최신 게시물 따라가기</option></select></label>
      <label className="share-check"><input type="checkbox" checked={allowExport} onChange={(e) => setAllowExport(e.target.checked)} disabled={pending} /><span>파일 내보내기 허용</span></label>
      <button className="tk-button tk-button--primary" disabled={pending || !label.trim() || project.publication?.status !== "active"} onClick={() => void issue()}>{pending ? "링크 발급 중" : "공유 링크 생성"}</button>
    </div>
    {project.scope === "work" && <p className="share-muted">회사 범위는 조직 공유 정책에 따라 발급이 거절될 수 있습니다.</p>}
    {project.publication?.status !== "active" && <p className="share-muted">게시된 snapshot이 있어야 링크를 만들 수 있습니다.</p>}
    {error && <p className="share-alert" role="alert">{error}</p>}{notice && <p className="share-notice" role="status">{notice}</p>}
    {issued && <section className="share-issued" aria-label="발급된 공유 링크"><strong>원문 링크 · 지금 한 번만 표시됩니다</strong><code>{issued.url}</code><p>만료 {date(issued.expires_at)} · {policy === "pinned" ? "현재 게시물에 고정" : "최신 게시물"}</p><div className="share-actions"><button className="tk-button tk-button--primary" onClick={() => void copyUrl()}>링크 복사 후 원문 지우기</button><button className="tk-button tk-button--secondary" onClick={() => setIssued(null)}>닫기</button></div></section>}
    {linksQ.isLoading ? <p role="status">링크 목록을 불러오는 중</p> : linksQ.isError ? <div role="alert"><p>{describeShareError(linksQ.error).body}</p><button className="tk-button tk-button--secondary" onClick={() => void linksQ.refetch()}>링크 목록 다시 불러오기</button></div> : <ul className="share-credential-list" aria-label="공유 링크 목록">{(linksQ.data?.links ?? []).map((link) => <li key={link.id}>
      <div className="share-key-primary"><strong>{link.label || "이름 없는 링크"}</strong><span>{link.snapshot_policy === "pinned" ? `고정 snapshot ${link.pinned_snapshot_id ?? "확인 불가"}` : "최신 게시물"}{link.scopes.includes("export") ? " · 내보내기 허용" : " · 읽기 전용"}</span></div>
      <span className={`share-key-state share-key-state--${link.status}`}>{link.status === "active" ? "활성" : link.status === "expired" ? "만료" : link.status === "revoking" ? "폐기 처리 중" : "폐기됨"}</span>
      <span>생성 {date(link.issued_at)}</span><span>만료 {date(link.expires_at)}</span><span>마지막 사용 {lastUsed(link)}</span>
      {link.status === "active" && <button className="tk-button tk-button--secondary" onClick={() => setRevokeTarget(link)}>링크 폐기: {link.label}</button>}
    </li>)}</ul>}
    <Dialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="공유 링크를 폐기할까요?" modal><p>이 링크와 그 링크의 읽기 세션만 더 이상 사용할 수 없게 됩니다. 폐기 API 응답이 미확정이면 완료로 표시하지 않습니다.</p><div className="share-actions"><button className="tk-button tk-button--danger" onClick={() => void revoke()}>링크 폐기</button><button className="tk-button tk-button--secondary" onClick={() => setRevokeTarget(null)}>취소</button></div></Dialog>
  </section>;
}
