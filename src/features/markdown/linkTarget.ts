/**
 * 마크다운 본문 링크의 대상을 종류별로 가른다. 에이전트는 앱 주소가 아니라 이 Mac 의 경로를 링크로 쓰는 일이 잦아서,
 * 그대로 두면 라우터가 `/Users/...` 를 웹 경로로 처리해 열리지 않는다.
 */

/** App.tsx 의 최상위 라우트. 이 밖의 `/...` 는 파일 경로로 본다(linkTarget.test.ts 가 App.tsx 와 어긋나는지 검사한다). */
export const APP_ROUTE_ROOTS = [
  "login", "chat", "work", "tasks", "workspace", "library", "context-library", "files", "settings", "assistant",
  "more", "notifications", "weather", "resources", "meetings", "pms", "wbs", "checklists", "memos", "calendar", "share",
] as const;

export type LinkTarget =
  | { kind: "anchor"; href: string }
  | { kind: "route"; to: string }
  | { kind: "external"; href: string }
  | { kind: "passthrough"; href: string }
  | { kind: "file"; path: string }
  | { kind: "blocked" };

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const ROUTE_ROOTS: ReadonlySet<string> = new Set(APP_ROUTE_ROOTS);

/** 퍼센트 인코딩을 풀되 깨진 시퀀스(`%` 단독)는 원문을 그대로 쓴다. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** `#섹션`·`#L12` 는 위치 힌트일 뿐 파일 이름이 아니다. 줄 위치로 스크롤하는 기능은 아직 없어 버린다. */
function filePart(s: string): string {
  return safeDecode(s.replace(/#[\s\S]*$/, ""));
}

function fileUrlPath(href: string): string | null {
  const m = /^file:(?:\/\/([^/]*))?(\/.*)?$/i.exec(href);
  if (!m) return null;
  if (m[1] && m[1].toLowerCase() !== "localhost") return null; // 다른 호스트의 파일은 이 서버가 열 수 없다.
  return filePart(m[2] ?? "");
}

export function classifyHref(rawHref: string | undefined | null): LinkTarget {
  const href = (rawHref ?? "").trim();
  if (!href) return { kind: "blocked" };
  if (href.startsWith("#")) return { kind: "anchor", href };
  if (href.startsWith("?")) return { kind: "route", to: href };

  const scheme = SCHEME.exec(href)?.[1].toLowerCase();
  if (scheme === "http" || scheme === "https") return { kind: "external", href };
  if (scheme === "mailto" || scheme === "tel") return { kind: "passthrough", href };
  if (scheme === "file") {
    const path = fileUrlPath(href);
    return path ? { kind: "file", path } : { kind: "blocked" };
  }
  // `util.ts:12` 는 스킴이 아니라 파일:줄이다. 콜론 뒤가 숫자가 아닌 나머지(javascript:, data: ...)는 막는다.
  if (scheme && !/^:\d/.test(href.slice(scheme.length))) return { kind: "blocked" };

  if (href.startsWith("//")) return { kind: "external", href: `https:${href}` };
  if (href === "~" || href.startsWith("~/")) return { kind: "file", path: filePart(href) };
  if (href.startsWith("/")) {
    const root = /^\/([^/?#]*)/.exec(href)?.[1] ?? "";
    return ROUTE_ROOTS.has(root) ? { kind: "route", to: href } : { kind: "file", path: filePart(href) };
  }
  return { kind: "file", path: filePart(href) };
}

/** react-markdown 의 urlTransform. 기본 변환은 `file:` 과 `a.ts:12` 를 지워 버려서 직접 가른다. */
export function linkUrlTransform(url: string): string {
  return classifyHref(url).kind === "blocked" ? "" : url;
}

/** 열고 있는 문서의 폴더 기준 상대 링크를 작업 폴더 기준 경로로 바꾼다. 절대경로·`~`·폴더 정보 없음은 그대로. */
export function joinFromBase(baseDir: string | null | undefined, path: string): string {
  if (!baseDir || path.startsWith("/") || path === "~" || path.startsWith("~/")) return path;
  const out: string[] = [];
  for (const seg of `${baseDir}/${path}`.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      // 작업 폴더 위로 올라가는 경로는 지우지 않고 남겨 백엔드가 거부하게 한다.
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else out.push(seg);
  }
  return out.join("/");
}

export function dirOf(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  const i = relPath.lastIndexOf("/");
  return i > 0 ? relPath.slice(0, i) : null;
}

/** 파일 링크를 열지 못했을 때 사람이 읽을 문장. */
export function fileLinkErrorText(code: string | undefined, fallback: string): string {
  switch (code) {
    case "outside_root":
      return "허용된 폴더 밖의 파일이라 열 수 없어요.";
    case "sensitive":
      return "민감한 파일이라 열 수 없어요.";
    case "not_found":
    case "gone":
      return "파일을 찾을 수 없어요. 옮겨졌거나 지워졌을 수 있어요.";
    case "not_a_file":
      return "폴더나 특수 파일은 열 수 없어요.";
    case "bad_path":
      return "열 수 없는 경로예요.";
    default:
      return fallback;
  }
}
