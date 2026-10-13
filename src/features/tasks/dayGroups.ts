const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 서고 묶음 이름: 오늘 / 어제 / 이번 주(7일 안) / 그 앞은 "2026년 10월". 미래 시각(시계 어긋남)은 오늘로 본다. */
export function dayGroup(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.max(0, Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS));
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  if (days < 7) return "이번 주";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

/** 이미 최근 순으로 온 목록을 순서 그대로 묶는다. */
export function groupByDay<T>(items: T[], at: (t: T) => string, now: Date = new Date()): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayGroup(at(it), now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(it);
    else out.push({ label, items: [it] });
  }
  return out;
}

/** 검색어가 든 구간을 나눈다. 대소문자는 가리지 않는다. 정규식을 쓰지 않아 특수문자도 그대로 찾는다. */
export function splitMatch(text: string, needle: string): { text: string; hit: boolean }[] {
  const n = needle.trim();
  if (!n) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const key = n.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(key, i);
    if (j < 0) break;
    if (j > i) out.push({ text: text.slice(i, j), hit: false });
    out.push({ text: text.slice(j, j + key.length), hit: true });
    i = j + key.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out;
}
