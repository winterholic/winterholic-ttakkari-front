import { extOf } from "../kinds";

/**
 * 뷰어용 가벼운 구문 강조. 파서가 아니라 주석·문자열·숫자·키워드만 칠한다.
 * 클래스는 디자인 시스템의 Prism 매핑(.token.*)을 그대로 쓴다.
 */
export type TokenClass = "comment" | "string" | "number" | "keyword" | "function" | "class-name" | "punctuation";
export interface Token {
  text: string;
  cls?: TokenClass;
}

interface Lang {
  id: string;
  line?: string[];
  block?: [string, string][];
  strings: string[];
  keywords: Set<string>;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const JS_KW = words(`abstract as async await break case catch class const continue debugger declare default delete do else enum export extends
  false finally for from function get if implements import in instanceof interface keyof let new null of private protected public readonly
  return satisfies set static super switch this throw true try type typeof undefined var void while with yield`);
const PY_KW = words(`and as assert async await break class continue def del elif else except False finally for from global if import in is
  lambda None nonlocal not or pass raise return self True try while with yield match case`);
const SH_KW = words("if then else elif fi for while until do done case esac function in return local export readonly set unset true false");
const SQL_KW = words(`select from where and or not insert into values update set delete create table alter drop index join left right inner outer on
  group by order having limit offset as null is in like distinct union all primary key references default returning with`);
const GO_KW = words(`break case chan const continue default defer else fallthrough for func go goto if import interface map package range return
  select struct switch type var nil true false`);
const RUST_KW = words(`as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref
  return self Self static struct super trait true type unsafe use where while`);
const C_KW = words(`auto break case char const continue default do double else enum extern float for goto if int long register return short signed
  sizeof static struct switch typedef union unsigned void volatile while class public private protected new delete this true false null
  namespace using template virtual override final package import extends implements interface throws throw try catch finally boolean byte var
  val fun when object companion data let func guard struct protocol extension self nil`);
const RB_KW = words("def end if elsif else unless while until for in do return class module self nil true false and or not begin rescue ensure yield");

const C_LIKE = { line: ["//"], block: [["/*", "*/"]] as [string, string][] };
const LANGS: Record<string, Lang> = {
  js: { id: "javascript", ...C_LIKE, strings: ['"', "'", "`"], keywords: JS_KW },
  ts: { id: "typescript", ...C_LIKE, strings: ['"', "'", "`"], keywords: JS_KW },
  json: { id: "json", strings: ['"'], keywords: words("true false null") },
  css: { id: "css", block: [["/*", "*/"]], strings: ['"', "'"], keywords: words("important") },
  scss: { id: "scss", ...C_LIKE, strings: ['"', "'"], keywords: words("important") },
  py: { id: "python", line: ["#"], block: [['"""', '"""'], ["'''", "'''"]], strings: ['"', "'"], keywords: PY_KW },
  sh: { id: "shell", line: ["#"], strings: ['"', "'"], keywords: SH_KW },
  yaml: { id: "yaml", line: ["#"], strings: ['"', "'"], keywords: words("true false null yes no") },
  toml: { id: "toml", line: ["#"], strings: ['"', "'"], keywords: words("true false") },
  sql: { id: "sql", line: ["--"], block: [["/*", "*/"]], strings: ["'", '"'], keywords: SQL_KW },
  go: { id: "go", ...C_LIKE, strings: ['"', "'", "`"], keywords: GO_KW },
  rust: { id: "rust", ...C_LIKE, strings: ['"'], keywords: RUST_KW },
  c: { id: "c", ...C_LIKE, strings: ['"', "'"], keywords: C_KW },
  ruby: { id: "ruby", line: ["#"], strings: ['"', "'"], keywords: RB_KW },
};

const EXT: Record<string, keyof typeof LANGS> = {
  js: "js", jsx: "js", mjs: "js", cjs: "js", ts: "ts", tsx: "ts", mts: "ts", cts: "ts", json: "json", jsonc: "js",
  css: "css", scss: "scss", less: "scss", py: "py", pyi: "py", sh: "sh", bash: "sh", zsh: "sh", yml: "yaml", yaml: "yaml",
  toml: "toml", ini: "toml", cfg: "toml", conf: "toml", sql: "sql", go: "go", rs: "rust", c: "c", h: "c", cpp: "c", hpp: "c",
  cc: "c", cs: "c", java: "c", kt: "c", kts: "c", scala: "c", swift: "c", dart: "c", gradle: "c", rb: "ruby", vue: "ts", svelte: "ts",
};

export function languageFor(filename: string): string {
  const key = EXT[extOf(filename)];
  return key ? LANGS[key].id : "plaintext";
}

/** 이보다 길면 칠하지 않는다. 휴대폰에서 수십만 개 span 을 만들지 않기 위해서다. */
export const HIGHLIGHT_MAX_CHARS = 200_000;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compile(lang: Lang): RegExp {
  const parts: string[] = [];
  (lang.block ?? []).forEach(([open, close], i) => {
    // 닫히지 않은 블록은 파일 끝까지 주석·문자열로 본다. 그룹 이름이 겹치면 구형 Safari 가 정규식을 거부한다.
    parts.push(`(?<${open.startsWith("/") ? "bc" : "bs"}${i}>${escapeRe(open)}[\\s\\S]*?(?:${escapeRe(close)}|$(?![\\s\\S])))`);
  });
  if (lang.line?.length) parts.push(`(?<lc>(?:${lang.line.map(escapeRe).join("|")})[^\\n]*)`);
  const str = lang.strings
    .map((q) => (q === "`" ? "`(?:\\\\[\\s\\S]|[^\\\\`])*`?" : `${escapeRe(q)}(?:\\\\.|[^\\\\\\n${escapeRe(q)}])*${escapeRe(q)}?`))
    .join("|");
  parts.push(`(?<s>${str})`);
  parts.push("(?<n>\\b(?:0[xX][\\da-fA-F_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)\\b)");
  parts.push("(?<w>[A-Za-z_$][\\w$]*)");
  parts.push("(?<p>[{}()[\\];,.:=<>+\\-*/%!&|^~?@]+)");
  return new RegExp(parts.join("|"), "g");
}

const compiled = new Map<string, RegExp>();

/** 텍스트를 줄 단위 토큰 배열로 나눈다. 칠하지 않는 경우에도 같은 모양으로 돌려준다. */
export function tokenizeLines(text: string, filename: string): Token[][] {
  const key = EXT[extOf(filename)];
  const lang = key ? LANGS[key] : undefined;
  if (!lang || text.length > HIGHLIGHT_MAX_CHARS) return text.split("\n").map((l) => (l ? [{ text: l }] : []));

  let re = compiled.get(lang.id);
  if (!re) {
    re = compile(lang);
    compiled.set(lang.id, re);
  }
  re.lastIndex = 0;
  const flat: Token[] = [];
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) flat.push({ text: text.slice(last, m.index) });
    const g = m.groups ?? {};
    const hit = Object.keys(g).find((k) => g[k] !== undefined) ?? "";
    let cls: TokenClass | undefined;
    if (hit.startsWith("bc") || hit === "lc") cls = "comment";
    else if (hit.startsWith("bs") || hit === "s") cls = "string";
    else if (g.n !== undefined) cls = "number";
    else if (g.p !== undefined) cls = "punctuation";
    else if (g.w !== undefined) {
      if (lang.keywords.has(g.w)) cls = "keyword";
      else if (text[re.lastIndex] === "(") cls = "function";
      else if (/^[A-Z][a-z]/.test(g.w)) cls = "class-name";
    }
    flat.push({ text: m[0], cls });
    last = re.lastIndex;
  }
  if (last < text.length) flat.push({ text: text.slice(last) });

  // 여러 줄 토큰(블록 주석·템플릿 문자열)은 줄마다 같은 클래스로 나눈다.
  const lines: Token[][] = [[]];
  for (const t of flat) {
    const pieces = t.text.split("\n");
    pieces.forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece) lines[lines.length - 1].push({ text: piece, cls: t.cls });
    });
  }
  return lines;
}
