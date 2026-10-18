// 백엔드 계약 fixture 의 원문 복사본(back-github tests/fixtures/github/api/*.json @ 42b65d47e81b2d78cf32bd72e0fcac1f6a1c7261).
// 이 값으로 화면을 그려 실제 응답 모양(null 값 포함)에서 깨지지 않는지 본다. 타입 표기가 어긋나면 컴파일이 실패해 계약 변경을 알려 준다.
// 백엔드 fixture 가 바뀌면 이 파일을 다시 복사한다(수정해서 맞추지 않는다).
import type { GhBranch, GhComment, GhContents, GhIssue, GhIssueItem, GhJob, GhOrg, GhProfile, GhPull, GhPullFile, GhPullItem, GhRepo, GhRun } from "../../api/githubTypes";

export const ME: GhProfile = {
  "login": "octo",
  "id": 1,
  "type": "User",
  "name": "Octo Cat",
  "bio": "hello",
  "description": null,
  "company": "@acme",
  "location": "Seoul",
  "blog": "https://octo.example",
  "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
  "html_url": "https://github.com/octo",
  "public_repos": 12,
  "total_private_repos": 3,
  "followers": 5,
  "following": 2,
  "created_at": "2020-01-01T00:00:00Z",
  "is_viewer": true
};

export const ORGS: GhOrg[] = [
  {
    "login": "acme",
    "id": 2,
    "description": "We make things",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"
  },
  {
    "login": "zeta",
    "id": 3,
    "description": null,
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"
  }
];

export const REPOS: GhRepo[] = [
  {
    "id": 10,
    "name": "widget",
    "full_name": "acme/widget",
    "owner": {
      "login": "acme",
      "type": "Organization",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/acme"
    },
    "private": true,
    "visibility": "private",
    "description": "A widget",
    "fork": false,
    "archived": false,
    "disabled": false,
    "is_template": false,
    "language": "Python",
    "stargazers_count": 7,
    "forks_count": 1,
    "open_issues_count": 4,
    "default_branch": "main",
    "pushed_at": "2026-10-17T00:00:00Z",
    "updated_at": "2026-10-17T01:00:00Z",
    "html_url": "https://github.com/acme/widget",
    "homepage": null,
    "topics": [
      "cli",
      "python"
    ],
    "license": "MIT License",
    "size_kb": 1234,
    "has_issues": true,
    "permissions": {
      "admin": false,
      "push": true,
      "pull": true
    }
  },
  {
    "id": 11,
    "name": "gadget",
    "full_name": "acme/gadget",
    "owner": {
      "login": "acme",
      "type": "Organization",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/acme"
    },
    "private": false,
    "visibility": "public",
    "description": "A widget",
    "fork": false,
    "archived": false,
    "disabled": false,
    "is_template": false,
    "language": "Python",
    "stargazers_count": 7,
    "forks_count": 1,
    "open_issues_count": 4,
    "default_branch": "main",
    "pushed_at": "2026-10-17T00:00:00Z",
    "updated_at": "2026-10-17T01:00:00Z",
    "html_url": "https://github.com/acme/widget",
    "homepage": null,
    "topics": [],
    "license": null,
    "size_kb": 1234,
    "has_issues": true,
    "permissions": null
  }
];

export const OWNER_ORG: GhProfile = {
  "login": "acme",
  "id": 1,
  "type": "Organization",
  "name": "Acme Inc",
  "bio": null,
  "description": "We make things",
  "company": null,
  "location": null,
  "blog": null,
  "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
  "html_url": "https://github.com/acme",
  "public_repos": 40,
  "total_private_repos": null,
  "followers": 9,
  "following": 0,
  "created_at": "2019-05-05T00:00:00Z",
  "is_viewer": false
};

