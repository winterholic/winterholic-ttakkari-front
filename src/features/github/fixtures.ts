import type {
  GhAccount, GhBranch, GhComment, GhContent, GhEnvelope, GhIssue, GhIssueItem, GhJob, GhLogWindow, GhOrg, GhProfile, GhPull, GhPullFile, GhPullItem,
  GhRate, GhReadme, GhRepo, GhRepoItem, GhRun,
} from "../../api/githubTypes";

// 화면 테스트와 브라우저 확인용 독립 샘플. 백엔드 fixture(back-github/tests/fixtures/github)가 생기면 필드를 대조해 맞춘다.
// 실제 계정·저장소 이름은 쓰지 않는다.

export const RATE: GhRate = { limit: 5000, remaining: 4973, reset: 1_900_000_000, low: false };

export function envelope<T>(data: T, account = "alice", extra: Partial<GhEnvelope<T>> = {}): GhEnvelope<T> {
  return { data, rate: RATE, fetched_at: "2026-10-18T01:00:00Z", cached: false, account, ...extra };
}

export const ACCOUNTS: GhAccount[] = [
  { login: "alice", host: "github.com", active: true, scopes: ["repo", "read:org", "workflow"], state: "success" },
  { login: "bob-work", host: "github.com", active: false, scopes: ["repo", "read:org"], state: "success" },
];

export const PROFILE: GhProfile = {
  login: "alice", name: "Alice Kim", type: "User", bio: "읽기 전용 샘플 프로필", company: null, location: "Seoul", blog: "https://example.com",
  public_repos: 12, followers: 34, following: 5, created_at: "2019-03-01T00:00:00Z", html_url: "https://github.com/alice",
};
export const ORG_PROFILE: GhProfile = { ...PROFILE, login: "acme-labs", name: "Acme Labs", type: "Organization", bio: "조직 샘플", html_url: "https://github.com/acme-labs" };
export const ORGS: GhOrg[] = [
  { login: "acme-labs", description: "연구 조직", html_url: "https://github.com/acme-labs" },
  { login: "tiny", description: null, html_url: "https://github.com/tiny" },
];

export const repoItem = (over: Partial<GhRepoItem> = {}): GhRepoItem => ({
  owner: "alice", name: "demo", full_name: "alice/demo", description: "데모 저장소", private: false, visibility: "public", fork: false, archived: false,
  language: "TypeScript", stargazers_count: 1200, forks_count: 30, open_issues_count: 4, default_branch: "main",
  pushed_at: "2026-10-17T00:00:00Z", updated_at: "2026-10-17T00:00:00Z", html_url: "https://github.com/alice/demo", ...over,
});
export const REPOS: GhRepoItem[] = [
  repoItem(),
  repoItem({ name: "private-notes", full_name: "alice/private-notes", private: true, visibility: "private", description: null, language: null, stargazers_count: 0, html_url: "https://github.com/alice/private-notes" }),
  repoItem({ name: "a-repository-with-an-extremely-long-name-that-should-wrap-instead-of-overflowing", full_name: "alice/a-repository-with-an-extremely-long-name-that-should-wrap-instead-of-overflowing", archived: true }),
];
export const REPO: GhRepo = { ...repoItem(), homepage: "https://example.com", topics: ["react", "sample"], license: "MIT License", size: 2048, permissions: { admin: true, push: true, pull: true } };

export const BRANCHES: GhBranch[] = [
  { name: "main", protected: true, default: true, sha: "a".repeat(40) },
  { name: "feature/very/long/branch-name-for-mobile-layout-check", protected: false, default: false, sha: "b".repeat(40) },
];

export const DIR_ROOT: GhContent = {
  kind: "dir", path: "", ref: "main",
  entries: [
    { name: "src", path: "src", type: "dir", size: 0, sha: "1".repeat(40) },
    { name: "docs", path: "docs", type: "dir", size: 0, sha: "2".repeat(40) },
    { name: "README.md", path: "README.md", type: "file", size: 640, sha: "3".repeat(40) },
    { name: "a-very-long-file-name-that-keeps-going-and-going-without-any-break-opportunity-at-all-1234567890.config.generated.json", path: "a-very-long-file-name-that-keeps-going-and-going-without-any-break-opportunity-at-all-1234567890.config.generated.json", type: "file", size: 90, sha: "4".repeat(40) },
    { name: "vendor", path: "vendor", type: "submodule", size: 0, sha: "5".repeat(40) },
    { name: "current", path: "current", type: "symlink", size: 7, sha: "6".repeat(40) },
  ],
};

const longLine = "export const veryLongConfigurationValue = " + "'segment-'.repeat(40) + ".repeat(6) + "'end';";
export const codeLines = (n: number): string => Array.from({ length: n }, (_, i) => (i === 3 ? longLine : "const line" + (i + 1) + " = " + (i + 1) + ";")).join("\n");

export const FILE_TEXT: GhContent = {
  kind: "file", path: "src/index.ts", ref: "main", name: "index.ts", size: 4096, sha: "7".repeat(40), binary: false, truncated: false, too_large: false,
  text: codeLines(1000), html_url: "https://github.com/alice/demo/blob/main/src/index.ts",
};
export const FILE_BINARY: GhContent = { ...(FILE_TEXT as object), kind: "file", path: "logo.png", name: "logo.png", binary: true, text: null } as GhContent;
export const FILE_LARGE: GhContent = { ...(FILE_TEXT as object), kind: "file", path: "data/big.json", name: "big.json", size: 5_000_000, too_large: true, text: null } as GhContent;
export const README: GhReadme = {
  path: "README.md", name: "README.md", ref: "main", truncated: false, html_url: "https://github.com/alice/demo/blob/main/README.md",
  text: "# Demo\n\n설명 **굵게** 와 [문서](docs/guide.md), [외부](https://example.org/x), [깃허브](https://github.com/alice/demo/issues)\n\n![로고](https://example.org/logo.png)\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n",
};

