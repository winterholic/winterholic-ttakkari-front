// GitHub 탐색 API(/api/github) 응답 모양. 정본은 백엔드 `src/ttakkari/github/schemas.py` 와 `tests/fixtures/github/api/*.json`(ADR 0042 §12).
// 상류 JSON 을 그대로 전달하지 않고 화이트리스트 필드만 오므로, 여기에 없는 필드는 화면에서 쓰지 않는다. 값이 없을 수 있는 필드는 `| null`.

export interface GhRate {
  limit: number | null;
  remaining: number | null;
  /** 한도가 초기화되는 시각(Unix 초). */
  reset: number | null;
  resource?: string | null;
  /** 남은 호출이 100 이하. */
  low: boolean;
}

export interface GhPage {
  page: number;
  per_page: number;
  has_more: boolean;
  total_count: number | null;
  /** 상류가 줄 수 있는 상한(PR 파일 3,000개)에 닿음. 목록이 전부가 아니다. */
  limit_hit: boolean;
}

/** 모든 엔드포인트(/accounts·/resolve 제외)의 공통 봉투. */
export interface GhEnvelope<T> {
  data: T;
  page: GhPage | null;
  rate: GhRate | null;
  fetched_at: string;
  cached: boolean;
  /** 상류 실패로 만료된 캐시를 대신 준 경우. */
  stale: boolean;
  account: string;
}

export interface GhAccount {
  login: string;
  host: string;
  /** gh 의 전역 active 계정인지. 참고용이며 선택 기준이 아니다. */
  active: boolean;
  scopes: string[];
  /** "success" 만 쓸 수 있다. */
  state: string;
  token_available?: boolean | null;
  rate?: GhRate | null;
}

/** 봉투 없음. gh 를 못 찾으면 accounts 가 비고 gh_available 이 false 다. */
export interface GhAccounts {
  accounts: GhAccount[];
  gh_available: boolean;
  fetched_at: string;
}

export interface GhUserRef {
  login: string;
  type?: string | null;
  avatar_url?: string | null;
  html_url?: string | null;
}

export type GhResolveKind = "owner" | "repo" | "code" | "pulls" | "pull" | "issues" | "issue" | "actions" | "run" | "job";

/** 봉투 없음. `account` 를 같이 보내면 tree/blob 의 슬래시 든 ref 를 실제 브랜치로 가른다. */
export interface GhResolved {
  kind: GhResolveKind;
  owner: string;
  repo?: string | null;
  number?: number | null;
  run_id?: number | null;
  job_id?: number | null;
  ref?: string | null;
  path?: string | null;
  /** URL 이 blob 이면 true, tree 면 false. */
  is_file?: boolean | null;
  tab?: string | null;
  needs_ref_resolution?: boolean;
  ref_path?: string | null;
}

export interface GhProfile {
  login: string;
  id?: number | null;
  type: "User" | "Organization" | "Bot" | string;
  name: string | null;
  bio: string | null;
  /** 조직의 소개. 사용자는 bio. */
  description: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  avatar_url?: string | null;
  html_url: string | null;
  public_repos: number | null;
  total_private_repos?: number | null;
  followers: number | null;
  following: number | null;
  created_at: string | null;
  /** 지금 선택한 계정 본인. */
  is_viewer: boolean;
}

export interface GhOrg {
  login: string;
  id?: number | null;
  description: string | null;
  avatar_url?: string | null;
}

export interface GhRepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

/** 목록·상세 공통. */
export interface GhRepo {
  id?: number | null;
  name: string;
  full_name: string;
  owner: GhUserRef | null;
  private: boolean;
  visibility: string | null;
  description: string | null;
  fork: boolean;
  archived: boolean;
  disabled: boolean;
  is_template: boolean;
  language: string | null;
  stargazers_count: number | null;
  forks_count: number | null;
  /** 이슈와 PR 을 합친 값(GitHub 정의). */
  open_issues_count: number | null;
  default_branch: string | null;
  pushed_at: string | null;
  updated_at: string | null;
  html_url: string | null;
  homepage: string | null;
  topics: string[];
  license: string | null;
  size_kb: number | null;
  has_issues: boolean | null;
  /** 선택한 계정의 권한. */
  permissions: GhRepoPermissions | null;
}

export interface GhBranch {
  name: string;
  sha: string | null;
  protected: boolean;
  is_default: boolean;
}

export type GhEntryType = "dir" | "file" | "symlink" | "submodule" | "other";

export interface GhEntry {
  name: string;
  path: string;
  type: GhEntryType;
  size: number | null;
  sha: string | null;
  html_url: string | null;
}

export interface GhFile {
  name: string;
  path: string;
  sha: string | null;
  size: number | null;
  html_url: string | null;
  binary: boolean;
  /** 표시 상한(1MiB)을 넘음. truncated 와 함께면 앞부분만 text 에 있고, 단독이면 본문이 없다. */
  too_large: boolean;
  truncated: boolean;
  text: string | null;
  line_count: number | null;
}

export interface GhSubmodule {
  git_url: string | null;
  sha: string | null;
}

