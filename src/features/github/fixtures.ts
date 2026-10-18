import type {
  GhAccount, GhBranch, GhComment, GhContents, GhEnvelope, GhFile, GhIssue, GhIssueItem, GhJob, GhLogWindow, GhOrg, GhProfile, GhPull, GhPullFile, GhPullItem,
  GhRate, GhRepo, GhRun, GhUserRef,
} from "../../api/githubTypes";

// 화면 테스트와 브라우저 확인용 독립 샘플. 모양은 백엔드 계약 fixture(back-github/tests/fixtures/github/api/*.json, schemas.py)를 따르고
// 긴 이름·긴 줄 같은 모바일 스트레스 값만 더했다. 실제 계정·저장소 이름은 쓰지 않는다.

export const RATE: GhRate = { limit: 5000, remaining: 4973, reset: 1_900_000_000, resource: "core", low: false };

export function envelope<T>(data: T, account = "alice", extra: Partial<GhEnvelope<T>> = {}): GhEnvelope<T> {
  return { data, page: null, rate: RATE, fetched_at: "2026-10-18T01:00:00Z", cached: false, stale: false, account, ...extra };
}

export const pageOf = (more = false, n = 1) => ({ page: { page: n, per_page: 30, has_more: more, total_count: null, limit_hit: false } });

