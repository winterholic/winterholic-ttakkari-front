import { Link } from "react-router";
import type { ShareProject } from "../../api/contextSharingTypes";

const scopeLabel = (scope: ShareProject["scope"]) => scope === "work" ? "회사" : scope === "shared" ? "공통" : "개인";
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("ko-KR") : "확인 전";

interface ProjectListViewProps {
  projects: ShareProject[];
  loading: boolean;
  error: boolean;
  errorMessage?: string;
  onRetry: () => void;
}

export function ProjectListView({ projects, loading, error, errorMessage, onRetry }: ProjectListViewProps) {
  return <section className="share-section share-project-list" aria-label="프로젝트">
    <div className="share-section-head"><div><h2>프로젝트</h2><p>현재 게시 상태와 공유 범위를 확인하고 프로젝트 상세에서 게시를 관리합니다.</p></div></div>
    {loading && <p role="status">프로젝트를 불러오는 중</p>}
    {error && <div role="alert"><p>{errorMessage}</p><button className="tk-button" onClick={onRetry}>다시 불러오기</button></div>}
    {!loading && !error && projects.length > 0 && <ul className="share-projects" aria-label="프로젝트">{projects.map((project) => {
      const publication = project.publication?.status === "active" ? project.publication : null;
      const postedAt = project.last_published_at ?? project.publication?.published_at;
      return <li key={project.entity_id}><Link to={`/context-sharing?project=${encodeURIComponent(project.entity_id)}`}>
        <strong>{project.name}</strong>
        <span>{scopeLabel(project.scope)}</span>
        <span>문서 {project.document_count}개</span>
        <span>{project.publication?.status === "active" ? "게시 중" : project.publication?.status === "revoked" ? "철회됨" : "게시 전"}</span>
        <span>{publication ? `스냅샷 ${publication.snapshot_id}` : "현재 스냅샷 없음"}</span>
        <span>활성 키 {project.active_key_count}개</span>
        <span>활성 링크 {project.active_link_count === undefined ? "확인 불가" : `${project.active_link_count}개`}</span>
        <span>게시 시각 {postedAt ? date(postedAt) : "없음"}</span>
      </Link></li>;
    })}</ul>}
    {!loading && !error && projects.length === 0 && <><p>공유할 수 있는 프로젝트가 없습니다</p><p><Link to="/context-library" aria-label="맥락 도서관 열기">맥락 도서관에서 출처를 연결하세요.</Link></p></>}
  </section>;
}
