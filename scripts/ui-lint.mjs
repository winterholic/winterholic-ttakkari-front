// 앱 CSS·TSX 의 UI 계약 lint(기준선 방식).
// 규칙은 디자인 시스템 docs/22-ui-error-prevention.md 와 같다. 이미 있던 위반은 scripts/ui-lint.baseline.json 에 파일·규칙별 개수로 두고,
// 그 개수를 넘기거나 새 파일에 생기면 실패한다(= 새로 늘어나지 않는다). 고치면 --update 로 기준선을 낮춘다.
//   node scripts/ui-lint.mjs            검사
//   node scripts/ui-lint.mjs --update   기준선을 현재 값으로(줄어들 때만 쓴다)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'ui-lint.baseline.json');
const update = process.argv.includes('--update');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === 'vendor' || n === 'node_modules' ? [] : walk(p);
  return [p];
});
const files = walk(join(root, 'src'));
// 앱 코드가 쓰는 var(--tk-*) 가 디자인 시스템에 실제로 있는지 본다. 없는 토큰은 조용히 무효가 되어 padding·line-height 가 사라진다(예: --tk-space-7, 날씨 빈 상태).
const defined = new Set();
for (const f of walk(join(root, 'src', 'vendor')).filter((p) => p.endsWith('.css'))) for (const m of readFileSync(f, 'utf8').matchAll(/(--tk-[\w-]+)\s*:/g)) defined.add(m[1]);
// 런타임이 style 로 넣는 변수(Select 높이, 스크롤 힌트 등)와 컴포넌트 사유 변수(--tk-_*)는 정의가 CSS 밖에 있다
const RUNTIME_TOKENS = new Set(['--tk-select-room', '--tk-pan-x', '--tk-pan-y', '--tk-progress']);
const undefinedTokens = (text) => [...text.matchAll(/var\((--tk-[\w-]+)/g)].filter((m) => !m[1].startsWith('--tk-_') && !RUNTIME_TOKENS.has(m[1]) && !defined.has(m[1])).length;
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, 'url()');

const RULES = {
  // 값은 토큰으로
  hex: (body) => (body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length,
  'px-literal': (body) => (body.match(/(?<![\w-])\d*\.?\d+px\b/g) ?? []).length,
  'z-index-number': (body) => (body.match(/z-index:\s*-?\d/g) ?? []).length,
  important: (body) => (body.match(/!important/g) ?? []).length,
  // 화면 크기는 dvh·%·container. vh/vw 직접값은 주소창·세로 스크롤바·safe-area 에서 틀어진다
  vh: (body) => (body.match(/(?<![\w-])\d*\.?\d+vh\b/g) ?? []).length,
  vw100: (body) => (body.match(/width:\s*100vw\b/g) ?? []).length,
};

// 규칙 단위 검사(선택자별 본문)
const RULE_LEVEL = {
  // nowrap 은 말줄임·스크롤·줄지 않음 중 하나와 짝이어야 한다. 예외는 본문에 /* lint-ok: 이유 */
  'nowrap-unpaired': (body) => /white-space:\s*nowrap/.test(body) && !/text-overflow|overflow(-x)?:\s*(hidden|auto|clip|scroll)|flex:\s*none|flex:\s*0 0|flex-shrink:\s*0/.test(body),
  // 부모 gap 이 정하는 간격을 자식 margin-top 으로 또 만든다(양수 토큰 간격). 예외는 /* lint-ok: 이유 */
  'child-margin-top': (body) => /(?<![\w-])margin-top:\s*var\(--tk-space-(?!0\b)[\w-]+\)/.test(body) || /(?<![\w-])margin:\s*var\(--tk-space-(?!0\b)[\w-]+\)\s+0\s+0\s*(;|$)/.test(body),
  // 아래에 붙는 고정 요소는 safe-area-inset-bottom 을 안다
  'fixed-bottom-no-safe-area': (body) => /position:\s*fixed/.test(body) && /(?<![-\w])bottom:|inset:\s*[^;]*\b0\b/.test(body) && !/safe-area-inset-bottom/.test(body),
};

const found = {};
const add = (file, rule, n = 1) => { if (!n) return; ((found[file] ??= {})[rule] = (found[file][rule] ?? 0) + n); };

for (const f of files) {
  const rel = relative(root, f);
  if (/\.test\.(ts|tsx)$/.test(rel)) continue;
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('.css')) {
    const css = strip(text);
    // @media 조건(폭 px)은 값이 아니라 조건이라 뺀다
    const noMedia = css.replace(/@media[^{]*\{/g, '{');
    for (const [rule, fn] of Object.entries(RULES)) add(rel, rule, fn(noMedia));
    add(rel, 'undefined-token', undefinedTokens(css));
    for (const m of text.replace(/url\([^)]*\)/g, 'url()').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const raw = m[2];
      if (/lint-ok:/.test(raw)) continue;
      const body = strip(raw);
      for (const [rule, fn] of Object.entries(RULE_LEVEL)) if (fn(body)) add(rel, rule);
    }
  } else if (/\.(tsx|ts)$/.test(f)) {
    add(rel, 'hex', (text.match(/["'`]#[0-9a-fA-F]{3,8}["'`]/g) ?? []).length);
    add(rel, 'inline-px', (text.match(/style=\{\{[^}]*\b\d+px\b/g) ?? []).length);
    add(rel, 'undefined-token', undefinedTokens(text));
  }
}

if (update) {
  writeFileSync(baselinePath, JSON.stringify(found, null, 1) + '\n');
  console.log(`ui-lint 기준선 갱신: 파일 ${Object.keys(found).length}개`);
  process.exit(0);
}
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
const errors = [];
let total = 0, base = 0;
for (const [file, rules] of Object.entries(found)) {
  for (const [rule, n] of Object.entries(rules)) {
    total += n;
    const allowed = baseline[file]?.[rule] ?? 0;
    if (n > allowed) errors.push(`${file}: ${rule} ${n}건 (기준선 ${allowed}). 토큰·부모 gap·말줄임으로 고치거나, 정말 예외면 규칙 본문에 /* lint-ok: 이유 */`);
  }
}
for (const rules of Object.values(baseline)) for (const n of Object.values(rules)) base += n;
if (errors.length) {
  console.error('ui-lint 실패(새로 늘어난 위반):\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`ui-lint ok · 위반 ${total}건(기준선 ${base}건 이하, 새로 늘지 않음). 줄이면 node scripts/ui-lint.mjs --update`);