export const REPO: GhRepo = {
  "id": 10,
  "name": "widget",
  "full_name": "acme/widget",
  "owner": {
    "login": "acme",
    "type": "Organization",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/acme"
  },
  "private": true,
  "visibility": "private",
  "description": "A widget",
  "fork": false,
  "archived": false,
  "disabled": false,
  "is_template": false,
  "language": "Python",
  "stargazers_count": 7,
  "forks_count": 1,
  "open_issues_count": 4,
  "default_branch": "main",
  "pushed_at": "2026-10-17T00:00:00Z",
  "updated_at": "2026-10-17T01:00:00Z",
  "html_url": "https://github.com/acme/widget",
  "homepage": null,
  "topics": [
    "cli",
    "python"
  ],
  "license": "MIT License",
  "size_kb": 1234,
  "has_issues": true,
  "permissions": {
    "admin": false,
    "push": true,
    "pull": true
  }
};

export const BRANCHES: GhBranch[] = [
  {
    "name": "main",
    "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "protected": true,
    "is_default": true
  },
  {
    "name": "feature/login-ui",
    "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "protected": false,
    "is_default": false
  }
];

export const CONTENTS_DIR: GhContents = {
  "kind": "dir",
  "path": "src",
  "ref": "main",
  "entries": [
    {
      "name": "Util",
      "path": "src/Util",
      "type": "dir",
      "size": 0,
      "sha": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "html_url": "https://github.com/acme/widget/blob/main/src/Util"
    },
    {
      "name": "alpha.py",
      "path": "src/alpha.py",
      "type": "file",
      "size": 20,
      "sha": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "html_url": "https://github.com/acme/widget/blob/main/src/alpha.py"
    },
    {
      "name": "link",
      "path": "src/link",
      "type": "symlink",
      "size": 5,
      "sha": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "html_url": "https://github.com/acme/widget/blob/main/src/link"
    },
    {
      "name": "vendor",
      "path": "src/vendor",
      "type": "submodule",
      "size": 0,
      "sha": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "html_url": "https://github.com/acme/widget/blob/main/src/vendor"
    },
    {
      "name": "zeta.py",
      "path": "src/zeta.py",
      "type": "file",
      "size": 10,
      "sha": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      "html_url": "https://github.com/acme/widget/blob/main/src/zeta.py"
    }
  ],
  "entries_limit_hit": false,
  "file": null,
  "symlink_target": null,
  "submodule": null
};

export const CONTENTS_FILE: GhContents = {
  "kind": "file",
  "path": "src/main.py",
  "ref": "main",
  "entries": null,
  "entries_limit_hit": false,
  "file": {
    "name": "main.py",
    "path": "src/main.py",
    "sha": "1111111111111111111111111111111111111111",
    "size": 25,
    "html_url": "https://github.com/acme/widget/blob/main/src/main.py",
    "binary": false,
    "too_large": false,
    "truncated": false,
    "text": "print('안녕')\nprint(2)\n",
    "line_count": 2
  },
  "symlink_target": null,
  "submodule": null
};

export const CONTENTS_FILE_BINARY: GhContents = {
  "kind": "file",
  "path": "logo.png",
  "ref": null,
  "entries": null,
  "entries_limit_hit": false,
  "file": {
    "name": "logo.png",
    "path": "logo.png",
    "sha": "1111111111111111111111111111111111111111",
    "size": 16,
    "html_url": "https://github.com/acme/widget/blob/main/logo.png",
    "binary": true,
    "too_large": false,
    "truncated": false,
    "text": null,
    "line_count": null
  },
  "symlink_target": null,
  "submodule": null
};

export const CONTENTS_FILE_HUGE: GhContents = {
  "kind": "file",
  "path": "big.log",
  "ref": null,
  "entries": null,
  "entries_limit_hit": false,
  "file": {
    "name": "big.log",
    "path": "big.log",
    "sha": "1111111111111111111111111111111111111111",
    "size": 5242880,
    "html_url": "https://github.com/acme/widget/blob/main/big.log",
    "binary": false,
    "too_large": true,
    "truncated": false,
    "text": null,
    "line_count": null
  },
  "symlink_target": null,
  "submodule": null
};

export const CONTENTS_SYMLINK: GhContents = {
  "kind": "symlink",
  "path": "src/link",
  "ref": null,
  "entries": null,
  "entries_limit_hit": false,
  "file": null,
  "symlink_target": "../README.md",
  "submodule": null
};

