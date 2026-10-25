import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DragEvent } from "react";
import { isKbUnsupported, kbIngest } from "../../api/kb";
import { kbRegister } from "../../api/client";
import type { KbIngestOut } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { FileButton } from "../../ui/FileButton";
import { Select } from "../../ui/Select";
import { failure } from "./labels";
import { DOMAINS } from "./labelsV3";

const LEGACY_OFFICE = /\.(doc|ppt|xls|hwp)$/i;
const DOMAIN_OPTIONS = [{ value: "", label: "자동 분류" }, ...DOMAINS];

/** 한 줄에 URL 하나. 잘못된 줄은 버리지 않고 알려 준다. */
export function parseUrls(raw: string): { urls: string[]; bad: string[] } {
  const urls: string[] = [];
  const bad: string[] = [];
  for (const line of raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    try {
      const u = new URL(line);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      if (!urls.includes(u.toString())) urls.push(u.toString());
    } catch { bad.push(line); }
  }
  return { urls, bad };
}

const ITEM_STATUS: Record<string, string> = { registered: "등록됨", duplicate: "이미 있음", queued: "대기" };

/**
 * 파일 여러 개·URL 여러 줄·직접 쓴 글을 한 번에 제출한다(POST /ingest). 제출하면 서버가 자동으로 처리 파이프라인에 올리고,
 * 진행은 처리 현황에서 본다. 탭으로 나누지 않는다.
 */
