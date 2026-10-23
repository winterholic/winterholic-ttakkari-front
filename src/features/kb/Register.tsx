import { useKbScope } from "./scope";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { kbRegister } from "../../api/client";
import type { KbRegisterOut } from "../../api/kbTypes";
import { Button } from "../../ui/Button";
import { FileButton } from "../../ui/FileButton";
import { failure } from "./labels";

const MAX_CHARS = 2_000_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/**
 * 텍스트 등록. 같은 본문은 멱등이라 두 번 올려도 문서가 늘지 않는다. 같은 문서 키로 다른 본문을 올리면 새 버전이 된다.
 * URL 수집은 collector 플랫폼 소관이라 여기서는 받지 않는다(ADR 0063 후속 작업).
 */
export function Register({ openDocument }: { openDocument: (documentId: string) => void }) {
  const scope = useKbScope();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sourceKey, setSourceKey] = useState("");
  const [lang, setLang] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<KbRegisterOut | null>(null);

  const save = useMutation({
    mutationFn: () => kbRegister({ ...(scope === "work" ? { scope } : {}), title: title.trim(), text, source_key: sourceKey.trim() || undefined, lang: lang.trim() || undefined }),
    onSuccess: async (out) => {
      setDone(out);
      setProblem("");
      await queryClient.invalidateQueries({ queryKey: ["kb-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["kb-documents"] });
      await queryClient.invalidateQueries({ queryKey: ["kb-search"] });
      if (out.created) { setTitle(""); setText(""); setSourceKey(""); }
    },
    onError: (e) => { setDone(null); setProblem(failure(e)); },
  });

  const submit = () => {
    if (!title.trim()) return setProblem("제목을 입력해 주세요.");
    if (!text.trim()) return setProblem("본문을 입력하거나 파일을 골라 주세요.");
    if (text.length > MAX_CHARS) return setProblem("본문이 너무 길어요. 200만 자 이하로 줄여 주세요.");
    setProblem("");
    save.mutate();
  };

  const readFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setProblem("파일이 너무 커요. 8MB 이하의 텍스트 파일만 올릴 수 있어요.");
    try {
      const body = await file.text();
      setText(body);
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      setProblem("");
      setDone(null);
    } catch {
      setProblem("파일을 읽지 못했어요. 텍스트 파일인지 확인해 주세요.");
    }
  };

  return <form className="kb-register" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
    <p className="kb-note">공식 문서나 자료 본문을 붙여넣으면 문단(패시지) 단위로 나뉘어 검색돼요. 원본 바이트는 해시로 보관하고 수정하지 않아요.</p>
    <label className="kb-field"><span>제목</span>
      <input className="tk-input" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} placeholder="예: PostgreSQL 17 트랜잭션 격리" /></label>
    <div className="kb-field">
      <label htmlFor="kb-text">본문</label>
      <textarea id="kb-text" className="tk-textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="문단은 빈 줄로 나눠 주세요." />
      <div className="kb-actions">
        <FileButton className="tk-button tk-button--sm" accept=".txt,.md,.markdown,text/plain,text/markdown" onFiles={(f) => void readFile(f)}>텍스트 파일 고르기</FileButton>
        <span className="kb-note">{text.length.toLocaleString("ko-KR")}자</span>
      </div>
    </div>
    <details className="kb-disclosure">
      <summary>고급 설정</summary>
      <div className="kb-advanced">
        <label className="kb-field"><span>문서 키 (선택)</span>
          <input className="tk-input" value={sourceKey} maxLength={500} onChange={(e) => setSourceKey(e.target.value)} placeholder="manual:pg-isolation" /></label>
        <p className="kb-note">비워 두면 본문으로 자동 정해요. 같은 키로 다른 본문을 올리면 새 버전이 되고, 이전 버전은 그대로 남아요.</p>
        <label className="kb-field"><span>언어 (선택)</span>
          <input className="tk-input" value={lang} maxLength={16} onChange={(e) => setLang(e.target.value)} placeholder="ko, en" /></label>
      </div>
    </details>
    {problem && <p className="tk-error" role="alert">{problem}</p>}
    {done && <div className="kb-callout" role="status">
      <p>{done.created ? `등록했어요. 버전 ${done.rev_no}, 패시지 ${done.passage_count}개.` : `이미 같은 내용이 등록돼 있어요. 버전 ${done.rev_no}을 그대로 두었어요.`}</p>
      <Button size="sm" onClick={() => openDocument(done.document_id)}>문서 보기</Button>
    </div>}
    <Button variant="primary" type="submit" busy={save.isPending}>등록</Button>
  </form>;
}