export const CONTENTS_SUBMODULE: GhContents = {
  "kind": "submodule",
  "path": "src/vendor",
  "ref": null,
  "entries": null,
  "entries_limit_hit": false,
  "file": null,
  "symlink_target": null,
  "submodule": {
    "git_url": "https://github.com/acme/vendor-lib.git",
    "sha": "3333333333333333333333333333333333333333"
  }
};

export const README: GhContents = {
  "kind": "file",
  "path": "README.md",
  "ref": null,
  "entries": null,
  "entries_limit_hit": false,
  "file": {
    "name": "README.md",
    "path": "README.md",
    "sha": "1111111111111111111111111111111111111111",
    "size": 8,
    "html_url": "https://github.com/acme/widget/blob/main/README.md",
    "binary": false,
    "too_large": false,
    "truncated": false,
    "text": "# Hello\n",
    "line_count": 1
  },
  "symlink_target": null,
  "submodule": null
};

export const PULLS: GhPullItem[] = [
  {
    "number": 7,
    "title": "Add login UI",
    "state": "open",
    "draft": false,
    "merged": false,
    "user": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-02T00:00:00Z",
    "closed_at": null,
    "merged_at": null,
    "head": {
      "ref": "feature/login-ui",
      "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "repo_full_name": "acme/widget"
    },
    "base": {
      "ref": "main",
      "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "repo_full_name": "acme/widget"
    },
    "labels": [
      {
        "name": "bug",
        "color": "d73a4a"
      },
      {
        "name": "ui",
        "color": "0075ca"
      }
    ],
    "html_url": "https://github.com/acme/widget/pull/7"
  },
  {
    "number": 6,
    "title": "Fix typo",
    "state": "closed",
    "draft": false,
    "merged": true,
    "user": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-02T00:00:00Z",
    "closed_at": "2026-09-30T00:00:00Z",
    "merged_at": "2026-09-30T00:00:00Z",
    "head": {
      "ref": "x",
      "sha": "cccccccccccccccccccccccccccccccccccccccc",
      "repo_full_name": null
    },
    "base": {
      "ref": "main",
      "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "repo_full_name": "acme/widget"
    },
    "labels": [],
    "html_url": "https://github.com/acme/widget/pull/7"
  }
];

export const PULL: GhPull = {
  "number": 7,
  "title": "Add login UI",
  "state": "open",
  "draft": false,
  "merged": false,
  "user": {
    "login": "octo",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/octo"
  },
  "created_at": "2026-10-01T00:00:00Z",
  "updated_at": "2026-10-02T00:00:00Z",
  "closed_at": null,
  "merged_at": null,
  "head": {
    "ref": "feature/login-ui",
    "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "repo_full_name": "acme/widget"
  },
  "base": {
    "ref": "main",
    "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "repo_full_name": "acme/widget"
  },
  "labels": [
    {
      "name": "bug",
      "color": "d73a4a"
    },
    {
      "name": "ui",
      "color": "0075ca"
    }
  ],
  "html_url": "https://github.com/acme/widget/pull/7",
  "body": "## Summary\nDoes things",
  "body_truncated": false,
  "mergeable": null,
  "mergeable_computing": true,
  "mergeable_state": "unknown",
  "additions": 120,
  "deletions": 30,
  "changed_files": 4,
  "commits": 3,
  "comments": 2,
  "review_comments": 1,
  "requested_reviewers": [
    {
      "login": "rev",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/rev"
    }
  ],
  "assignees": []
};

