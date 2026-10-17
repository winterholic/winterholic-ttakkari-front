import type { ArtcraftBugStatus, ArtcraftSnippetKind } from "../../api/artcraftTypes";
import { toast } from "../../ui/toastStore";

export const BUG_STATUS_LABEL: Record<ArtcraftBugStatus, string> = { unreported: "미보고", reported: "보고됨", resolved: "해결" };
export const BUG_STATUSES: ArtcraftBugStatus[] = ["unreported", "reported", "resolved"];
export const SNIPPET_LABEL: Record<ArtcraftSnippetKind, string> = { json: "JSON", claude: "Claude Code", codex: "Codex" };
export const SNIPPET_KINDS: ArtcraftSnippetKind[] = ["json", "claude", "codex"];

const time = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** smoke 결과의 ts 는 `+0900` 처럼 콜론 없는 오프셋이라 Date 가 못 읽는 엔진이 있어 콜론을 넣어 읽는다. */
export function parseTime(value: string): Date {
  return new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}

export function when(value: string | null | undefined): string {
  if (!value) return "-";
  const d = parseTime(value);
  return Number.isNaN(d.getTime()) ? "-" : time.format(d);
}

/** 방금·N분 전처럼 짧게. 하루가 넘으면 날짜. */
export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "-";
  const t = parseTime(value).getTime();
  if (Number.isNaN(t)) return "-";
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return when(value);
}

export function copyText(text: string, what: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast({ message: `${what}을(를) 복사했어요.` }),
    () => toast({ message: "복사하지 못했어요. 길게 눌러 직접 복사해 주세요.", tone: "danger" }),
  );
}

/** STATUS.md §6 의 수동 업데이트 절차. 이 화면은 설치·업데이트를 실행하지 않고 절차만 보여 준다. */
export function updateSteps(app: string): string {
  return [
    "cd ~/development/projects/artcraft",
    "bin/artcraft status --remote",
    `gh release download -R storytold/${app} --dir downloads/${app} --clobber -p '*macos-universal*' -p SHA256SUMS.txt`,
    "# SHA256 확인 후 dist/cli/<앱>/ 에 CLI 를 풀고 bin/<앱>-cli 링크를 새 폴더로 바꾸고, DMG 의 .app 을 dist/app/ 에 복사",
    `bin/artcraft smoke ${app} && python3 scripts/gen_status.py`,
  ].join("\n");
}