export const pullItem = (over: Partial<GhPullItem> = {}): GhPullItem => ({
  number: 12, title: "로그인 화면의 접근성 개선", state: "open", draft: false, merged: false, user: "bob-work", head_ref: "feature/a11y", base_ref: "main",
  comments: 3, labels: [{ name: "ui" }, { name: "needs-review" }], created_at: "2026-10-16T00:00:00Z", updated_at: "2026-10-17T00:00:00Z",
  html_url: "https://github.com/alice/demo/pull/12", ...over,
});
export const PULLS: GhPullItem[] = [
  pullItem(),
  pullItem({ number: 11, title: "머지된 변경", state: "closed", merged: true }),
  pullItem({ number: 10, title: "초안: 아주 긴 제목이 들어가는 경우에도 줄이 넘치지 않고 감싸져야 한다는 것을 확인하기 위한 길고 긴 제목", draft: true }),
];
export const PULL: GhPull = {
  ...pullItem(), body: "변경 설명\n\n- 항목 하나\n- 항목 둘", mergeable: true, mergeable_state: "clean", merged_at: null, closed_at: null,
  additions: 40, deletions: 12, changed_files: 4, commits: 3, head_sha: "c".repeat(40), base_sha: "d".repeat(40),
};

export const PATCH_SMALL = "@@ -1,4 +1,5 @@ function main() {\n context line\n-const old = 1;\n+const next = 2;\n+const extra = 3;\n tail line\n@@ -20,3 +21,3 @@\n keep\n-remove me\n+add me\n keep too";
export const PULL_FILES: GhPullFile[] = [
  { filename: "src/index.ts", status: "modified", additions: 3, deletions: 2, patch: PATCH_SMALL, patch_missing: false },
  { filename: "assets/logo.png", status: "modified", additions: 0, deletions: 0, patch_missing: true },
  { filename: "src/some/really/deeply/nested/directory/structure/that/goes/on/and/on/with-an-extremely-long-component-file-name.test.tsx", previous_filename: "src/old-name.test.tsx", status: "renamed", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new", patch_missing: false },
];

export const issueItem = (over: Partial<GhIssueItem> = {}): GhIssueItem => ({
  number: 7, title: "저장 버튼이 눌리지 않는 문제", state: "open", user: "carol", labels: [{ name: "bug" }], comments: 2,
  created_at: "2026-10-10T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", html_url: "https://github.com/alice/demo/issues/7", ...over,
});
export const ISSUES: GhIssueItem[] = [issueItem(), issueItem({ number: 6, title: "닫힌 이슈", state: "closed", state_reason: "completed" })];
export const ISSUE: GhIssue = { ...issueItem(), kind: "issue", body: "재현 방법:\n\n1. 열기\n2. 누르기\n\n![스크린샷](https://example.org/shot.png)", closed_at: null, assignees: ["alice"] };
export const COMMENTS: GhComment[] = [
  { id: 1, user: "alice", body: "확인했어요. `fix/save` 브랜치에서 고칠게요.", created_at: "2026-10-11T00:00:00Z", updated_at: "2026-10-11T00:00:00Z", author_association: "OWNER", html_url: "https://github.com/alice/demo/issues/7#issuecomment-1" },
  { id: 2, user: "carol", body: "<b>html</b> 은 그대로 글자로 보여야 해요", created_at: "2026-10-12T00:00:00Z", updated_at: "2026-10-12T00:00:00Z", author_association: "NONE", html_url: "https://github.com/alice/demo/issues/7#issuecomment-2" },
];

export const runItem = (over: Partial<GhRun> = {}): GhRun => ({
  id: 9001, name: "CI", display_title: "fix: 저장 버튼", run_number: 41, run_attempt: 1, event: "push", status: "completed", conclusion: "failure",
  head_branch: "main", head_sha: "e".repeat(40), actor: "alice", created_at: "2026-10-17T00:00:00Z", run_started_at: "2026-10-17T00:00:05Z",
  updated_at: "2026-10-17T00:03:00Z", html_url: "https://github.com/alice/demo/actions/runs/9001", ...over,
});
export const RUNS: GhRun[] = [runItem(), runItem({ id: 9000, run_number: 40, conclusion: "success" }), runItem({ id: 9002, run_number: 42, status: "in_progress", conclusion: null })];
export const JOBS: GhJob[] = [
  {
    id: 5001, name: "build (ubuntu-latest, node 22)", status: "completed", conclusion: "failure", started_at: "2026-10-17T00:00:10Z", completed_at: "2026-10-17T00:02:00Z",
    html_url: "https://github.com/alice/demo/actions/runs/9001/job/5001", runner_name: "GitHub Actions 1",
    steps: [
      { number: 1, name: "Set up job", status: "completed", conclusion: "success", started_at: null, completed_at: null },
      { number: 2, name: "Run tests", status: "completed", conclusion: "failure", started_at: null, completed_at: null },
      { number: 3, name: "Post cleanup", status: "completed", conclusion: "skipped", started_at: null, completed_at: null },
    ],
  },
];
export const logWindow = (from: number, count: number, total = 5300): GhLogWindow => ({
  lines: Array.from({ length: count }, (_, i) => "2026-10-17T00:00:" + String((i + from) % 60).padStart(2, "0") + "Z " + (i + from === 3 ? "x".repeat(300) : "log line " + (i + from))),
  total_lines: total, from_line: from, masked: true, truncated: from + count - 1 < total,
});