export const PULL_FILES: GhPullFile[] = [
  {
    "filename": "src/ui/Login.tsx",
    "previous_filename": null,
    "status": "modified",
    "additions": 10,
    "deletions": 2,
    "changes": 12,
    "patch": "@@ -1,3 +1,4 @@\n a\n-b\n+c\n+d",
    "patch_state": "ok",
    "blob_url": "https://github.com/acme/widget/blob/b/src/ui/Login.tsx"
  },
  {
    "filename": "docs/new-name.md",
    "previous_filename": "docs/old-name.md",
    "status": "renamed",
    "additions": 0,
    "deletions": 0,
    "changes": 0,
    "patch": null,
    "patch_state": "empty",
    "blob_url": null
  },
  {
    "filename": "assets/logo.png",
    "previous_filename": null,
    "status": "added",
    "additions": 0,
    "deletions": 0,
    "changes": 0,
    "patch": null,
    "patch_state": "unavailable",
    "blob_url": null
  },
  {
    "filename": "gen/huge.json",
    "previous_filename": null,
    "status": "modified",
    "additions": 9000,
    "deletions": 10,
    "changes": 9010,
    "patch": null,
    "patch_state": "unavailable",
    "blob_url": null
  },
  {
    "filename": "src/long.ts",
    "previous_filename": null,
    "status": "added",
    "additions": 1,
    "deletions": 0,
    "changes": 1,
    "patch": "@@ -0,0 +1 @@\n+xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…",
    "patch_state": "truncated",
    "blob_url": null
  }
];

export const ISSUES: GhIssueItem[] = [
  {
    "number": 3,
    "title": "Crash on start",
    "state": "open",
    "state_reason": null,
    "locked": false,
    "user": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "labels": [
      {
        "name": "bug",
        "color": "d73a4a"
      },
      {
        "name": "ui",
        "color": "0075ca"
      }
    ],
    "comments": 2,
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-02T00:00:00Z",
    "closed_at": null,
    "html_url": "https://github.com/acme/widget/issues/3"
  },
  {
    "number": 2,
    "title": "Crash on start",
    "state": "closed",
    "state_reason": "completed",
    "locked": false,
    "user": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "labels": [
      {
        "name": "bug",
        "color": "d73a4a"
      },
      {
        "name": "ui",
        "color": "0075ca"
      }
    ],
    "comments": 2,
    "created_at": "2026-10-01T00:00:00Z",
    "updated_at": "2026-10-02T00:00:00Z",
    "closed_at": "2026-10-03T00:00:00Z",
    "html_url": "https://github.com/acme/widget/issues/3"
  }
];

export const ISSUE: GhIssue = {
  "number": 3,
  "title": "Crash on start",
  "state": "open",
  "state_reason": null,
  "locked": false,
  "user": {
    "login": "octo",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/octo"
  },
  "labels": [
    {
      "name": "bug",
      "color": "d73a4a"
    },
    {
      "name": "ui",
      "color": "0075ca"
    }
  ],
  "comments": 2,
  "created_at": "2026-10-01T00:00:00Z",
  "updated_at": "2026-10-02T00:00:00Z",
  "closed_at": null,
  "html_url": "https://github.com/acme/widget/issues/3",
  "kind": "issue",
  "body": "It crashes",
  "body_truncated": false,
  "assignees": [
    {
      "login": "rev",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/rev"
    }
  ],
  "milestone": "v1",
  "author_association": "OWNER"
};

export const ISSUE_AS_PULL: GhIssue = {
  "number": 7,
  "title": "Add login UI",
  "state": "open",
  "state_reason": null,
  "locked": false,
  "user": {
    "login": "octo",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/octo"
  },
  "labels": [
    {
      "name": "bug",
      "color": "d73a4a"
    },
    {
      "name": "ui",
      "color": "0075ca"
    }
  ],
  "comments": 2,
  "created_at": "2026-10-01T00:00:00Z",
  "updated_at": "2026-10-02T00:00:00Z",
  "closed_at": null,
  "html_url": "https://github.com/acme/widget/pull/7",
  "kind": "pull",
  "body": null,
  "body_truncated": false,
  "assignees": [],
  "milestone": null,
  "author_association": null
};

export const ISSUE_COMMENTS: GhComment[] = [
  {
    "id": 301,
    "user": {
      "login": "rev",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/rev"
    },
    "body": "me too",
    "body_truncated": false,
    "author_association": "MEMBER",
    "created_at": "2026-10-02T00:00:00Z",
    "updated_at": "2026-10-02T00:00:00Z",
    "html_url": "https://github.com/acme/widget/issues/3#issuecomment-301"
  },
  {
    "id": 302,
    "user": null,
    "body": null,
    "body_truncated": false,
    "author_association": null,
    "created_at": "2026-10-03T00:00:00Z",
    "updated_at": "2026-10-03T00:00:00Z",
    "html_url": null
  }
];