export function IngestModal({ open, onClose, initialFiles, openDocument, openJobs }: {
  open: boolean; onClose: () => void; initialFiles: File[];
  openDocument: (documentId: string, revisionId: string) => void; openJobs: () => void;
}) {
  const cache = useQueryClient();
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [urlText, setUrlText] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<KbIngestOut | null>(null);
  const [legacyDone, setLegacyDone] = useState<{ document_id: string; revision_id: string } | null>(null);
  const [over, setOver] = useState(false);

  const refresh = () => Promise.all(["kb-summary", "kb-documents", "kb-jobs", "kb-search"].map((k) => cache.invalidateQueries({ queryKey: [k] })));
  const send = useMutation({
    mutationFn: () => kbIngest({ files, urls: parseUrls(urlText).urls, text, title, domain: domain || undefined }),
    onSuccess: async (out) => { setDone(out); setLegacyDone(null); setProblem(""); setFiles([]); setUrlText(""); setText(""); setTitle(""); await refresh(); },
  });
  const legacy = useMutation({
    mutationFn: () => kbRegister({ title: title.trim(), text }),
    onSuccess: async (out) => { setLegacyDone(out); setDone(null); setText(""); setTitle(""); await refresh(); },
  });

  const addFiles = (list: File[]) => setFiles((prev) => [...prev, ...list.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFiles(Array.from(e.dataTransfer.files)); };

  const submit = () => {
    const { urls, bad } = parseUrls(urlText);
    if (bad.length) return setProblem(`주소가 올바르지 않아요: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? " 외" : ""}. http 또는 https 주소를 한 줄에 하나씩 적어 주세요.`);
    if (files.length === 0 && urls.length === 0 && !text.trim()) return setProblem("파일을 놓거나 주소·글 중 하나는 넣어 주세요.");
    if (text.trim() && files.length === 0 && urls.length === 0 && !title.trim()) return setProblem("글만 올릴 때는 제목이 필요해요.");
    setProblem("");
    send.mutate();
  };
  const textOnly = files.length === 0 && parseUrls(urlText).urls.length === 0 && Boolean(text.trim());
  const unsupported = send.isError && isKbUnsupported(send.error);

  return <Dialog open={open} onClose={onClose} size="lg" title="자료 추가" modal>
    <form className="kb3-ingest" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="kb-note">올리면 파싱부터 개념 연결까지 자동으로 처리돼요. 따로 추출을 누를 필요가 없어요.</p>
      <div className="kb3-drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <p>여기로 파일을 끌어다 놓거나</p>
        <FileButton className="tk-button tk-button--sm" multiple onFiles={addFiles}>파일 고르기</FileButton>
        <p className="kb-note">PDF · DOCX · PPTX · XLSX · 마크다운 · 텍스트 · 코드 · 자막(SRT·VTT) · 오디오</p>
      </div>
      {files.length > 0 && <ul className="kb3-files" aria-label="선택한 파일">
        {files.map((f) => <li key={`${f.name}-${f.size}`}>
          <span className="kb3-files__name">{f.name}</span>
          <span className="kb-note">{(f.size / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}KB</span>
          {LEGACY_OFFICE.test(f.name) && <Badge tone="warning">구형 형식은 보류돼요</Badge>}
          <button type="button" className="kb3-files__remove" aria-label={`${f.name} 빼기`} onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}>×</button>
        </li>)}
      </ul>}
      <label className="kb-field"><span>웹 주소 (한 줄에 하나)</span>
        <textarea className="tk-textarea" rows={3} value={urlText} onChange={(e) => setUrlText(e.target.value)} placeholder={"https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"} /></label>
      <label className="kb-field"><span>직접 쓴 글</span>
        <textarea className="tk-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="붙여넣을 본문. 헤딩(#)이 있으면 절 경로로 쓰여요." /></label>
      <div className="kb3-ingest__row">
        <label className="kb-field"><span>제목 (글만 올릴 때 필수)</span>
          <input className="tk-input" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="kb-field"><span id="kb3-ingest-domain-l">주제</span>
          <Select id="kb3-ingest-domain" labelledBy="kb3-ingest-domain-l" value={domain} options={DOMAIN_OPTIONS} onChange={setDomain} /></div>
      </div>
      {problem && <p className="tk-error" role="alert">{problem}</p>}
      {send.isError && <div className="kb-error">
        <p className="tk-error" role="alert">{failure(send.error)}</p>
        {unsupported && textOnly && <>
          <p className="kb-note">글만 올리는 경우에는 기존 텍스트 등록으로 저장할 수 있어요. 이 방식은 자동 처리 없이 문서로만 저장돼요.</p>
          <Button variant="ghost" busy={legacy.isPending} disabled={!title.trim()} onClick={() => legacy.mutate()}>기존 방식으로 글 저장</Button>
          {!title.trim() && <p className="kb-note">제목을 넣으면 저장할 수 있어요.</p>}
        </>}
      </div>}
      {legacy.isError && <p className="tk-error" role="alert">{failure(legacy.error)}</p>}
      {legacyDone && <div className="kb-callout" role="status">
        <p>글을 저장했어요. 자동 처리 현황은 이 서버가 아직 제공하지 않아요.</p>
        <Button size="sm" onClick={() => { onClose(); openDocument(legacyDone.document_id, legacyDone.revision_id); }}>문서 보기</Button>
      </div>}
      {done && <div className="kb-callout" role="status">
        <p>{done.items.length}건을 접수했어요. 처리가 끝나면 지식 탐색과 그래프에 나타나요.</p>
        <ul className="kb3-files" aria-label="접수 결과">
          {done.items.map((it) => <li key={it.job_id || it.document_id}>
            <span className="kb3-files__name">{it.name || `문서 ${it.document_id.slice(0, 8)}`}</span>
            <Badge tone={it.error ? "danger" : it.status === "duplicate" ? "warning" : "info"}>{it.error ? "접수 실패" : (ITEM_STATUS[it.status] ?? it.status)}</Badge>
            {it.error && <span className="tk-error">{it.error}</span>}
            {!it.error && <Button size="sm" variant="ghost" onClick={() => { onClose(); openDocument(it.document_id, it.revision_id); }}>열기</Button>}
          </li>)}
        </ul>
        <Button size="sm" onClick={() => { onClose(); openJobs(); }}>처리 현황 보기</Button>
      </div>}
      <div className="kb-actions">
        <Button variant="primary" type="submit" busy={send.isPending}>추가</Button>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
      </div>
    </form>
  </Dialog>;
}
