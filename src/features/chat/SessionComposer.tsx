import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSession, uploadFile } from "../../api/client";
import { toast } from "../../ui/toastStore";
import { PendingAttachment, releaseFileUrl } from "./Attachments";
import { checkAttachFiles } from "./clipboardFiles";
import { Composer } from "./Composer";
import type { ComposerProps } from "./Composer";

interface Attachment {
  key: number;
  file: File;
  state: "uploading" | "done" | "failed";
  id?: string;
  error?: string;
}

type Props = Omit<ComposerProps, "onSubmit" | "onAttach" | "context" | "blocked" | "notice"> & {
  sessionId: string;
  onSubmit: (text: string, contextIds: string[]) => Promise<unknown>;
};

/** 홈과 세션 서랍도 전체 대화처럼 업로드·미리보기·첨부 ID 전송을 한 경로로 처리한다. */
export function SessionComposer({ sessionId, onSubmit, ...props }: Props) {
  const qc = useQueryClient();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const current = useRef<Attachment[]>([]);
  const seq = useRef(0);
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const update = (change: (all: Attachment[]) => Attachment[]) => {
    current.current = change(current.current);
    setAttachments(current.current);
  };

  useEffect(() => () => {
    current.current.forEach((a) => releaseFileUrl(a.file));
    current.current = [];
  }, []);

  const upload = async (key: number, file: File) => {
    try {
      const session = await qc.ensureQueryData({ queryKey: ["session", sessionId], queryFn: () => getSession(sessionId) });
      const artifact = await uploadFile(file, session.workspace_id, sessionId);
      update((all) => all.map((a) => a.key === key ? { ...a, state: "done", id: artifact.id } : a));
    } catch (e) {
      update((all) => all.map((a) => a.key === key ? { ...a, state: "failed", error: e instanceof Error ? e.message : "올리지 못했어요" } : a));
    }
  };

  const attach = (files: File[]) => {
    const { accepted, problems } = checkAttachFiles(files, current.current.length);
    problems.forEach((message) => toast({ message, tone: "danger" }));
    for (const file of accepted) {
      const key = ++seq.current;
      update((all) => [...all, { key, file, state: "uploading" }]);
      void upload(key, file);
    }
  };

  const submit = async (text: string) => {
    if (sending.current || current.current.some((a) => a.state !== "done")) return;
    const submitted = current.current;
    sending.current = true;
    setPending(true);
    try {
      await onSubmit(text, submitted.flatMap((a) => a.id ? [a.id] : []));
      submitted.forEach((a) => releaseFileUrl(a.file));
      update((all) => all.filter((a) => !submitted.includes(a)));
    } catch {
      // 호출한 화면이 전송 오류와 본문 복원을 처리한다. 첨부는 재전송할 수 있게 남긴다.
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  const failed = attachments.some((a) => a.state === "failed");
  return (
    <Composer
      {...props}
      onAttach={attach}
      onSubmit={(text) => void submit(text)}
      blocked={pending || attachments.some((a) => a.state !== "done")}
      notice={failed ? "실패한 첨부를 다시 올리거나 빼고 보내 주세요" : null}
      context={attachments.length > 0 ? (
        <div className="tk-attach-list" aria-label="함께 보낼 첨부">
          {attachments.map((a) => (
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
                update((all) => all.map((x) => x.key === a.key ? { ...x, state: "uploading", error: undefined } : x));
                void upload(a.key, a.file);
              }}
            />
          ))}
        </div>
      ) : undefined}
    />
  );
}
