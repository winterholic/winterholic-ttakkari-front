import type { ArtcraftBug, ArtcraftBugKind, ArtcraftBugSection, ArtcraftBugStatus, ArtcraftSnippetKind } from "../../api/artcraftTypes";
import { toast } from "../../ui/toastStore";

export const BUG_STATUS_LABEL: Record<ArtcraftBugStatus, string> = {
  candidate: "미검토", selected: "기여 선택", in_progress: "진행 중", reported: "보고됨·PR 올림", resolved: "해결", deferred: "보류", excluded: "제외",
};
export const BUG_STATUSES: ArtcraftBugStatus[] = ["candidate", "selected", "in_progress", "reported", "resolved", "deferred", "excluded"];
/** 본 흐름. 보류·제외는 어느 단계에서든 빠지는 옆길이다. */
export const BUG_FLOW: ArtcraftBugStatus[] = ["candidate", "selected", "in_progress", "reported", "resolved"];
export const BUG_NEXT: Partial<Record<ArtcraftBugStatus, { to: ArtcraftBugStatus; label: string }>> = {
  candidate: { to: "selected", label: "기여로 선택" },
  selected: { to: "in_progress", label: "진행 중으로" },
  in_progress: { to: "reported", label: "보고함·PR 올림" },
  reported: { to: "resolved", label: "해결로 표시" },
};
export const BUG_KIND_LABEL: Record<ArtcraftBugKind, string> = { issue: "이슈만", pr: "PR 가능", security: "보안 비공개 신고 필요" };
export const BUG_DIFFICULTY_LABEL = { easy: "쉬움", medium: "보통", hard: "어려움" } as const;
export const BUG_UPSTREAM_LABEL: Record<ArtcraftBug["upstream"]["state"], string> = {
  unchecked: "중복 미확인", none: "중복 없음", related: "비슷한 이슈 있음", duplicate: "이미 있는 이슈",
};
export const BUG_SECTIONS: { key: ArtcraftBugSection; label: string; open: boolean }[] = [
  { key: "summary", label: "요약", open: true },
  { key: "repro", label: "재현 절차", open: true },
  { key: "evidence", label: "증거(로그·명령 출력)", open: true },
  { key: "impact", label: "영향", open: false },
  { key: "suggestion", label: "제안", open: false },
  { key: "unverified", label: "확인하지 못한 것", open: false },
];
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
