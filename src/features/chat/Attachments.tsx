import { useQueries, useQuery } from "@tanstack/react-query";
import { contentBlob, getArtifact } from "../../api/client";
import type { ArtifactOut } from "../../api/types";
import { Icon, KIND_GLYPH } from "../../ui/Icon";
import { extOf, formatSize } from "../viewer/kinds";
import "./attachments.css";

/** 입력창과 말풍선이 같은 타일을 쓴다. 한쪽만 고치면 다시 어긋난다. */
export interface AttachmentTileProps {
  name: string;
  size?: number | null;
  /** ArtifactKind. 없으면 확장자로 이미지 여부만 가린다. */
  kind?: string;
  /** 이미지 미리보기 주소. 없으면 타입 아이콘 타일로 그린다. */
  thumbSrc?: string | null;
  state?: "uploading" | "failed";
  error?: string;
  testId?: string;
  onOpen?: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
}

export function AttachmentTile({ name, size, kind, thumbSrc, state, error, testId, onOpen, onRemove, onRetry }: AttachmentTileProps) {
  const isImage = kind === "image";
  const g = KIND_GLYPH[kind ?? "other"] ?? KIND_GLYPH.other;
  const ext = extOf(name);
  const body = isImage ? (
    <span className="tk-attach__thumb">
      {thumbSrc ? <img src={thumbSrc} alt={name} draggable={false} /> : <Icon name="image" />}
    </span>
  ) : (
    <>
      <span className="tk-glyph tk-glyph--sm" data-type={g.type}>
        <Icon name={g.icon} />
      </span>
      <span className="tk-attach__text">
        <span className="tk-attach__name">{name}</span>
        <span className="tk-attach__meta">
          {ext && <span className="tk-ext">{ext}</span>}
          {size != null && <span>{formatSize(size)}</span>}
        </span>
      </span>
    </>
  );
  return (
    <div
      className="tk-attach"
      data-kind={isImage ? "image" : "file"}
      data-state={state}
      data-failed={state === "failed" ? "" : undefined}
      aria-busy={state === "uploading" || undefined}
      title={error ?? name}
    >
      {onOpen ? (
        <button type="button" className="tk-attach__main" data-testid={testId} aria-label={`${name} 열기`} onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="tk-attach__main">{body}</div>
      )}
      {state === "uploading" && <span className="tk-spinner tk-spinner--xs tk-attach__busy" aria-hidden />}
      {(onRetry || onRemove) && (
        <span className="tk-attach__actions">
          {onRetry && (
            <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label={`${name} 다시 올리기`} onClick={onRetry}>
              <Icon name="retry" />
            </button>
          )}
          {onRemove && (
            <button className="tk-icon-button tk-icon-button--xs tk-icon-button--round" type="button" aria-label={`${name} 빼기`} onClick={onRemove}>
              <Icon name="x" />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

const fileUrls = new WeakMap<File, string>();
/** File 의 미리보기 object URL. 렌더 중에 불러도 File 당 하나만 만든다. 목록에서 빠지면 releaseFileUrl 로 해제한다. */
export function fileUrl(file: File): string | null {
  if (!file.type.startsWith("image/")) return null;
  let u = fileUrls.get(file);
  if (!u) {
    u = URL.createObjectURL(file);
    fileUrls.set(file, u);
  }
  return u;
}
export function releaseFileUrl(file: File) {
  const u = fileUrls.get(file);
  if (u) URL.revokeObjectURL(u);
  fileUrls.delete(file);
}

/** 서버에 있는 이미지 원본을 인증 헤더로 받아 object URL 로 쓴다(<img src> 에는 토큰을 못 싣는다). 캐시가 비워질 때까지 유지한다. */
function useArtifactImageUrl(id: string, enabled: boolean): string | null {
  const q = useQuery({
    queryKey: ["artifactImageUrl", id],
    queryFn: async () => URL.createObjectURL(await contentBlob(id)),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data ?? null;
}

function SentTile({ art, onOpen }: { art: ArtifactOut; onOpen: (id: string) => void }) {
  const thumb = useArtifactImageUrl(art.id, art.kind === "image" && art.export_policy !== "sensitive");
  return (
    <AttachmentTile
      name={art.filename}
      size={art.size_bytes}
      kind={art.kind}
      thumbSrc={thumb}
      testId="sent-attachment"
      onOpen={() => onOpen(art.id)}
    />
  );
}

/** 보낸 지시에 붙은 첨부. 파일명·크기·종류는 GET /api/artifacts/{id} 로 읽는다. */
export function SentAttachments({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ["artifact", id], queryFn: () => getArtifact(id), staleTime: 60_000, retry: false })),
  });
  return (
    <div className="tk-attach-list" aria-label="함께 보낸 파일">
      {results.map((r, i) =>
        r.data ? (
          <SentTile key={ids[i]} art={r.data} onOpen={onOpen} />
        ) : (
          <AttachmentTile key={ids[i]} name={r.isPending ? "불러오는 중" : "지워졌거나 열 수 없는 파일"} state={r.isPending ? "uploading" : undefined} />
        ),
      )}
    </div>
  );
}

/** 입력창 첨부 한 칸. 손에 든 File 로 바로 미리보기를 그린다(업로드를 기다리지 않는다). */
export function PendingAttachment({
  file,
  state,
  error,
  onRemove,
  onRetry,
}: {
  file: File;
  state: "uploading" | "done" | "failed";
  error?: string;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const url = fileUrl(file);
  const isImage = file.type.startsWith("image/");
  return (
    <AttachmentTile
      name={file.name}
      size={file.size}
      kind={isImage ? "image" : "other"}
      thumbSrc={url}
      state={state === "done" ? undefined : state}
      error={error}
      onRemove={onRemove}
      onRetry={state === "failed" ? onRetry : undefined}
    />
  );
}
