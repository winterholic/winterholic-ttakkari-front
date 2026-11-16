// 맥락 공유 소유자 API(/api/context-sharing). 에이전트 경로(/api/agent/...)는 쓰지 않는다.
// 원문 키는 issueKey 응답에만 있다. 쿼리 캐시(useQuery/useMutation)에 태우지 말고 호출한 쪽이 상태로만 들고 있다가 지운다.
import { json } from "./client";
import type {
  Draft,
  DraftCreateIn,
  DraftPatchIn,
  DraftsResponse,
  KeyIssued,
  KeyIssueIn,
  ProjectRevokeResult,
  ProjectsResponse,
  PublishResult,
  ShareKey,
  SourcesResponse,
} from "./contextSharingTypes";

const B = "/api/context-sharing";

export const SHARE_PROJECTS_KEY = ["context-sharing", "projects"] as const;
export const shareSourcesKey = (entityId: string) => ["context-sharing", "sources", entityId] as const;
export const shareDraftsKey = (entityId: string) => ["context-sharing", "drafts", entityId] as const;
export const shareDraftKey = (id: string) => ["context-sharing", "draft", id] as const;
export const shareKeysKey = (slug: string) => ["context-sharing", "keys", slug] as const;

export const shareProjects = (): Promise<ProjectsResponse> => json(`${B}/projects`);
export const shareSources = (entityId: string): Promise<SourcesResponse> => json(`${B}/projects/${encodeURIComponent(entityId)}/sources`);

export const createDraft = (body: DraftCreateIn): Promise<Draft> => json(`${B}/drafts`, { method: "POST", json: body });
export const listDrafts = (q: { entityId?: string; status?: "draft" | "published"; limit?: number } = {}): Promise<DraftsResponse> =>
  json(`${B}/drafts`, { query: { entity_id: q.entityId, status: q.status, limit: q.limit } });
export const getDraft = (id: string): Promise<Draft> => json(`${B}/drafts/${encodeURIComponent(id)}`);
export const patchDraft = (id: string, body: DraftPatchIn): Promise<Draft> =>
  json(`${B}/drafts/${encodeURIComponent(id)}`, { method: "PATCH", json: body });
export const publishDraft = (id: string, approvedDigest: string): Promise<PublishResult> =>
  json(`${B}/drafts/${encodeURIComponent(id)}/publish`, { method: "POST", json: { approved_digest: approvedDigest } });

export const issueKey = (body: KeyIssueIn): Promise<KeyIssued> => json(`${B}/keys`, { method: "POST", json: body });
export const listKeys = (slug?: string): Promise<{ keys: ShareKey[] }> => json(`${B}/keys`, { query: { project_slug: slug } });
export const revokeKey = (id: string): Promise<ShareKey> => json(`${B}/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
export const revokeProject = (slug: string): Promise<ProjectRevokeResult> =>
  json(`${B}/projects/${encodeURIComponent(slug)}/revoke`, { method: "POST" });
