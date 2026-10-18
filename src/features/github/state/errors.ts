import { GhApiError } from "../../../api/githubClient";

export interface GhErrorView {
  tone: "warning" | "danger" | "neutral";
  title: string;
  message: string;
  /** 같은 요청을 다시 보낼 만한 오류. */
  retry: boolean;
  /** 다른 계정으로 보면 열릴 수 있는 오류. */
  switchAccount: boolean;
  /** GitHub 웹에서 직접 열어 보라고 권할 만한 오류. */
  openOnGithub: boolean;
  /** 한도가 풀리는 시각(Unix 초). */
  resetAt?: number;
  /** 조직 SSO 승인 화면. 열기 전에 https://github.com 인지 다시 검증한다. */
  ssoUrl?: string;
}

const base = { retry: false, switchAccount: false, openOnGithub: false } as const;

/**
 * 오류를 화면 상태로 옮긴다. 문구에는 서버 경로·구현 설명을 넣지 않는다.
 * 없음(gh_not_found)과 권한 부족(gh_forbidden)은 GitHub 이 비공개 자원을 404 로 가리므로 "없거나 권한 없음"으로 묶고, 계정 전환을 권한다.
 */
export function describeGhError(error: unknown, nowMs: number = Date.now()): GhErrorView {
  if (!(error instanceof GhApiError)) {
    return { ...base, tone: "danger", title: "불러오지 못했어요", message: "예상하지 못한 오류가 생겼어요. 다시 시도해 주세요.", retry: true };
  }
  switch (error.code) {
    case "no_account":
      // 같은 503 이라도 gh_status_failed 는 로그인이 없는 게 아니라 gh 상태 조회가 일시 실패한 것이다. 로그인 안내를 주면 틀린 조치를 권하게 된다.
      if (error.reason === "gh_status_failed") {
        return { ...base, tone: "warning", title: "GitHub 계정 상태를 확인하지 못했어요", message: "Mac Studio 의 gh 가 계정 상태를 일시적으로 알려 주지 못했어요. 로그아웃된 것은 아니니 잠시 뒤 다시 시도해 주세요. 계속되면 Mac Studio 에서 gh auth status 를 확인해 주세요.", retry: true };
      }
      return { ...base, tone: "warning", title: "연결된 GitHub 계정이 없어요", message: "Mac Studio 에서 gh auth login 으로 계정을 추가한 뒤 다시 열어 주세요." };
    case "gh_cli_missing":
      return { ...base, tone: "warning", title: "Mac Studio 에서 gh 를 찾을 수 없어요", message: "GitHub CLI(gh)가 설치돼 있지 않거나 실행할 수 없어요. 설치하고 gh auth login 으로 로그인한 뒤 다시 열어 주세요." };
    case "account_unavailable":
      return { ...base, tone: "warning", title: "이 계정을 쓸 수 없어요", message: "계정이 목록에 없거나 만료됐어요. 다른 계정을 고르거나 Mac Studio 에서 다시 로그인해 주세요.", switchAccount: true };
    case "invalid_target":
    case "unsupported_host":
      return {
        ...base, tone: "warning", title: "열 수 없는 주소예요",
        message: error.code === "unsupported_host" ? "github.com 저장소만 열 수 있어요." : "owner/repo 또는 https://github.com/… 주소를 넣어 주세요.",
      };
    case "ref_not_found":
      return { ...base, tone: "warning", title: "브랜치·태그·커밋을 찾을 수 없어요", message: "이름을 확인하거나 코드 화면의 브랜치 목록에서 골라 주세요." };
    case "readme_not_found":
      return { ...base, tone: "neutral", title: "README 가 없어요", message: "이 저장소에는 README 파일이 없어요." };
    case "gh_empty_repository":
      return { ...base, tone: "neutral", title: "비어 있는 저장소예요", message: "아직 커밋이 없어서 보여 줄 파일이 없어요." };
    case "gh_logs_unavailable":
      return { ...base, tone: "warning", title: "로그를 안전하게 받을 수 없었어요", message: "GitHub 가 로그를 안전한 경로로 주지 않았어요. GitHub 에서 직접 열어 보세요.", openOnGithub: true };
    case "gh_not_found":
      return { ...base, tone: "warning", title: "찾을 수 없거나 권한이 없어요", message: "GitHub 는 권한이 없는 비공개 자원을 없는 것처럼 보여 줘요. 주소를 확인하거나 다른 계정으로 열어 보세요.", switchAccount: true };
    case "gh_forbidden":
      if (error.reason === "sso_required") {
        return { ...base, tone: "warning", title: "조직 SSO 승인이 필요해요", message: "이 조직은 SSO 승인이 필요해요. GitHub 에서 이 계정 토큰을 조직에 승인하거나 다른 계정으로 열어 보세요.", switchAccount: true, openOnGithub: true, ssoUrl: error.ssoUrl };
      }
      if (error.reason === "scope_missing") {
        return { ...base, tone: "warning", title: "계정 권한 범위가 부족해요", message: "이 계정 토큰의 권한 범위(scope)로는 읽을 수 없어요. Mac Studio 에서 gh auth refresh 로 범위를 넓히거나 다른 계정을 써 보세요.", switchAccount: true };
      }
      return { ...base, tone: "warning", title: "접근이 허용되지 않아요", message: "조직 정책이나 저장소 설정 때문에 이 계정으로는 읽을 수 없어요.", switchAccount: true, openOnGithub: true };
    case "gh_auth_expired":
      return { ...base, tone: "danger", title: "계정 로그인이 만료됐어요", message: "Mac Studio 에서 gh auth login 으로 다시 로그인해야 해요. 따까리 로그인에는 영향이 없어요.", retry: true, switchAccount: true };
    case "gh_rate_limited": {
      const resetAt = error.reset ?? (error.retryAfter ? Math.ceil(nowMs / 1000) + error.retryAfter : undefined);
      return { ...base, tone: "warning", title: "GitHub 호출 한도에 닿았어요", message: "한도가 풀리면 다시 볼 수 있어요. 이미 열어 본 화면은 그대로 볼 수 있어요.", resetAt };
    }
    case "gh_gone":
      return { ...base, tone: "neutral", title: "더 이상 제공되지 않아요", message: "삭제됐거나 만료됐거나 비활성화된 항목이에요.", openOnGithub: true };
    case "gh_unavailable_legal":
      return { ...base, tone: "neutral", title: "법적 사유로 볼 수 없어요", message: "GitHub 가 법적 사유로 이 저장소 접근을 막았어요." };
    case "gh_unprocessable":
      // resolve 에서만 나온다. 없다는 뜻도, 크기 문제도 아니고 같은 접두사 ref 가 너무 많아 서버가 확인을 멈춘 것이라 같은 입력은 다시 보내도 같다.
      if (error.reason === "ref_resolution_limit") {
        return { ...base, tone: "warning", title: "브랜치·태그 주소를 확인하지 못했어요", message: "같은 이름으로 시작하는 브랜치·태그가 너무 많고 이름이 깊어서 주소의 브랜치·태그를 찾지 못했어요. 없다는 뜻은 아니에요. owner/repo 만 넣어 저장소를 연 뒤 브랜치·태그 목록에서 직접 골라 주세요." };
      }
      return { ...base, tone: "warning", title: "GitHub 가 이 내용을 주지 않았어요", message: "내용이 너무 크거나 처리할 수 없는 형태예요. GitHub 에서 직접 열어 보세요.", openOnGithub: true };
    case "gh_too_large":
      return { ...base, tone: "warning", title: "내용이 너무 커요", message: "여기서 보여 줄 수 있는 크기를 넘었어요. GitHub 에서 직접 열어 보세요.", openOnGithub: true };
    case "gh_timeout":
      return { ...base, tone: "danger", title: "GitHub 응답이 늦어요", message: "시간 안에 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.", retry: true };
    case "gh_upstream_error":
      return { ...base, tone: "danger", title: "GitHub 에서 오류가 났어요", message: "GitHub 쪽 일시 오류예요. 잠시 뒤 다시 시도해 주세요.", retry: true };
    case "gh_schema_changed":
      return { ...base, tone: "danger", title: "GitHub 응답 형식이 달라졌어요", message: "예상과 다른 응답이 왔어요. 다시 시도해도 같으면 따까리 업데이트가 필요해요.", retry: true };
    case "network":
      return { ...base, tone: "danger", title: "연결하지 못했어요", message: "Mac Studio 에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.", retry: true };
    default:
      return { ...base, tone: "danger", title: "불러오지 못했어요", message: "예상하지 못한 오류가 생겼어요. 다시 시도해 주세요.", retry: true };
  }
}
