import { ghPath } from "./links";

export interface Crumb {
  label: string;
  /** 마지막(지금 위치) 항목은 링크가 없다. */
  to?: string;
}

const SECTION_LABEL: Record<string, string> = { code: "코드", pulls: "PR", issues: "이슈", actions: "Actions" };

const dec = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** `/github/...` 경로를 위로 올라갈 수 있는 이동 줄로 바꾼다. 항목마다 `as` 가 붙는다. */
export function crumbsFor(pathname: string, account: string): Crumb[] {
  const segs = pathname.split("/").filter(Boolean).slice(1).map(dec);
  const out: Crumb[] = [{ label: "GitHub", to: ghPath(account, {}) }];
  const [owner, repo, section, a] = segs;
  if (owner) out.push({ label: owner, to: ghPath(account, { owner }) });
  if (!owner || !repo) return finish(out);
  out.push({ label: repo, to: ghPath(account, { owner, repo }) });
  if (!section) return finish(out);
  if (section === "actions" && a === "runs") {
    out.push({ label: "Actions", to: ghPath(account, { owner, repo, section: "actions" }) });
    const runId = segs[4];
    const jobId = segs[5] === "jobs" ? segs[6] : undefined;
    if (runId) out.push({ label: "실행 #" + runId, to: ghPath(account, { owner, repo, section: "run", runId }) });
    if (jobId) out.push({ label: "job " + jobId });
    return finish(out);
  }
  out.push({ label: SECTION_LABEL[section] ?? section, to: ghPath(account, { owner, repo, section: section as "code" | "pulls" | "issues" | "actions" }) });
  if (a && (section === "pulls" || section === "issues")) out.push({ label: "#" + a, to: ghPath(account, { owner, repo, section, number: a }) });
  return finish(out);
}

/** 마지막 항목은 지금 위치라 링크를 뗀다. */
function finish(out: Crumb[]): Crumb[] {
  const last = out[out.length - 1];
  return [...out.slice(0, -1), { label: last.label }];
}

/** 헤더 제목: 가장 깊은 저장소·owner 이름. */
export function titleFor(pathname: string): string {
  const [owner, repo] = pathname.split("/").filter(Boolean).slice(1).map(dec);
  if (owner && repo) return owner + "/" + repo;
  return owner ?? "GitHub";
}