export const RUNS: GhRun[] = [
  {
    "id": 500,
    "name": "CI",
    "display_title": "Merge pull request #7",
    "run_number": 42,
    "run_attempt": 2,
    "event": "push",
    "status": "completed",
    "conclusion": "failure",
    "head_branch": "main",
    "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "workflow_id": 9,
    "path": ".github/workflows/ci.yml@refs/heads/main",
    "actor": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "created_at": "2026-10-17T00:00:00Z",
    "run_started_at": "2026-10-17T00:00:05Z",
    "updated_at": "2026-10-17T00:10:00Z",
    "html_url": "https://github.com/acme/widget/actions/runs/500"
  },
  {
    "id": 499,
    "name": "CI",
    "display_title": "Merge pull request #7",
    "run_number": 41,
    "run_attempt": 2,
    "event": "push",
    "status": "in_progress",
    "conclusion": null,
    "head_branch": "main",
    "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "workflow_id": 9,
    "path": ".github/workflows/ci.yml@refs/heads/main",
    "actor": {
      "login": "octo",
      "type": "User",
      "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
      "html_url": "https://github.com/octo"
    },
    "created_at": "2026-10-17T00:00:00Z",
    "run_started_at": "2026-10-17T00:00:05Z",
    "updated_at": "2026-10-17T00:10:00Z",
    "html_url": "https://github.com/acme/widget/actions/runs/500"
  }
];

export const RUN: GhRun = {
  "id": 500,
  "name": "CI",
  "display_title": "Merge pull request #7",
  "run_number": 42,
  "run_attempt": 2,
  "event": "push",
  "status": "completed",
  "conclusion": "failure",
  "head_branch": "main",
  "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "workflow_id": 9,
  "path": ".github/workflows/ci.yml@refs/heads/main",
  "actor": {
    "login": "octo",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/octo"
  },
  "created_at": "2026-10-17T00:00:00Z",
  "run_started_at": "2026-10-17T00:00:05Z",
  "updated_at": "2026-10-17T00:10:00Z",
  "html_url": "https://github.com/acme/widget/actions/runs/500",
  "triggering_actor": {
    "login": "rev",
    "type": "User",
    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    "html_url": "https://github.com/rev"
  },
  "head_commit_message": "Merge pull request #7"
};

export const JOBS: GhJob[] = [
  {
    "id": 900,
    "run_id": 500,
    "run_attempt": 2,
    "name": "build",
    "status": "completed",
    "conclusion": "failure",
    "started_at": "2026-10-17T00:00:06Z",
    "completed_at": "2026-10-17T00:09:00Z",
    "runner_name": "GitHub Actions 5",
    "labels": [
      "ubuntu-latest"
    ],
    "steps": [
      {
        "number": 1,
        "name": "Set up job",
        "status": "completed",
        "conclusion": "success",
        "started_at": "s",
        "completed_at": "c"
      },
      {
        "number": 2,
        "name": "Run tests",
        "status": "completed",
        "conclusion": "failure",
        "started_at": "s",
        "completed_at": "c"
      },
      {
        "number": 3,
        "name": "Post",
        "status": "completed",
        "conclusion": "skipped",
        "started_at": null,
        "completed_at": null
      }
    ],
    "first_failed_step": 2,
    "html_url": "https://github.com/acme/widget/actions/runs/500/job/900"
  },
  {
    "id": 901,
    "run_id": 500,
    "run_attempt": 2,
    "name": "lint",
    "status": "completed",
    "conclusion": "success",
    "started_at": "2026-10-17T00:00:06Z",
    "completed_at": "2026-10-17T00:09:00Z",
    "runner_name": "GitHub Actions 5",
    "labels": [
      "ubuntu-latest"
    ],
    "steps": [],
    "first_failed_step": null,
    "html_url": "https://github.com/acme/widget/actions/runs/500/job/900"
  }
];

