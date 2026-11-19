import type { ReactNode } from "react";
import { Link } from "react-router";
import type { ShareProject } from "../../api/contextSharingTypes";

interface ProjectDetailViewProps {
  project: ShareProject;
  children: ReactNode;
  onBack: () => void;
}

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ko-KR") : "확인 전";

export function ProjectDetailView({ project, children, onBack }: ProjectDetailViewProps) {
  const currentSnapshot = project.publication?.status === "active" ? project.publication : null;
  return <section className="share-project-detail" aria-label={`${project.name} 프로젝트 상세`}>
    <nav className="share-back"><Link to="/context-sharing" onClick={onBack}>프로젝트 목록</Link><span>/</span><strong>{project.name}</strong></nav>
    <section className="share-section share-project-summary" aria-label="현재 맥락">
      <div className="share-section-head"><div><h2>현재 맥락</h2><p>{project.summary || "프로젝트 요약이 없습니다."}</p></div>
        <span className="share-status">{currentSnapshot ? "게시 중" : project.publication?.status === "revoked" ? "철회됨" : "게시 전"}</span>
      </div>
      <dl className="share-project-facts">
        <div><dt>현재 스냅샷</dt><dd>{currentSnapshot?.snapshot_id ?? "없음"}</dd></div>
        <div><dt>프로젝트 문서</dt><dd>{project.document_count}개</dd></div>
        <div><dt>활성 공유 링크</dt><dd>{project.active_link_count === undefined ? "확인 불가" : `${project.active_link_count}개`}</dd></div>
        <div><dt>활성 키</dt><dd>{project.active_key_count}개</dd></div>
        <div><dt>마지막 게시</dt><dd>{date(project.last_published_at ?? project.publication?.published_at)}</dd></div>
      </dl>
      {currentSnapshot && <p className="share-muted">게시 snapshot ID: <code>{currentSnapshot.snapshot_id}</code></p>}
    </section>
    {children}
  </section>;
}