/** contents 와 readme 가 같은 모양이다(readme 는 kind 가 항상 file). */
export interface GhContents {
  kind: "dir" | "file" | "symlink" | "submodule";
  path: string;
  ref: string | null;
  entries: GhEntry[] | null;
  /** 디렉터리 상한(1,000개)에 닿음. 목록이 전부가 아닐 수 있다. */
  entries_limit_hit: boolean;
  file: GhFile | null;
  symlink_target: string | null;
  submodule: GhSubmodule | null;
}

export interface GhLabel {
  name: string;
  color?: string | null;
}

export interface GhBranchRef {
  ref: string | null;
  sha: string | null;
  /** 포크면 base 와 다르다. 삭제된 포크는 null. */
  repo_full_name: string | null;
}

export interface GhPullItem {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  merged: boolean;
  user: GhUserRef | null;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  merged_at: string | null;
  head: GhBranchRef | null;
  base: GhBranchRef | null;
  labels: GhLabel[];
  html_url: string | null;
}

export interface GhPull extends GhPullItem {
  body: string | null;
  body_truncated: boolean;
  mergeable: boolean | null;
  /** mergeable 이 null: GitHub 이 아직 계산 중. */
  mergeable_computing: boolean;
  mergeable_state: string | null;
  additions: number | null;
  deletions: number | null;
  changed_files: number | null;
  commits: number | null;
  comments: number | null;
  review_comments: number | null;
  requested_reviewers: GhUserRef[];
  assignees: GhUserRef[];
}

/** ok: patch 있음 / empty: 내용 변경 없음(이름·모드 변경) / unavailable: 이진이거나 GitHub 이 너무 커서 생략 / truncated: 256KiB 에서 자름. */
export type GhPatchState = "ok" | "empty" | "unavailable" | "truncated";

export interface GhPullFile {
  filename: string;
  previous_filename: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  patch_state: GhPatchState;
  blob_url: string | null;
}

export interface GhIssueItem {
  number: number;
  title: string;
  state: string;
  state_reason: string | null;
  locked: boolean;
  user: GhUserRef | null;
  labels: GhLabel[];
  comments: number;
  created_at: string | null;
  updated_at: string | null;
  closed_at: string | null;
  html_url: string | null;
}

export interface GhIssue extends GhIssueItem {
  /** PR 번호를 이슈로 열었으면 "pull"(본문 없이 요약만). */
  kind: "issue" | "pull";
  body: string | null;
  body_truncated: boolean;
  assignees: GhUserRef[];
  milestone: string | null;
  author_association: string | null;
}

export interface GhComment {
  id: number;
  user: GhUserRef | null;
  body: string | null;
  body_truncated: boolean;
  author_association: string | null;
  created_at: string | null;
  updated_at: string | null;
  html_url: string | null;
}

export interface GhRun {
  id: number;
  name: string | null;
  display_title: string | null;
  run_number: number | null;
  run_attempt: number | null;
  event: string | null;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string | null;
  workflow_id?: number | null;
  /** 워크플로 파일 경로. */
  path: string | null;
  actor: GhUserRef | null;
  created_at: string | null;
  run_started_at: string | null;
  updated_at: string | null;
  html_url: string | null;
  /** run 상세에만 있다. */
  triggering_actor?: GhUserRef | null;
  head_commit_message?: string | null;
}

export interface GhStep {
  number: number;
  name: string;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface GhJob {
  id: number;
  run_id: number | null;
  run_attempt: number | null;
  name: string;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  runner_name: string | null;
  labels: string[];
  steps: GhStep[];
  first_failed_step: number | null;
  html_url: string | null;
}

export interface GhLogWindow {
  job_id: number;
  /** 1부터. */
  from_line: number;
  lines: string[];
  total_lines: number;
  next_from_line: number | null;
  /** 글자 수 상한으로 창이 줄었거나 긴 줄을 잘랐음. */
  truncated: boolean;
  /** 서버가 비밀 값을 한 번 더 가렸다는 표시. */
  masked: boolean;
}

export type GhForbiddenReason = "sso_required" | "scope_missing" | "policy";
/** `no_account` 의 reason. 없으면 로그인한 계정이 없는 것이고, 있으면 gh 상태 조회의 일시 실패다(ADR 0042 §13). */
export type GhNoAccountReason = "gh_status_failed";
/** `gh_unprocessable` 의 reason. `/resolve` 에서만 나오며 같은 접두사 ref 가 너무 많아 확인하지 못한 것이다(ADR 0042 §13). */
export type GhUnprocessableReason = "ref_resolution_limit";

/** 백엔드 오류 코드(ADR 0042 §8, §12). 앱 오류 형식 `{code,message,reason?,reset?,retry_after?,sso_url?}` 와 같다. */
export type GhErrorCode =
  | "no_account"
  | "account_unavailable"
  | "invalid_target"
  | "unsupported_host"
  | "ref_not_found"
  | "readme_not_found"
  | "gh_not_found"
  | "gh_forbidden"
  | "gh_auth_expired"
  | "gh_rate_limited"
  | "gh_gone"
  | "gh_unavailable_legal"
  | "gh_unprocessable"
  | "gh_empty_repository"
  | "gh_too_large"
  | "gh_timeout"
  | "gh_upstream_error"
  | "gh_schema_changed"
  | "gh_logs_unavailable";

export type GhPullState = "open" | "closed" | "all";
export type GhIssueState = "open" | "closed" | "all";
