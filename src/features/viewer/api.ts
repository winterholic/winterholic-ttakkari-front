import { ApiError, apiUrl, getAccessToken, refreshOrLose, toApiError } from "../../api/client";
import type { DownloadLinkOut, UUID } from "../../api/types";

/**
 * client.ts 의 downloadLink 에는 inline 옵션이 없고 client.ts 는 이 기능 범위 밖이라, 같은 규칙(Bearer, 401 → refresh 한 번)으로 직접 호출한다.
 * 반환 URL 은 인증 헤더 없이 열리는 5분짜리 /api/view/{token} 이며 항상 절대 URL 이다.
 */
export async function inlineViewLink(id: UUID, variant: "original" | "preview" = "original"): Promise<DownloadLinkOut> {
  const url = `${apiUrl(`/api/artifacts/${id}/download-link`)}?variant=${variant}&inline=true`;
  const send = (token: string | null) =>
    fetch(url, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
  const sentWith = getAccessToken();
  let res = await send(sentWith);
  if (res.status === 401) {
    const now = getAccessToken();
    res = await send(now && now !== sentWith ? now : await refreshOrLose());
  }
  if (!res.ok) throw await toApiError(res);
  const r = (await res.json()) as DownloadLinkOut;
  return { ...r, url: /^https?:\/\//.test(r.url) ? r.url : apiUrl(r.url) };
}

/** 사람이 읽을 오류 문장. 기계 코드는 따로 모노로 덧붙인다. */
export function errorText(e: unknown): { message: string; code?: string } {
  if (e instanceof ApiError) return { message: e.message, code: e.code };
  if (e instanceof TypeError) return { message: "Mac Studio 에 연결하지 못했어요. 네트워크를 확인해 주세요." };
  return { message: e instanceof Error ? e.message : "알 수 없는 오류가 났어요." };
}
