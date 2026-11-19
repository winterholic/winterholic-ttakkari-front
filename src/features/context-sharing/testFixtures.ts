// 테스트 전용 합성 응답. 제품 코드에서 import 하지 않는다(실제 서버 응답이 아니라 계약 문서의 모양을 따른 값이다).
import type { Draft, DraftDocument, GatewayStatus, Preview, Publication, ShareKey, ShareProject, SourcesResponse } from "../../api/contextSharingTypes";

export const GW_OK: GatewayStatus = { configured: true, missing: [], problems: [], control_host: "gateway.example.test", public_url: "https://ctx.example.test" };
export const GW_OFF: GatewayStatus = {
  configured: false, missing: ["context_gateway_control_url", "context_gateway_control_token"], problems: [], control_host: null, public_url: null,
};

export const D1 = "a".repeat(64);
export const D2 = "b".repeat(64);
export const D3 = "c".repeat(64);

export const pub = (o: Partial<Publication> = {}): Publication => ({
  id: "pub1", status: "active", draft_id: "d9", digest: "9".repeat(64), snapshot_id: "snap1",
  published_at: "2026-11-16T01:00:00.000000+00:00", revoked_at: null, ...o,
});

export const ALPHA: ShareProject = {
  entity_id: "e-alpha", name: "Alpha", aliases: [], summary: "알파 요약", scope: "personal",
  source_count: 2, document_count: 2, slug: null, publication: null, active_key_count: 0,
};
export const BETA: ShareProject = {
  entity_id: "e-beta", name: "Beta 회사 프로젝트", aliases: [], summary: "", scope: "work",
  source_count: 1, document_count: 1, slug: "beta", publication: pub(), active_key_count: 1, active_link_count: 2, last_published_at: "2026-11-16T01:00:00.000000+00:00",
};
export const GAMMA: ShareProject = {
  entity_id: "e-gamma", name: "Gamma", aliases: [], summary: "", scope: "shared",
  source_count: 1, document_count: 1, slug: "gamma", publication: pub({ status: "revoked", revoked_at: "2026-11-16T02:00:00.000000+00:00" }), active_key_count: 0,
};

export const ALPHA_SOURCES: SourcesResponse = {
  entity_id: "e-alpha", name: "Alpha", scope: "personal",
  sources: [
    {
      source_id: "s1", label: "alpha-docs", category: "projects", scope: "personal", enabled: true, truncated: false,
      documents: [
        { document_id: "doc-arch", title: "arch.md", logical_path: "docs/arch.md", chunk_count: 3, chars: 3200, source_revision: "r1", indexed_at: "2026-11-10T00:00:00.000000+00:00" },
        { document_id: "doc-plan", title: "plan.md", logical_path: "docs/plan.md", chunk_count: 1, chars: 900, source_revision: "r2", indexed_at: null },
      ],
    },
    { source_id: "s2", label: "old-notes", category: "projects", scope: "personal", enabled: false, truncated: false, documents: [] },
  ],
};

export const BETA_SOURCES: SourcesResponse = {
  entity_id: "e-beta", name: "Beta 회사 프로젝트", scope: "work",
  sources: [
    {
      source_id: "s9", label: "beta-docs", category: "projects", scope: "work", enabled: true, truncated: true,
      documents: [{ document_id: "doc-b1", title: "spec.md", logical_path: "spec.md", chunk_count: 2, chars: 1500, source_revision: "r9", indexed_at: null }],
    },
  ],
};

export const doc = (o: Partial<DraftDocument> = {}): DraftDocument => ({
  id: "x1", title: "arch.md", logical_path: "docs/arch.md", content: "# 구조\n본문", sha256: "1".repeat(64),
  source_refs: ["library:projects/docs/arch.md"], source_revision: "r1", generated_at: "2026-11-16T00:30:00.000000+00:00",
  verified_at: null, verified_by: null, content_origin: "indexed_chunks", edited: false, ...o,
});

export const LIMITATIONS = [
  "정규식 기반 탐지입니다. 회사 기밀, 맥락상 비공개 내용, 사람 이름과 숫자는 자동으로 찾지 못하니 게시 전에 직접 읽어 확인하세요.",
  "본문은 색인된 조각을 이어 붙인 것이라 원본 파일과 다를 수 있습니다.",
  "verified_at 이 비어 있는 문서는 아직 원본과 대조하지 않았습니다. 직접 확인했다면 owner_verified 로 표시하세요.",
];

export const cleanPreview = (digest = D1, o: Partial<Preview> = {}): Preview => ({
  digest, blocked: false, counts: { high: 0, medium: 0 }, findings: [], limitations: LIMITATIONS, ...o,
});

export const draft = (o: Partial<Draft> = {}): Draft => {
  const documents = o.documents ?? [
    doc({ id: "x1", title: "arch.md", logical_path: "docs/arch.md" }),
    doc({ id: "x2", title: "plan.md", logical_path: "docs/plan.md", content: "계획", verified_at: "2026-11-16T00:40:00.000000+00:00", verified_by: "owner" }),
  ];
  const preview = o.preview ?? cleanPreview(o.digest ?? D1);
  return {
    id: "d1", entity_id: "e-alpha", project_name: "Alpha", slug: "alpha", title: "Alpha 프로젝트 맥락", summary: "알파 설명",
    status: "draft", revision: 1, created_by: "owner", scope: "personal", digest: preview.digest,
    created_at: "2026-11-16T00:30:00.000000+00:00", updated_at: "2026-11-16T00:30:00.000000+00:00",
    document_count: documents.length, blocked: preview.blocked, finding_counts: preview.counts, publication: null,
    ...o, documents, preview,
  };
};

export const key = (o: Partial<ShareKey> = {}): ShareKey => ({
  id: "k1", project_slug: "beta", label: "claude 데스크톱", status: "active", ttl_seconds: 3600, single_use: true, credential_type: "single_use_v1", scopes: ["read", "search"], snapshot_policy: "pinned", pinned_snapshot_id: "snap1", last_used_at: null, usage_status: "available",
  issued_at: "2026-11-16T01:10:00.000000+00:00", expires_at: "2026-11-16T02:10:00.000000+00:00", revoked_at: null, publication_id: "pub1", ...o,
});
