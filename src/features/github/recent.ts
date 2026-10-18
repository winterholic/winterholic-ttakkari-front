// 브라우저에는 로그인 이름(login)과 owner/repo 이름만 둔다. 토큰·응답 본문·비공개 내용은 저장하지 않는다.
const ACCOUNT_KEY = "ttakkari.github.account";
const RECENT_KEY = "ttakkari.github.recent";
const MAX_RECENT = 8;

export interface RecentTarget {
  account: string;
  owner: string;
  repo: string;
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장소가 막힌 환경(사생활 보호 모드 등)에서는 기억만 포기한다.
  }
}

export const getSavedAccount = (): string | null => {
  const v = read<string>(ACCOUNT_KEY);
  return typeof v === "string" ? v : null;
};
export const saveAccount = (login: string): void => write(ACCOUNT_KEY, login);

export function getRecent(account?: string): RecentTarget[] {
  const v = read<RecentTarget[]>(RECENT_KEY);
  if (!Array.isArray(v)) return [];
  const ok = v.filter((t) => t && typeof t.account === "string" && typeof t.owner === "string" && typeof t.repo === "string");
  return account ? ok.filter((t) => t.account === account) : ok;
}

export function pushRecent(t: RecentTarget): void {
  const rest = getRecent().filter((x) => !(x.account === t.account && x.owner === t.owner && x.repo === t.repo));
  write(RECENT_KEY, [{ account: t.account, owner: t.owner, repo: t.repo }, ...rest].slice(0, MAX_RECENT));
}

export function forgetRecent(account: string): void {
  write(RECENT_KEY, getRecent().filter((t) => t.account !== account));
}
