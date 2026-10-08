import { useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { contentBlob, downloadLink, getArtifact } from "../api/client";

export function ArtifactPage() {
  const { artifactId = "" } = useParams();
  const art = useQuery({ queryKey: ["artifact", artifactId], queryFn: () => getArtifact(artifactId) });
  const a = art.data;
  const isText = a?.kind === "markdown" || a?.kind === "code";
  const text = useQuery({
    queryKey: ["artifact-text", artifactId],
    queryFn: async () => (await contentBlob(artifactId, "original")).text(),
    enabled: isText && a?.export_policy !== "deny",
  });
  const download = useMutation({
    mutationFn: () => downloadLink(artifactId, "original"),
    onSuccess: (r) => {
      window.location.assign(r.url);
    },
  });

  return (
    <main>
      {art.error && <p role="alert">{art.error.message}</p>}
      {a && (
        <>
          <h2>{a.filename}</h2>
          <dl>
            <dt>종류</dt>
            <dd>{a.kind}</dd>
            <dt>미리보기</dt>
            <dd>{a.preview_status}</dd>
            <dt>반출</dt>
            <dd>{a.export_policy}</dd>
            <dt>크기</dt>
            <dd>{a.size_bytes}</dd>
          </dl>
          <button disabled={!a.downloadable || download.isPending} onClick={() => download.mutate()}>
            다운로드
          </button>
          {download.error && <p role="alert">{download.error.message}</p>}
          {text.error && <p role="alert">{text.error.message}</p>}
          {text.data !== undefined && <pre>{text.data}</pre>}
        </>
      )}
    </main>
  );
}