export const user = (login: string): GhUserRef => ({ login, type: "User", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", html_url: "https://github.com/" + login });

export const ACCOUNTS: GhAccount[] = [
  { login: "alice", host: "github.com", active: true, scopes: ["repo", "read:org", "workflow"], state: "success" },
  { login: "bob-work", host: "github.com", active: false, scopes: ["repo", "read:org"], state: "success" },
];

export const PROFILE: GhProfile = {
  login: "alice", id: 1, type: "User", name: "Alice Kim", bio: "읽기 전용 샘플 프로필", description: null, company: null, location: "Seoul", blog: "https://example.com",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4", html_url: "https://github.com/alice", public_repos: 12, total_private_repos: 3, followers: 34, following: 5,
  created_at: "2019-03-01T00:00:00Z", is_viewer: true,
};
export const ORG_PROFILE: GhProfile = { ...PROFILE, login: "acme-labs", name: "Acme Labs", type: "Organization", bio: null, description: "조직 샘플", html_url: "https://github.com/acme-labs", is_viewer: false };
export const ORGS: GhOrg[] = [
  { login: "acme-labs", id: 2, description: "연구 조직", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
  { login: "tiny", id: 3, description: null, avatar_url: null },
];

export const repoItem = (over: Partial<GhRepo> = {}): GhRepo => ({
  id: 10, name: "demo", full_name: "alice/demo", owner: user("alice"), private: false, visibility: "public", description: "데모 저장소", fork: false, archived: false,
  disabled: false, is_template: false, language: "TypeScript", stargazers_count: 1200, forks_count: 30, open_issues_count: 4, default_branch: "main",
  pushed_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", html_url: "https://github.com/alice/demo", homepage: "https://example.com", topics: ["react", "sample"],
  license: "MIT License", size_kb: 2048, has_issues: true, permissions: { admin: true, push: true, pull: true }, ...over,
});
export const REPOS: GhRepo[] = [
  repoItem(),
  repoItem({ name: "private-notes", full_name: "alice/private-notes", private: true, visibility: "private", description: null, language: null, stargazers_count: 0, html_url: "https://github.com/alice/private-notes" }),
  repoItem({ name: "a-repository-with-an-extremely-long-name-that-should-wrap-instead-of-overflowing", full_name: "alice/a-repository-with-an-extremely-long-name-that-should-wrap-instead-of-overflowing", archived: true }),
];
export const REPO: GhRepo = repoItem();

export const BRANCHES: GhBranch[] = [
  { name: "main", sha: "a".repeat(40), protected: true, is_default: true },
  { name: "feature/very/long/branch-name-for-mobile-layout-check", sha: "b".repeat(40), protected: false, is_default: false },
];

const contents = (over: Partial<GhContents>): GhContents => ({ kind: "dir", path: "", ref: "main", entries: null, entries_limit_hit: false, file: null, symlink_target: null, submodule: null, ...over });

export const DIR_ROOT: GhContents = contents({
  entries: [
    { name: "src", path: "src", type: "dir", size: 0, sha: "1".repeat(40), html_url: null },
    { name: "docs", path: "docs", type: "dir", size: 0, sha: "2".repeat(40), html_url: null },
    { name: "README.md", path: "README.md", type: "file", size: 640, sha: "3".repeat(40), html_url: null },
    { name: "a-very-long-file-name-that-keeps-going-and-going-without-any-break-opportunity-at-all-1234567890.config.generated.json", path: "a-very-long-file-name-that-keeps-going-and-going-without-any-break-opportunity-at-all-1234567890.config.generated.json", type: "file", size: 90, sha: "4".repeat(40), html_url: null },
    { name: "vendor", path: "vendor", type: "submodule", size: 0, sha: "5".repeat(40), html_url: null },
    { name: "current", path: "current", type: "symlink", size: 7, sha: "6".repeat(40), html_url: null },
  ],
});

const longLine = "export const veryLongConfigurationValue = " + "'segment-'.repeat(40) + ".repeat(6) + "'end';";
export const codeLines = (n: number): string => Array.from({ length: n }, (_, i) => (i === 3 ? longLine : "const line" + (i + 1) + " = " + (i + 1) + ";")).join("\n");

export const file = (over: Partial<GhFile> = {}): GhFile => ({
  name: "index.ts", path: "src/index.ts", sha: "7".repeat(40), size: 4096, html_url: "https://github.com/alice/demo/blob/main/src/index.ts",
  binary: false, too_large: false, truncated: false, text: codeLines(1000), line_count: 1000, ...over,
});
export const fileContents = (over: Partial<GhFile> = {}): GhContents => contents({ kind: "file", path: over.path ?? "src/index.ts", file: file(over) });

export const FILE_TEXT: GhContents = fileContents();
export const FILE_BINARY: GhContents = fileContents({ path: "logo.png", name: "logo.png", binary: true, text: null, line_count: null });
export const FILE_LARGE: GhContents = fileContents({ path: "data/big.json", name: "big.json", size: 5_000_000, too_large: true, text: null, line_count: null });

export const README: GhContents = fileContents({
  path: "README.md", name: "README.md", html_url: "https://github.com/alice/demo/blob/main/README.md", line_count: 9,
  text: "# Demo\n\n설명 **굵게** 와 [문서](docs/guide.md), [외부](https://example.org/x), [깃허브](https://github.com/alice/demo/issues)\n\n![로고](https://example.org/logo.png)\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n",
});

export const pullItem = (over: Partial<GhPullItem> = {}): GhPullItem => ({
  number: 12, title: "로그인 화면의 접근성 개선", state: "open", draft: false, merged: false, user: user("bob-work"),
  created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", closed_at: null, merged_at: null,
  head: { ref: "feature/a11y", sha: "c".repeat(40), repo_full_name: "alice/demo" }, base: { ref: "main", sha: "d".repeat(40), repo_full_name: "alice/demo" },
  labels: [{ name: "ui", color: "0075ca" }, { name: "needs-review", color: "d73a4a" }], html_url: "https://github.com/alice/demo/pull/12", ...over,
});
export const PULLS: GhPullItem[] = [
  pullItem(),
  pullItem({ number: 11, title: "머지된 변경", state: "closed", merged: true }),
  pullItem({ number: 10, title: "초안: 아주 긴 제목이 들어가는 경우에도 줄이 넘치지 않고 감싸져야 한다는 것을 확인하기 위한 길고 긴 제목", draft: true }),
];
export const PULL: GhPull = {
  ...pullItem(), body: "변경 설명\n\n- 항목 하나\n- 항목 둘", body_truncated: false, mergeable: true, mergeable_computing: false, mergeable_state: "clean",
  additions: 40, deletions: 12, changed_files: 4, commits: 3, comments: 3, review_comments: 1, requested_reviewers: [user("rev")], assignees: [],
};

export const PATCH_SMALL = "@@ -1,4 +1,5 @@ function main() {\n context line\n-const old = 1;\n+const next = 2;\n+const extra = 3;\n tail line\n@@ -20,3 +21,3 @@\n keep\n-remove me\n+add me\n keep too";
export const pullFile = (over: Partial<GhPullFile> = {}): GhPullFile => ({
  filename: "src/index.ts", previous_filename: null, status: "modified", additions: 3, deletions: 2, changes: 5, patch: PATCH_SMALL, patch_state: "ok", blob_url: "https://github.com/alice/demo/blob/b/src/index.ts", ...over,
});
export const PULL_FILES: GhPullFile[] = [
  pullFile(),
  pullFile({ filename: "assets/logo.png", additions: 0, deletions: 0, changes: 0, patch: null, patch_state: "unavailable", blob_url: null }),
  pullFile({
    filename: "src/some/really/deeply/nested/directory/structure/that/goes/on/and/on/with-an-extremely-long-component-file-name.test.tsx", previous_filename: "src/old-name.test.tsx",
    status: "renamed", additions: 1, deletions: 1, changes: 2, patch: "@@ -1 +1 @@\n-old\n+new", blob_url: null,
  }),
  pullFile({ filename: "docs/new-name.md", previous_filename: "docs/old-name.md", status: "renamed", additions: 0, deletions: 0, changes: 0, patch: null, patch_state: "empty", blob_url: null }),
];

export const issueItem = (over: Partial<GhIssueItem> = {}): GhIssueItem => ({
  number: 7, title: "저장 버튼이 눌리지 않는 문제", state: "open", state_reason: null, locked: false, user: user("carol"), labels: [{ name: "bug", color: "d73a4a" }], comments: 2,
  created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", closed_at: null, html_url: "https://github.com/alice/demo/issues/7", ...over,
});
export const ISSUES: GhIssueItem[] = [issueItem(), issueItem({ number: 6, title: "닫힌 이슈", state: "closed", state_reason: "completed" })];
export const ISSUE: GhIssue = {
  ...issueItem(), kind: "issue", body: "재현 방법:\n\n1. 열기\n2. 누르기\n\n![스크린샷](https://example.org/shot.png)", body_truncated: false,
  assignees: [user("alice")], milestone: "v1", author_association: "OWNER",
};
export const COMMENTS: GhComment[] = [
  { id: 1, user: user("alice"), body: "확인했어요. `fix/save` 브랜치에서 고칠게요.", body_truncated: false, created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", author_association: "OWNER", html_url: "https://github.com/alice/demo/issues/7#issuecomment-1" },
  { id: 2, user: user("carol"), body: "<b>html</b> 은 그대로 글자로 보여야 해요", body_truncated: false, created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-12T00:00:00Z", author_association: "NONE", html_url: "https://github.com/alice/demo/issues/7#issuecomment-2" },
];

export const runItem = (over: Partial<GhRun> = {}): GhRun => ({
  id: 9001, name: "CI", display_title: "fix: 저장 버튼", run_number: 41, run_attempt: 1, event: "push", status: "completed", conclusion: "failure",
  head_branch: "main", head_sha: "e".repeat(40), workflow_id: 9, path: ".github/workflows/ci.yml@refs/heads/main", actor: user("alice"), created_at: "2026-10-17T00:00:00Z",
  run_started_at: "2026-10-17T00:00:05Z", updated_at: "2026-10-17T00:03:00Z", html_url: "https://github.com/alice/demo/actions/runs/9001", ...over,
});
export const RUNS: GhRun[] = [runItem(), runItem({ id: 9000, run_number: 40, conclusion: "success" }), runItem({ id: 9002, run_number: 42, status: "in_progress", conclusion: null })];
export const JOBS: GhJob[] = [
  {
    id: 5001, run_id: 9001, run_attempt: 1, name: "build (ubuntu-latest, node 22)", status: "completed", conclusion: "failure", started_at: "2026-10-17T00:00:10Z", completed_at: "2026-10-17T00:02:00Z",
    runner_name: "GitHub Actions 1", labels: ["ubuntu-latest"], first_failed_step: 2, html_url: "https://github.com/alice/demo/actions/runs/9001/job/5001",
    steps: [
      { number: 1, name: "Set up job", status: "completed", conclusion: "success", started_at: null, completed_at: null },
      { number: 2, name: "Run tests", status: "completed", conclusion: "failure", started_at: null, completed_at: null },
      { number: 3, name: "Post cleanup", status: "completed", conclusion: "skipped", started_at: null, completed_at: null },
    ],
  },
];
export const logWindow = (from: number, count: number, total = 5300): GhLogWindow => ({
  job_id: 5001, from_line: from, total_lines: total, masked: true, truncated: false,
  next_from_line: from + count - 1 < total ? from + count : null,
  lines: Array.from({ length: count }, (_, i) => "2026-10-17T00:00:" + String((i + from) % 60).padStart(2, "0") + "Z " + (i + from === 3 ? "x".repeat(300) : "log line " + (i + from))),
});
