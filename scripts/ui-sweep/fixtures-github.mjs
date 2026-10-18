// GitHub 탐색(/api/github/*) 레이아웃 검사용 합성 응답. 실제 계정·저장소·토큰을 쓰지 않는다.
// 모양은 백엔드 계약 fixture(back-github tests/fixtures/github/api, schemas.py)를 따르고, 긴 저장소 이름·파일명·코드 줄·diff·로그 줄을 일부러 넣어 모바일 폭의 넘침을 본다.
// 모르는 경로는 undefined 를 돌려 stub.mjs 가 다음 규칙으로 넘긴다.
const rate = { limit: 5000, remaining: 4973, reset: 1900000000, resource: 'core', low: false };
const env = (data, extra = {}) => ({ data, page: null, rate, fetched_at: '2026-10-18T01:00:00Z', cached: false, stale: false, account: 'alice', ...extra });
const more = { page: { page: 1, per_page: 30, has_more: false, total_count: null, limit_hit: false } };
const user = (login) => ({ login, type: 'User', avatar_url: null, html_url: 'https://github.com/' + login });
const LONG = 'a-repository-with-an-extremely-long-name-that-should-wrap-instead-of-overflowing-the-mobile-screen';
const LONG_FILE = 'a-very-long-file-name-that-keeps-going-and-going-without-any-break-opportunity-at-all-1234567890.config.generated.json';
const LONG_PATH = 'src/some/really/deeply/nested/directory/structure/that/goes/on/and/on/with-an-extremely-long-component-file-name.test.tsx';
const repoItem = (name, over = {}) => ({
  id: 10, name, full_name: 'alice/' + name, owner: user('alice'), private: false, visibility: 'public', description: '데모 저장소 설명이 한두 줄 이어지는 경우에도 목록이 깨지지 않아야 해요. '.repeat(2), fork: false,
  archived: false, disabled: false, is_template: false, language: 'TypeScript', stargazers_count: 1200, forks_count: 30, open_issues_count: 4, default_branch: 'main',
  pushed_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z', html_url: 'https://github.com/alice/' + name, homepage: 'https://example.com', topics: ['react', 'sample', 'long-topic-name-for-wrapping-check'],
  license: 'MIT License', size_kb: 2048, has_issues: true, permissions: { admin: true, push: true, pull: true }, ...over,
});
const profile = {
  login: 'alice', id: 1, type: 'User', name: 'Alice Kim', bio: '읽기 전용 샘플 프로필입니다.', description: null, company: null, location: 'Seoul', blog: null, avatar_url: null,
  html_url: 'https://github.com/alice', public_repos: 12, total_private_repos: 3, followers: 1200, following: 5, created_at: '2019-03-01T00:00:00Z', is_viewer: true,
};
const contents = (over) => ({ kind: 'dir', path: '', ref: 'main', entries: null, entries_limit_hit: false, file: null, symlink_target: null, submodule: null, ...over });
const code = (n) => Array.from({ length: n }, (_, i) => (i === 3 ? "export const veryLongConfigurationValue = '" + 'segment-'.repeat(60) + "';" : i % 9 === 0 ? '' : 'const line' + (i + 1) + ' = ' + (i + 1) + ';')).join('\n');
const fileOut = (path, over = {}) => ({ name: path.split('/').pop(), path, sha: '7'.repeat(40), size: 40960, html_url: 'https://github.com/alice/demo/blob/main/' + path, binary: false, too_large: false, truncated: false, text: code(1000), line_count: 1000, ...over });
const patchLines = (n) => '@@ -1,' + n + ' +1,' + n + ' @@ function main() {\n' + Array.from({ length: n }, (_, i) => (i % 3 === 0 ? '-const old' + i + " = '" + 'x'.repeat(i === 3 ? 160 : 12) + "';" : i % 3 === 1 ? '+const next' + i + " = '" + 'y'.repeat(i === 4 ? 160 : 12) + "';" : ' context line ' + i)).join('\n');
const pullItem = (n, title, over = {}) => ({
  number: n, title, state: 'open', draft: false, merged: false, user: user('bob-work'), created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-17T00:00:00Z', closed_at: null, merged_at: null,
  head: { ref: 'feature/very/long/branch-name-for-mobile-layout-check', sha: 'c'.repeat(40), repo_full_name: 'alice/demo' }, base: { ref: 'main', sha: 'd'.repeat(40), repo_full_name: 'alice/demo' },
  labels: [{ name: 'ui', color: '0075ca' }, { name: 'needs-review', color: 'd73a4a' }, { name: 'a-very-long-label-name-that-wraps', color: null }], html_url: 'https://github.com/alice/demo/pull/' + n, ...over,
});
const issueItem = (n, title, over = {}) => ({ number: n, title, state: 'open', state_reason: null, locked: false, user: user('carol'), labels: [{ name: 'bug', color: 'd73a4a' }], comments: 2, created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', closed_at: null, html_url: 'https://github.com/alice/demo/issues/' + n, ...over });
const run = (id, n, conclusion, status = 'completed') => ({
  id, name: 'CI', display_title: 'fix: 저장 버튼이 눌리지 않는 문제를 고치는 아주 긴 커밋 제목 ' + n, run_number: n, run_attempt: 1, event: 'push', status, conclusion, head_branch: 'feature/very/long/branch-name-for-mobile-layout-check',
  head_sha: 'e'.repeat(40), workflow_id: 9, path: '.github/workflows/ci.yml@refs/heads/main', actor: user('alice'), created_at: '2026-10-17T00:00:00Z', run_started_at: '2026-10-17T00:00:05Z', updated_at: '2026-10-17T00:03:00Z',
  html_url: 'https://github.com/alice/demo/actions/runs/' + id,
});
const jobs = [{
  id: 5001, run_id: 9001, run_attempt: 1, name: 'build (ubuntu-latest, node 22, with an unusually long matrix label to check wrapping)', status: 'completed', conclusion: 'failure', started_at: '2026-10-17T00:00:10Z',
  completed_at: '2026-10-17T00:02:00Z', runner_name: 'GitHub Actions 1', labels: ['ubuntu-latest'], first_failed_step: 2, html_url: 'https://github.com/alice/demo/actions/runs/9001/job/5001',
  steps: [
    { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success', started_at: null, completed_at: null },
    { number: 2, name: 'Run tests with a very long step name that should wrap onto several lines on a phone', status: 'completed', conclusion: 'failure', started_at: null, completed_at: null },
    { number: 3, name: 'Post cleanup', status: 'completed', conclusion: 'skipped', started_at: null, completed_at: null },
  ],
}];

export function github(path, search) {
  if (!path.startsWith('github/')) return undefined;
  const q = new URLSearchParams(search ?? '');
  const p = path.slice('github/'.length);
  if (p === 'accounts') return { accounts: [{ login: 'alice', host: 'github.com', active: true, scopes: ['repo', 'read:org', 'workflow'], state: 'success' }, { login: 'bob-work', host: 'github.com', active: false, scopes: ['repo', 'read:org'], state: 'success' }], gh_available: true, fetched_at: '2026-10-18T01:00:00Z' };
  if (p === 'resolve') return { kind: 'repo', owner: 'alice', repo: 'demo' };
  if (p === 'me') return env(profile);
  if (p === 'me/orgs') return env([{ login: 'acme-labs', id: 2, description: '연구 조직', avatar_url: null }, { login: 'tiny', id: 3, description: null, avatar_url: null }]);
  if (p === 'me/repos' || /^owners\/[^/]+\/repos$/.test(p)) return env([repoItem('demo'), repoItem('private-notes', { private: true, visibility: 'private', description: null, language: null }), repoItem(LONG, { archived: true })], more);
  if (/^owners\/[^/]+$/.test(p)) return env({ ...profile, is_viewer: false });
  if (p === 'repos/alice/demo') return env(repoItem('demo'));
  if (p === 'repos/alice/demo/branches') return env([{ name: 'main', sha: 'a'.repeat(40), protected: true, is_default: true }, { name: 'feature/very/long/branch-name-for-mobile-layout-check', sha: 'b'.repeat(40), protected: false, is_default: false }], more);
  if (p === 'repos/alice/demo/readme') {
    const text = '# Demo\n\n설명 **굵게** 와 [문서](docs/guide.md) 와 [외부](https://example.org/x)\n\n| 열 하나 | 열 둘 | 열 셋 | 열 넷 |\n|---|---|---|---|\n| ' + 'long-cell-'.repeat(8) + ' | 2 | 3 | 4 |\n\n```ts\nconst x = ' + "'" + 'long-string-'.repeat(12) + "';\n```\n";
    return env(contents({ kind: 'file', path: 'README.md', ref: null, file: fileOut('README.md', { text, line_count: 10, size: 400 }) }));
  }
  if (p === 'repos/alice/demo/contents') {
    const path = q.get('path') ?? '';
    if (path.endsWith('.png')) return env(contents({ kind: 'file', path, ref: null, file: fileOut(path, { binary: true, text: null, line_count: null, size: 4096 }) }));
    if (path.endsWith('big.json')) return env(contents({ kind: 'file', path, ref: null, file: fileOut(path, { too_large: true, text: null, line_count: null, size: 5000000 }) }));
    if (path.includes('.')) return env(contents({ kind: 'file', path, ref: 'main', file: fileOut(path) }));
    const entry = (name, type, size = 0, p2 = name) => ({ name, path: p2, type, size, sha: '1'.repeat(40), html_url: null });
    return env(contents({
      path, ref: 'main',
      entries: [entry('src', 'dir'), entry('docs', 'dir'), entry('README.md', 'file', 640), entry('index.ts', 'file', 40960, 'src/index.ts'), entry('logo.png', 'file', 4096), entry('big.json', 'file', 5000000), entry(LONG_FILE, 'file', 90), entry('vendor', 'submodule')],
    }));
  }
  if (p === 'repos/alice/demo/pulls') return env([pullItem(12, '로그인 화면의 접근성을 개선하고 아주 긴 제목이 들어가는 경우에도 줄이 넘치지 않고 감싸져야 한다는 것을 확인'), pullItem(11, '머지된 변경', { state: 'closed', merged: true, merged_at: '2026-10-17T00:00:00Z' }), pullItem(10, '초안', { draft: true })], more);
  if (p === 'repos/alice/demo/pulls/12') return env({
    ...pullItem(12, '로그인 화면의 접근성을 개선하고 아주 긴 제목이 들어가는 경우에도 줄이 넘치지 않고 감싸져야 한다는 것을 확인'),
    body: '변경 설명\n\n- 항목 하나\n- 항목 둘\n\n`inline code` 와 링크 [이슈](https://github.com/alice/demo/issues/7)', body_truncated: false, mergeable: true, mergeable_computing: false, mergeable_state: 'clean',
    additions: 140, deletions: 62, changed_files: 4, commits: 3, comments: 3, review_comments: 1, requested_reviewers: [user('rev')], assignees: [],
  });
  if (p === 'repos/alice/demo/pulls/12/files') {
    const f = (filename, over) => ({ filename, previous_filename: null, status: 'modified', additions: 1, deletions: 1, changes: 2, patch: '@@ -1 +1 @@\n-old\n+new', patch_state: 'ok', blob_url: null, ...over });
    return env([
      f('src/index.ts', { additions: 40, deletions: 20, changes: 60, patch: patchLines(30) }),
      f('assets/logo.png', { additions: 0, deletions: 0, changes: 0, patch: null, patch_state: 'unavailable' }),
      f(LONG_PATH, { previous_filename: 'src/old-name.test.tsx', status: 'renamed' }),
      f('docs/new-name.md', { previous_filename: 'docs/old-name.md', status: 'renamed', additions: 0, deletions: 0, changes: 0, patch: null, patch_state: 'empty' }),
    ], more);
  }
  if (p === 'repos/alice/demo/issues') return env([issueItem(7, '저장 버튼이 눌리지 않는 문제와 아주 긴 제목이 들어가는 경우의 줄바꿈 확인'), issueItem(6, '닫힌 이슈', { state: 'closed', state_reason: 'completed', comments: 0 })], more);
  if (p === 'repos/alice/demo/issues/7') {
    return env({
      ...issueItem(7, '저장 버튼이 눌리지 않는 문제와 아주 긴 제목이 들어가는 경우의 줄바꿈 확인'), kind: 'issue', body_truncated: false, assignees: [user('alice')], milestone: 'v1', author_association: 'OWNER',
      body: '재현 방법:\n\n1. 열기\n2. 누르기\n\n![스크린샷](https://example.org/shot.png)\n\n' + 'VeryLongUnbrokenIdentifier_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(3),
    });
  }
  if (p === 'repos/alice/demo/issues/7/comments') return env([
    { id: 1, user: user('alice'), body: '확인했어요. `fix/save` 브랜치에서 고칠게요.', body_truncated: false, author_association: 'OWNER', created_at: '2026-10-11T00:00:00Z', updated_at: '2026-10-11T00:00:00Z', html_url: 'https://github.com/alice/demo/issues/7#issuecomment-1' },
    { id: 2, user: user('carol'), body: '<b>html</b> 은 그대로 글자로 보여야 해요\n\n```\n' + 'x'.repeat(200) + '\n```', body_truncated: false, author_association: 'NONE', created_at: '2026-10-12T00:00:00Z', updated_at: '2026-10-12T00:00:00Z', html_url: 'https://github.com/alice/demo/issues/7#issuecomment-2' },
  ], more);
  if (p === 'repos/alice/demo/actions/runs') return env([run(9001, 41, 'failure'), run(9000, 40, 'success'), run(9002, 42, null, 'in_progress')], more);
  if (/^repos\/alice\/demo\/actions\/runs\/\d+$/.test(p)) return env({ ...run(9001, 41, 'failure'), triggering_actor: user('alice'), head_commit_message: 'fix: 저장 버튼' });
  if (/^repos\/alice\/demo\/actions\/runs\/\d+\/jobs$/.test(p)) return env(jobs, more);
  if (/^repos\/alice\/demo\/actions\/jobs\/\d+\/logs$/.test(p)) {
    const from = Number(q.get('from_line') ?? 1);
    const n = Math.min(2000, 5300 - from + 1);
    const lines = Array.from({ length: n }, (_, i) => '2026-10-17T00:00:' + String((from + i) % 60).padStart(2, '0') + 'Z ' + (i === 2 ? '##[error]' + 'Process completed with exit code 1 '.repeat(8) : from + i === 4 ? 'x'.repeat(400) : 'log line ' + (from + i)));
    return env({ job_id: 5001, from_line: from, lines, total_lines: 5300, next_from_line: from + n <= 5300 ? from + n : null, truncated: false, masked: true });
  }
  return undefined;
}
