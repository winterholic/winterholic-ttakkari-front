import { ApiError } from "../../api/client";
import type { RevokePartial } from "../../api/contextSharingTypes";

export interface ShareProblem {
  code: string;
  title: string;
  body: string;
  tone: "warning" | "danger";
  /** 같은 요청을 다시 보내 볼 만한가. 서버 설정·계약 문제는 다시 눌러도 같다. */
  retryable: boolean;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const partialText = (v: unknown): string => {
  if (typeof v !== "object" || v === null) return "";
  const p = v as Partial<RevokePartial>;
  return ` 지금까지 스냅샷 ${num(p.revoked_snapshots)}개·키 ${num(p.revoked_keys)}개를 폐기했고, 스냅샷 ${num(p.remaining_snapshots)}개·키 ${num(p.remaining_keys)}개가 남았습니다. 같은 버튼을 다시 누르면 남은 것만 이어서 처리합니다.`;
};

/** 서버 오류 코드를 "무엇이 일어났고 지금 무엇을 하면 되는지"로 바꾼다. 서버 메시지는 모르는 코드의 마지막 수단이다. */
export function describeShareError(e: unknown): ShareProblem {
  if (!(e instanceof ApiError)) {
    return { code: "network", title: "서버에 연결하지 못했습니다", body: "네트워크나 서버 연결을 확인한 뒤 다시 시도하세요. 방금 요청이 반영됐는지는 목록을 새로 불러와 확인하세요.", tone: "danger", retryable: true };
  }
  const x = e.extra;
  const partial = partialText(x.partial);
  switch (e.code) {
    case "gateway_not_configured": {
      const missing = strs((x.gateway as { missing?: unknown } | undefined)?.missing);
      return {
        code: e.code,
        title: "Context Gateway 연결이 설정되지 않았습니다",
        body: `서버 설정(control 주소·토큰)이 끝나야 게시와 키 발급을 할 수 있습니다.${missing.length ? ` 비어 있는 설정: ${missing.join(", ")}.` : ""} 초안과 검토 내용은 그대로 남아 있습니다.${partial}`,
        tone: "warning",
        retryable: true,
      };
    }
    case "gateway_unavailable":
      return { code: e.code, title: "Gateway 에 연결할 수 없습니다", body: `잠시 뒤 다시 시도하세요. 확인되지 않은 변경은 성공으로 기록하지 않았습니다.${partial}`, tone: "warning", retryable: true };
    case "gateway_rejected": {
      const st = num(x.gateway_status);
      const code = typeof x.gateway_code === "string" ? x.gateway_code : "";
      return {
        code: e.code,
        title: "Gateway 가 요청을 거절했습니다",
        body: `Gateway 응답 ${st || "4xx"}${code ? ` (${code})` : ""}. 아무것도 바뀌지 않았습니다. 같은 요청이 계속 거절되면 서버의 Gateway 인증 설정을 확인하세요.${partial}`,
        tone: "danger",
        retryable: false,
      };
    }
    case "gateway_bad_response":
      return { code: e.code, title: "Gateway 응답을 확인할 수 없습니다", body: `Gateway 응답이 약속된 형식과 달라 결과를 믿을 수 없습니다. 성공으로 기록하지 않았습니다.${partial}`, tone: "danger", retryable: false };
    case "gateway_contract_incomplete":
      return {
        code: e.code,
        title: "지금은 키를 발급할 수 없습니다",
        body: "게시한 스냅샷은 그대로이지만, Gateway 가 게시 응답에 프로젝트 ID 를 돌려주지 않아 키를 발급할 수 없습니다. 다시 눌러도 같습니다. Gateway 계약 갱신이 필요합니다.",
        tone: "warning",
        retryable: false,
      };
    case "verification_required": {
      const n = strs(x.document_ids).length;
      return {
        code: e.code,
        title: "원본 대조 확인이 필요합니다",
        body: `원본과 대조해 확인하지 않은 문서${n ? ` ${n}개` : ""}가 있어 게시하지 않았습니다. 각 문서를 원본과 직접 비교한 뒤 '원본과 대조해 확인함'을 선택하고 저장하세요. 자동으로 채우지 않습니다.`,
        tone: "warning",
        retryable: false,
      };
    }
    case "digest_mismatch":
      return {
        code: e.code,
        title: "승인한 내용과 현재 초안이 다릅니다",
        body: "승인한 뒤 초안이 바뀌었습니다(다른 화면이나 세션에서 수정됐을 수 있습니다). 최신 내용을 다시 불러왔으니 문서를 다시 읽고 새 승인으로 게시하세요.",
        tone: "warning",
        retryable: false,
      };
    case "sensitive_content_blocked": {
      const high = num((x.counts as { high?: unknown } | undefined)?.high);
      return {
        code: e.code,
        title: "고위험 항목이 남아 게시할 수 없습니다",
        body: `인증정보·개인 식별번호·내부 주소·로컬 경로로 보이는 항목${high ? ` ${high}건` : ""}이 남아 있습니다. 해당 부분을 고쳐 제거한 뒤 저장하세요.`,
        tone: "danger",
        retryable: false,
      };
    }
    case "work_scope_confirmation_required":
      return { code: e.code, title: "회사 범위 확인이 필요합니다", body: "회사(work) 범위 자료가 포함돼 있습니다. 외부 공유 의도를 확인하는 선택을 켜야 초안을 만들 수 있습니다.", tone: "warning", retryable: false };
    case "work_sharing_policy_required":
      // 회사 범위 차단을 없애기 전의 백엔드만 이 코드를 보낸다.
      return { code: e.code, title: "서버가 회사 범위 공유를 막고 있습니다", body: "서버가 회사 자료 공유를 막던 이전 버전입니다. 백엔드를 최신으로 배포하면 회사 범위도 게시와 키·링크 발급이 됩니다.", tone: "warning", retryable: false };
    case "work_scope_owner_only":
      return { code: e.code, title: "회사 범위 초안은 직접 만들어야 합니다", body: "에이전트는 회사 범위 초안을 만들 수 없습니다. 이 화면에서 직접 만드세요.", tone: "warning", retryable: false };
    case "draft_not_editable":
      return { code: e.code, title: "이미 게시한 초안입니다", body: "게시한 초안은 고치거나 다시 게시할 수 없습니다. 새 초안을 만들어 다시 게시하세요.", tone: "warning", retryable: false };
    case "draft_not_found":
      return { code: e.code, title: "초안을 찾을 수 없습니다", body: "삭제됐거나 주소가 잘못됐습니다. 프로젝트의 초안 목록으로 돌아가세요.", tone: "warning", retryable: false };
    case "draft_empty":
      return { code: e.code, title: "문서를 모두 뺄 수 없습니다", body: "초안에는 문서가 하나 이상 있어야 합니다. 다른 문서를 남기거나 새 초안을 만드세요.", tone: "warning", retryable: false };
    case "draft_too_large":
      return { code: e.code, title: "내용이 너무 큽니다", body: "문서 하나는 20만 자, 초안 전체는 100만 자까지입니다. 문서 수를 줄이거나 본문을 줄이세요.", tone: "warning", retryable: false };
    case "document_not_in_project":
      return { code: e.code, title: "고를 수 없는 문서가 있습니다", body: "다른 프로젝트의 문서이거나 꺼진 출처의 문서입니다. 문서 목록을 새로 불러온 뒤 다시 고르세요.", tone: "warning", retryable: false };
    case "document_empty":
      return { code: e.code, title: "본문이 없는 문서가 있습니다", body: "색인된 본문이 없는 문서는 고를 수 없습니다. 선택에서 빼고 다시 만드세요.", tone: "warning", retryable: false };
    case "project_not_published":
      return { code: e.code, title: "게시된 스냅샷이 없습니다", body: "초안을 승인해 먼저 게시해야 키를 발급하거나 철회할 수 있습니다.", tone: "warning", retryable: false };
    case "project_not_found":
    case "key_not_found":
    case "document_not_found":
      return { code: e.code, title: "대상을 찾을 수 없습니다", body: `${e.message} 화면을 새로 불러온 뒤 다시 시도하세요.`, tone: "warning", retryable: false };
    default:
      return { code: e.code, title: "요청을 처리하지 못했습니다", body: e.message, tone: "danger", retryable: e.status >= 500 };
  }
}
