import { useQuery } from "@tanstack/react-query";
import { productionResultUrl } from "../../api/creativeV2";
import { errorText } from "../../features/viewer/api";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

/** 서버의 inline 응답을 받는 재생 주소에서 같은 토큰으로 attachment 응답을 받는 주소를 만든다. */
export const downloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=true`;

/**
 * 제작 결과 mp4 재생과 다운로드. result-link 로 revision·SHA가 묶인 임시 주소를 받아 쓴다.
 * 링크가 지금 보는 결과(SHA)와 다르면 다른 결과를 재생하지 않도록 거부한다. 임시 주소는 만료되므로 재생이 실패하면 다시 발급한다.
 */
export function ResultVideo({ planId, revision, sha256, name }: { planId: string; revision: number; sha256: string | null; name: string | null }) {
  const link = useQuery({
    queryKey: ["creative-result-link", planId, revision, sha256],
    queryFn: async () => {
      const issued = await productionResultUrl(planId, revision, "final");
      if (issued.revision !== revision || issued.result_id !== "final" || (sha256 && issued.sha256 !== sha256)) {
        throw new Error("결과 링크가 지금 보는 결과와 일치하지 않아 재생하지 않았어요.");
      }
      return issued;
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const fileName = name || `creative-${planId}-r${revision}.mp4`;
  return (
    <section className="creative-result" aria-label="제작 결과">
      <h3>제작 결과</h3>
      {link.isPending && <p role="status">결과 영상을 불러오는 중</p>}
      {link.isError && (
        <p className="tk-error" role="alert">
          {errorText(link.error).message} <Button size="xs" onClick={() => void link.refetch()}>다시 불러오기</Button>
        </p>
      )}
      {link.data && (
        <>
          <video controls preload="metadata" src={link.data.url} aria-label="결과 영상" style={{ maxWidth: "100%" }}
            onError={() => void link.refetch()} />
          <p className="creative-hint">
            <a className="tk-button" href={downloadUrl(link.data.url)} download={fileName}><Icon name="download" />MP4 다운로드</a>
            {" "}결과 SHA {link.data.sha256.slice(0, 12)} · 임시 링크 만료 {link.data.expires_at}
          </p>
        </>
      )}
    </section>
  );
}
