// 백엔드 api/context_sharing.py·context_sharing/service.py 의 JSON 모양 그대로다. 계약 문서는 back docs/context-sharing-private-contract.md.

export type ShareScope = "personal" | "work" | "shared";
export type KeyScope = "read" | "search" | "export";
export type SnapshotPolicy = "pinned" | "latest";
export type CredentialTtlDays = 1 | 3 | 7 | 30;

export interface GatewayStatus {
  configured: boolean;
  missing: string[];
  problems: string[];
  control_host: string | null;
  public_url: string | null;
}

/** 실제 public Gateway 의 전역 운영 상태. 설정 진단 GatewayStatus 와 별도 API다. */
export interface ShareSiteStatus {
  enabled: boolean;
  public_url: string;
  [key: string]: unknown;
}

export interface Finding {
  rule: string;
  category: "credential" | "personal" | "internal_url" | "local_path";
  severity: "high" | "medium";
  field: "title" | "summary" | "document_title" | "content" | "source_ref";
  document_id: string | null;
  line: number;
  excerpt: string;
}

export interface Preview {
  digest: string;
  blocked: boolean;
  counts: { high: number; medium: number };
  findings: Finding[];
  limitations: string[];
}

export interface Publication {
  id: string;
  status: "active" | "superseded" | "revoked";
  draft_id: string;
  digest: string;
  snapshot_id: string;
  published_at: string;
  revoked_at: string | null;
}

export interface ShareProject {
  entity_id: string;
  name: string;
  aliases: string[];
  summary: string;
  scope: ShareScope;
  source_count: number;
  document_count: number;
  slug: string | null;
  publication: Publication | null;
  active_key_count: number;
  active_link_count?: number;
  last_published_at?: string | null;
}

export interface ProjectsResponse {
  gateway: GatewayStatus;
  projects: ShareProject[];
}

export interface SourceDocument {
  document_id: string;
  title: string;
  logical_path: string;
  chunk_count: number;
  chars: number;
  source_revision: string;
  indexed_at: string | null;
}

export interface SourceGroup {
  source_id: string;
  label: string;
  category: string;
  scope: ShareScope;
  enabled: boolean;
  truncated: boolean;
  documents: SourceDocument[];
}

export interface SourcesResponse {
  entity_id: string;
  name: string;
  scope: ShareScope;
  sources: SourceGroup[];
}

export interface DraftDocument {
  id: string;
  title: string;
  logical_path: string;
  content: string;
  sha256: string;
  source_refs: string[];
  source_revision: string;
  generated_at: string;
  verified_at: string | null;
  verified_by: "owner" | null;
  content_origin: "indexed_chunks";
  edited: boolean;
}

export interface DraftSummary {
  id: string;
  entity_id: string | null;
  project_name: string;
  slug: string;
  title: string;
  summary: string;
  status: "draft" | "published";
  revision: number;
  created_by: "owner" | "agent";
  scope: ShareScope;
  digest: string;
  created_at: string;
  updated_at: string;
  document_count: number;
  blocked: boolean;
  finding_counts: { high: number; medium: number };
  publication: Publication | null;
}

export interface Draft extends DraftSummary {
  documents: DraftDocument[];
  preview: Preview;
}

export interface DraftsResponse {
  drafts: DraftSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface DraftCreateIn {
  entity_id: string;
  document_ids: string[];
  title?: string;
  summary?: string;
  confirm_work_scope?: boolean;
}

export interface DocumentEditIn {
  id: string;
  title?: string;
  content?: string;
  owner_verified?: boolean;
}

export interface DraftPatchIn {
  title?: string;
  summary?: string;
  documents?: DocumentEditIn[];
  remove_document_ids?: string[];
  expected_digest?: string;
}

export interface PublishResult {
  draft: Draft;
  publication: Publication;
}

export interface ShareKey {
  id: string;
  project_slug: string;
  label: string;
  status: "active" | "revoking" | "revoked" | "expired";
  ttl_seconds: number;
  single_use: boolean;
  credential_type?: "single_use_v1" | "reusable_api_v2";
  snapshot_policy?: SnapshotPolicy;
  pinned_snapshot_id?: string | null;
  scopes?: KeyScope[];
  last_used_at?: string | null;
  usage_status?: "available" | "unavailable";
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  publication_id: string;
}

export interface KeyIssueIn {
  project_slug: string;
  label: string;
  scopes: KeyScope[];
  credential_type?: "reusable_api_v2";
  ttl_days?: CredentialTtlDays;
  snapshot_policy?: SnapshotPolicy;
}

/** 원문 키(`key`)가 들어 있는 유일한 응답. 메모리 밖(스토리지·URL·로그·쿼리 캐시)에 두지 않는다. */
export interface KeyIssued extends ShareKey {
  scopes: KeyScope[];
  key: string;
  connect: { url: string | null; project_id: string | null; note: string };
}

export interface ShareLink {
  id: string;
  project_slug: string;
  label: string;
  status: "active" | "revoking" | "revoked" | "expired";
  ttl_seconds: number;
  credential_type: "share_link_v2";
  snapshot_policy: SnapshotPolicy;
  pinned_snapshot_id: string | null;
  scopes: Array<"read" | "export">;
  last_used_at: string | null;
  usage_status: "available" | "unavailable";
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  publication_id: string;
}

/** 원문 URL이 포함되므로 mutation 결과는 절대 query cache에 저장하지 않는다. */
export interface LinkIssued extends ShareLink {
  url: string;
}

export interface LinkIssueIn {
  project_slug: string;
  label: string;
  ttl_days: CredentialTtlDays;
  snapshot_policy: SnapshotPolicy;
  allow_export: boolean;
}

export interface ProjectRevokeResult {
  project_slug: string;
  publication: Publication | null;
  revoked_snapshots: number;
  revoked_keys: number;
  already_revoked: boolean;
}

/** 부분 실패(503/502)에 붙는 진행 상황. 같은 요청을 다시 보내면 남은 것만 이어서 처리된다. */
export interface RevokePartial {
  revoked_snapshots: number;
  remaining_snapshots: number;
  revoked_keys: number;
  remaining_keys: number;
}
