// GitHub 탐색 API(/api/github) 응답 모양. 백엔드 ADR 0042 §8 계약을 프론트가 읽는 필드만 좁혀 적었다.
// 상류 JSON 을 그대로 전달하지 않고 화이트리스트 필드만 오므로, 여기에 없는 필드는 화면에서 쓰지 않는다.

export interface GhRate {
  limit: number;
  remaining: number;
  /** 한도가 초기화되는 시각(Unix 초). */
  reset: number;
  /** 남은 호출이 적을 때 true. */
  low: boolean;
}

export interface GhPage {
  page: number;
  has_more: boolean;
}

/** 모든 엔드포인트(/accounts·/resolve 제외)의 공통 봉투. */
export interface GhEnvelope<T> {
  data: T;
  page?: GhPage;
  rate: GhRate;
  fetched_at: string;
  cached: boolean;
  /** 상류가 느리거나 실패해 이전 캐시를 대신 준 경우. */
  stale?: boolean;
  account: string;
}

export type GhAccountState = "success" | "error" | "expired" | string;

export interface GhAccount {
  login: string;
  host: string;
  active: boolean;
  scopes: string[];
  state: GhAccountState;
}

export interface GhAccounts {
  data: GhAccount[];
  rate?: GhRate | null;
}

export type GhResolveKind = "owner" | "repo" | "tree" | "blob" | "pull" | "pulls" | "issue" | "issues" | "actions" | "run" | "job";

export interface GhResolved {
  kind: GhResolveKind;
  owner: string;
  repo?: string;
  number?: number;
  ref?: string;
  path?: string;
  run_id?: string;
  job_id?: string;
}

export interface GhProfile {
  login: string;
  name: string | null;
  type: "User" | "Organization";
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string | null;
  html_url: string;
}

export interface GhOrg {
  login: string;
  description: string | null;
  html_url: string;
}

export interface GhRepoItem {
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  visibility: string;
  fork: boolean;
  archived: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  pushed_at: string | null;
  updated_at: string | null;
  html_url: string;
}

export interface GhRepo extends GhRepoItem {
  homepage: string | null;
  topics: string[];
  license: string | null;
  size: number;
  /** 선택한 계정의 권한. */
  permissions: { admin: boolean; push: boolean; pull: boolean };
}

export interface GhBranch {
  name: string;
  protected: boolean;
  default: boolean;
  sha: string;
}

export type GhEntryType = "dir" | "file" | "symlink" | "submodule";

export interface GhEntry {
  name: string;
  path: string;
  type: GhEntryType;
  size: number;
  sha: string;
}

export interface GhDir {
  kind: "dir";
  path: string;
  ref: string;
  entries: GhEntry[];
  /** 디렉터리 항목이 상한(1,000)을 넘어 잘린 경우. */
  truncated?: boolean;
}

export interface GhFile {
  kind: "file";
  path: string;
  ref: string;
  name: string;
  size: number;
  sha: string;
  binary: boolean;
  truncated: boolean;
  too_large: boolean;
  text?: string | null;
  html_url: string;
}

export interface GhSymlink {
  kind: "symlink";
  path: string;
  ref: string;
  name: string;
  target: string | null;
  html_url: string;
}

export interface GhSubmodule {
  kind: "submodule";
  path: string;
  ref: string;
  name: string;
  html_url: string | null;
}

export type GhContent = GhDir | GhFile | GhSymlink | GhSubmodule;

export interface GhReadme {
  path: string;
  name: string;
  ref: string;
  text: string;
  truncated: boolean;
  html_url: string;
}

export interface GhLabel {
  name: string;
}

export interface GhPullItem {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  user: string | null;
  head_ref: string;
  base_ref: string;
  comments: number;
  labels: GhLabel[];
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GhPull extends GhPullItem {
  body: string | null;
  /** 상류가 아직 계산 중이면 "computing". */
  mergeable: boolean | "computing" | null;
  mergeable_state: string | null;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  head_sha: string;
  base_sha: string;
}

export type GhFileStatus = "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged" | string;

export interface GhPullFile {
  filename: string;
  previous_filename?: string | null;
  status: GhFileStatus;
  additions: number;
  deletions: number;
  patch?: string | null;
  /** 이진·대용량 등으로 상류가 patch 를 주지 않은 파일. */
  patch_missing: boolean;
}

export interface GhIssueItem {
  number: number;
  title: string;
  state: "open" | "closed";
  state_reason?: string | null;
  user: string | null;
  labels: GhLabel[];
  comments: number;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GhIssue extends GhIssueItem {
  /** PR 번호를 이슈로 열었으면 "pull". */
  kind: "issue" | "pull";
  body: string | null;
  closed_at: string | null;
  assignees: string[];
  milestone?: string | null;
}

export interface GhComment {
  id: number;
  user: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  author_association: string | null;
  html_url: string;
}

export interface GhRun {
  id: number;
  name: string | null;
  display_title: string | null;
  run_number: number;
  run_attempt: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  head_branch: string | null;
  head_sha: string;
  actor: string | null;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
  html_url: string;
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
  name: string;
  status: string | null;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
  runner_name?: string | null;
  steps: GhStep[];
}

export interface GhLogWindow {
  lines: string[];
  total_lines: number;
  from_line: number;
  /** 서버가 비밀 값을 한 번 더 가렸다는 표시. */
  masked: boolean;
  truncated: boolean;
}

export type GhForbiddenReason = "sso_required" | "scope_missing" | "policy";

/** 백엔드 오류 코드. 앱 오류 형식 `{code,message,reset?,retry_after?,reason?}` 와 같다(ADR 0042 §8). */
export type GhErrorCode =
  | "no_account"
  | "account_unavailable"
  | "invalid_target"
  | "unsupported_host"
  | "gh_not_found"
  | "gh_forbidden"
  | "gh_auth_expired"
  | "gh_rate_limited"
  | "gh_gone"
  | "gh_unavailable_legal"
  | "gh_unprocessable"
  | "gh_too_large"
  | "gh_timeout"
  | "gh_upstream_error"
  | "gh_schema_changed";

export type GhPullState = "open" | "closed" | "all";
export type GhIssueState = "open" | "closed" | "all";
export type GhRunStatus = "queued" | "in_progress" | "completed" | "success" | "failure" | "cancelled";
