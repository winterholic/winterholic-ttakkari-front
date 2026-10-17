import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile } from "../../../api/client";
import { toast } from "../../../ui/toastStore";
import { PendingAttachment, releaseFileUrl } from "../../chat/Attachments";
import { checkAttachFiles } from "../../chat/clipboardFiles";
import { extOf } from "../../viewer/kinds";

export interface Attachment {
  key: number;
  file: File;
  state: "uploading" | "done" | "failed";
  id?: string;
  error?: string;
}

/**
 * 폰에서 고른 파일을 ArtCraft 작업 워크스페이스로 올리고 Artifact ID 를 모은다. 올리는 중에는 보낼 수 없다(`busy`).
 * 범주가 받지 않는 형식은 올리기 전에 알려 준다(서버도 같은 검사를 한다).
 */
export function useAttachments(workspaceId: string | null | undefined, accepts: string[], max: number) {
  const [items, setItems] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const seq = useRef(0);
  const update = useCallback((change: (all: Attachment[]) => Attachment[]) => {
    current.current = change(current.current);
    setItems(current.current);
  }, []);

  useEffect(() => () => {
    current.current.forEach((a) => releaseFileUrl(a.file));
    current.current = [];
  }, []);

  const upload = useCallback(async (key: number, file: File) => {
    try {
      if (!workspaceId) throw new Error("작업 폴더를 아직 준비하지 못했어요");
      const artifact = await uploadFile(file, workspaceId);
      update((all) => all.map((a) => (a.key === key ? { ...a, state: "done", id: artifact.id } : a)));
    } catch (e) {
      update((all) => all.map((a) => (a.key === key ? { ...a, state: "failed", error: e instanceof Error ? e.message : "올리지 못했어요" } : a)));
    }
  }, [workspaceId, update]);

  const attach = useCallback((files: File[]) => {
    const { accepted, problems } = checkAttachFiles(files, current.current.length);
    problems.forEach((message) => toast({ message, tone: "danger" }));
    for (const file of accepted) {
      if (current.current.length >= max) {
        toast({ message: `파일은 한 번에 ${max}개까지 붙일 수 있어요.`, tone: "danger" });
        break;
      }
      if (accepts.length > 0 && !accepts.includes(extOf(file.name))) {
        toast({ message: `'${file.name}'은 이 작업에서 받지 않는 형식이에요.`, tone: "danger" });
        continue;
      }
      const key = ++seq.current;
      update((all) => [...all, { key, file, state: "uploading" }]);
      void upload(key, file);
    }
  }, [accepts, max, update, upload]);

  const clear = useCallback(() => {
    current.current.forEach((a) => releaseFileUrl(a.file));
    update(() => []);
  }, [update]);

  const tiles = items.length > 0 ? (
    <div className="tk-attach-list" aria-label="함께 보낼 파일">
      {items.map((a) => (
        <PendingAttachment
          key={a.key}
          file={a.file}
          state={a.state}
          error={a.error}
          onRemove={() => {
            releaseFileUrl(a.file);
            update((all) => all.filter((x) => x.key !== a.key));
          }}
          onRetry={() => {
            update((all) => all.map((x) => (x.key === a.key ? { ...x, state: "uploading", error: undefined } : x)));
            void upload(a.key, a.file);
          }}
        />
      ))}
    </div>
  ) : null;

  return {
    items,
    ids: items.flatMap((a) => (a.id ? [a.id] : [])),
    busy: items.some((a) => a.state === "uploading"),
    failed: items.some((a) => a.state === "failed"),
    attach,
    clear,
    tiles,
  };
}
