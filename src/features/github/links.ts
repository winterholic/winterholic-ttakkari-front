import type { GhResolved } from "../../api/githubTypes";

// 이름 규칙은 백엔드 ADR 0042 §7 과 같다. 프론트는 URL 을 만들기 전 한 번 더 걸러 외부로 나가는 주소가 github.com 밖을 향하지 못하게 한다.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const HOSTS = new Set(["github.com", "www.github.com"]);

export const isOwner = (s: string | undefined): s is string => !!s && OWNER_RE.test(s);
export const isRepo = (s: string | undefined): s is string => !!s && REPO_RE.test(s) && s !== "." && s !== ".." && s !== ".git";

/** 본문·상류가 준 링크 중 https://github.com 만 통과시킨다. userinfo·포트·하위 도메인(api.github.com 등)·다른 스킴은 거부. */
export function safeGithubHref(href: string | null | undefined): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname) || u.username || u.password || u.port) return null;
  return u.href;
}

const pathSegs = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export type WebSpec =
  | { kind: "owner"; owner: string }
  | { kind: "repo"; owner: string; repo: string }
  | { kind: "pull" | "issue"; owner: string; repo: string; number: number }
  | { kind: "pulls" | "issues" | "actions"; owner: string; repo: string }
  | { kind: "tree" | "blob"; owner: string; repo: string; ref: string; path?: string }
  | { kind: "actions-run"; owner: string; repo: string; runId: string }
  | { kind: "actions-job"; owner: string; repo: string; runId: string; jobId: string };

/** 라우트 파라미터에서 직접 만든 GitHub 웹 주소. 상류가 준 html_url 이 없거나 검증을 못 넘을 때의 안전한 대체. */
export function githubWebUrl(s: WebSpec): string | null {
  if (!isOwner(s.owner)) return null;
  const base = "https://github.com/" + s.owner;
  if (s.kind === "owner") return base;
  if (!isRepo(s.repo)) return null;
  const repo = base + "/" + s.repo;
  switch (s.kind) {
    case "repo": return repo;
    case "pull": return repo + "/pull/" + s.number;
    case "issue": return repo + "/issues/" + s.number;
    case "pulls": return repo + "/pulls";
    case "issues": return repo + "/issues";
    case "actions": return repo + "/actions";
    case "tree":
    case "blob": return repo + "/" + s.kind + "/" + pathSegs(s.ref) + (s.path ? "/" + pathSegs(s.path) : "");
    case "actions-run": return repo + "/actions/runs/" + encodeURIComponent(s.runId);
    case "actions-job": return repo + "/actions/runs/" + encodeURIComponent(s.runId) + "/job/" + encodeURIComponent(s.jobId);
  }
}

export interface PathSpec {
  owner?: string;
  repo?: string;
  section?: "code" | "pulls" | "issues" | "actions" | "run" | "job";
  number?: number | string;
  ref?: string;
  path?: string;
  runId?: string;
  jobId?: string;
  /** `as` 뒤에 붙는 나머지 쿼리(state·page·tab 등). */
  query?: Record<string, string | number | undefined | null>;
}

/** 앱 안 이동 경로. `as`(선택 계정)는 모든 경로에 붙는다. ref·path 는 슬래시 때문에 경로가 아닌 쿼리로 둔다. */
export function ghPath(account: string, s: PathSpec): string {
  const seg = (v: string | number) => encodeURIComponent(String(v));
  let p = "/github";
  if (s.owner) p += "/" + seg(s.owner);
  if (s.owner && s.repo) {
    p += "/" + seg(s.repo);
    switch (s.section) {
      case "code": p += "/code"; break;
      case "pulls": p += "/pulls" + (s.number !== undefined ? "/" + seg(s.number) : ""); break;
      case "issues": p += "/issues" + (s.number !== undefined ? "/" + seg(s.number) : ""); break;
      case "actions": p += "/actions"; break;
      case "run": p += "/actions/runs/" + seg(s.runId ?? ""); break;
      case "job": p += "/actions/runs/" + seg(s.runId ?? "") + "/jobs/" + seg(s.jobId ?? ""); break;
    }
  }
  const q = new URLSearchParams({ as: account });
  if (s.ref) q.set("ref", s.ref);
  if (s.path) q.set("path", s.path);
  for (const [k, v] of Object.entries(s.query ?? {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return p + "?" + q.toString();
}

/** 쿼리 일부를 바꾼 새 사본. undefined·빈 값은 지운다. */
export function withQuery(p: URLSearchParams, patch: Record<string, string | number | undefined | null>): URLSearchParams {
  const n = new URLSearchParams(p);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") n.delete(k);
    else n.set(k, String(v));
  }
  return n;
}

/** 계정만 바꾸고 나머지 쿼리(ref·path·state…)는 그대로 둔다. */
export function preserveQuery(p: URLSearchParams, account: string): URLSearchParams {
  const n = new URLSearchParams(p);
  n.set("as", account);
  return n;
}

/** README 안 상대 링크를 저장소 루트 기준 경로로 푼다. 스킴이 있거나 `#`뿐이거나 저장소 밖으로 나가면 null. */
export function resolveRelative(baseFile: string, href: string): string | null {
  if (!href || href.startsWith("#") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith("//")) return null;
  const clean = href.replace(/[?#].*$/, "");
  if (!clean) return null;
  const out: string[] = clean.startsWith("/") ? [] : baseFile.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.length ? out.join("/") : null;
}

/** 백엔드 입력 해석 결과로 앱 경로를 만든다. 사용자가 넣은 원본 주소는 쓰지 않는다. */
export function routeForResolved(account: string, r: GhResolved): string {
  const base = { owner: r.owner, repo: r.repo };
  switch (r.kind) {
    case "owner": return ghPath(account, { owner: r.owner });
    case "repo": return ghPath(account, base);
    case "tree":
    case "blob": return ghPath(account, { ...base, section: "code", ref: r.ref, path: r.path });
    case "pull": return ghPath(account, { ...base, section: "pulls", number: r.number });
    case "pulls": return ghPath(account, { ...base, section: "pulls" });
    case "issue": return ghPath(account, { ...base, section: "issues", number: r.number });
    case "issues": return ghPath(account, { ...base, section: "issues" });
    case "actions": return ghPath(account, { ...base, section: "actions" });
    case "run": return ghPath(account, { ...base, section: "run", runId: r.run_id });
    case "job": return ghPath(account, { ...base, section: "job", runId: r.run_id, jobId: r.job_id });
  }
}
