import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DragEvent } from "react";
import { KB_INGEST_MAX_FILE_BYTES, KB_INGEST_MAX_ITEMS, isKbUnsupported, kbIngest } from "../../api/kb";
import { kbRegister } from "../../api/client";
import type { KbIngestItem, KbIngestOut } from "../../api/kbTypes";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { FileButton } from "../../ui/FileButton";
import { Select } from "../../ui/Select";
import { failure } from "./labels";
import { DOMAINS, ingestErrorText, reasonText } from "./labelsV3";

const LEGACY_OFFICE = /\.(doc|ppt|xls|hwp)$/i;
const AUDIO_VIDEO = /\.(mp3|wav|m4a|mp4|mov|mkv|webm|ogg|flac|aac)$/i;
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

/**
 * 항목 상태를 화면 말로 옮긴다. registered 만 "처리 대기에 올림"이다.
 * held(원본만 보관, 지식화 안 함)와 failed(문서가 안 만들어짐)는 성공으로 보이면 안 된다.
 */
export function ingestItemView(it: KbIngestItem): { label: string; tone: "info" | "success" | "warning" | "danger"; note: string | null; canOpen: boolean } {
  const canOpen = Boolean(it.document_id);
  switch (it.status) {
    case "registered": return { label: "처리 대기", tone: "info", note: null, canOpen };
    case "duplicate": return { label: "이미 있음", tone: "warning", note: "같은 내용이 이미 도서관에 있어서 새로 만들지 않았어요.", canOpen };
    case "held": return {
      label: "보류", tone: "warning", canOpen,
      note: `원본만 보관하고 지식으로 만들지 않았어요. ${it.hold_message || reasonText(it.hold_reason) || "처리할 수 없는 형식이에요."}`,
    };
    case "failed": return { label: "실패", tone: "danger", note: `${ingestErrorText(it.error)}${it.detail ? ` ${it.detail}` : ""}`, canOpen: false };
    default: return { label: it.status, tone: "warning", note: "서버가 알려 주지 않은 상태예요. 문서 목록에서 확인해 주세요.", canOpen };
  }
}

/** 접수 결과 한 줄 요약. 처리 대기가 하나도 없으면 "접수했어요"라고 말하지 않는다. */
export function ingestSummary(items: KbIngestItem[]): string {
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const registered = count("registered");
  const parts = [`처리 대기 ${registered}건`, count("duplicate") && `이미 있음 ${count("duplicate")}건`, count("held") && `보류 ${count("held")}건`, count("failed") && `실패 ${count("failed")}건`].filter(Boolean);
  return parts.join(" · ");
}

/**
 * 파일 여러 개·URL 여러 줄·직접 쓴 글을 한 번에 제출한다(POST /ingest). 제출하면 서버가 자동으로 처리 파이프라인에 올리고,
 * 진행은 처리 현황에서 본다. 탭으로 나누지 않는다. 서버는 항목마다 독립이라 일부만 실패할 수 있고, 실패한 항목은 입력에 남겨 다시 시도하게 한다.
 */
export function IngestModal({ open, onClose, initialFiles, openDocument, openJobs }: {
  open: boolean; onClose: () => void; initialFiles: File[];
  openDocument: (documentId: string, revisionId?: string) => void; openJobs: () => void;
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

  const refresh = () => Promise.all(["kb-summary", "kb-documents", "kb-jobs", "kb-search", "kb-graph"].map((k) => cache.invalidateQueries({ queryKey: [k] })));
  const send = useMutation({
    mutationFn: () => kbIngest({ files, urls: parseUrls(urlText).urls, text, title, domain: domain || undefined }),
    onSuccess: async (out) => {
      setDone(out); setLegacyDone(null); setProblem("");
      // 서버 항목 순서는 파일, 글, 주소 순이다. 실패한 것만 입력에 남겨 고쳐서 다시 올릴 수 있게 한다.
      const failedAt = (i: number) => out.items[i]?.status === "failed";
      const sentUrls = parseUrls(urlText).urls;
      const urlStart = files.length + (text.trim() ? 1 : 0);
      setFiles((prev) => prev.filter((_, i) => failedAt(i)));
      setUrlText(sentUrls.filter((_, i) => failedAt(urlStart + i)).join("\n"));
      if (!(text.trim() && failedAt(files.length))) { setText(""); setTitle(""); }
      await refresh();
    },
  });
  const legacy = useMutation({
    mutationFn: () => kbRegister({ title: title.trim(), text }),
    onSuccess: async (out) => { setLegacyDone(out); setDone(null); setText(""); setTitle(""); await refresh(); },
  });

  const addFiles = (list: File[]) => setFiles((prev) => [...prev, ...list.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFiles(Array.from(e.dataTransfer.files)); };

  const parsed = parseUrls(urlText);
  const itemCount = files.length + parsed.urls.length + (text.trim() ? 1 : 0);
  const tooBig = files.filter((f) => f.size > KB_INGEST_MAX_FILE_BYTES);
  const submit = () => {
    if (parsed.bad.length) return setProblem(`주소가 올바르지 않아요: ${parsed.bad.slice(0, 3).join(", ")}${parsed.bad.length > 3 ? " 외" : ""}. http 또는 https 주소를 한 줄에 하나씩 적어 주세요.`);
    if (itemCount === 0) return setProblem("파일을 놓거나 주소·글 중 하나는 넣어 주세요.");
    if (itemCount > KB_INGEST_MAX_ITEMS) return setProblem(`한 번에 ${KB_INGEST_MAX_ITEMS}건까지만 올릴 수 있어요. 지금 ${itemCount}건이에요. 나눠서 올려 주세요.`);
    if (tooBig.length) return setProblem(`파일이 너무 커요(최대 100MiB): ${tooBig.slice(0, 2).map((f) => f.name).join(", ")}. 빼고 올려 주세요.`);
    setProblem("");
    send.mutate();
  };
  const textOnly = files.length === 0 && parsed.urls.length === 0 && Boolean(text.trim());
  const unsupported = send.isError && isKbUnsupported(send.error);
  const registered = done?.items.filter((i) => i.status === "registered").length ?? 0;

  return <Dialog open={open} onClose={onClose} size="lg" title="자료 추가" modal>
    <form className="kb3-ingest" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="kb-note">올리면 파싱부터 개념 연결까지 자동으로 처리돼요. 따로 추출을 누를 필요가 없어요. 한 번에 {KB_INGEST_MAX_ITEMS}건까지 올릴 수 있어요.</p>
      <div className="kb3-drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
        <p>여기로 파일을 끌어다 놓거나</p>
        <FileButton className="tk-button tk-button--sm" multiple onFiles={addFiles}>파일 고르기</FileButton>
        <p className="kb-note">PDF · DOCX · PPTX · XLSX · CSV · 마크다운 · 텍스트 · 코드 · 웹 문서(HTML) · 자막(SRT·VTT). 오디오·영상은 서버에 전사 기능이 있을 때만 처리하고, 없으면 원본만 보관하며 보류돼요.</p>
      </div>
      {files.length > 0 && <ul className="kb3-files" aria-label="선택한 파일">
        {files.map((f) => <li key={`${f.name}-${f.size}`}>
          <span className="kb3-files__name">{f.name}</span>
          <span className="kb-note">{(f.size / 1024).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}KB</span>
          {LEGACY_OFFICE.test(f.name) && <Badge tone="warning">구형 형식은 보류돼요</Badge>}
          {AUDIO_VIDEO.test(f.name) && <Badge tone="warning">전사 기능이 없으면 보류돼요</Badge>}
          {f.size > KB_INGEST_MAX_FILE_BYTES && <Badge tone="danger">100MiB 초과</Badge>}
          <button type="button" className="kb3-files__remove" aria-label={`${f.name} 빼기`} onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}>×</button>
        </li>)}
      </ul>}
      <label className="kb-field"><span>웹 주소 (한 줄에 하나)</span>
        <textarea className="tk-textarea" rows={3} value={urlText} onChange={(e) => setUrlText(e.target.value)} placeholder={"https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"} /></label>
      <label className="kb-field"><span>직접 쓴 글</span>
        <textarea className="tk-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="붙여넣을 본문. 헤딩(#)이 있으면 절 경로로 쓰여요." /></label>
      <div className="kb3-ingest__row">
        <label className="kb-field"><span>제목 (항목이 하나일 때만 적용, 비우면 본문 첫 줄)</span>
          <input className="tk-input" value={title} maxLength={500} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="kb-field"><span id="kb3-ingest-domain-l">주제</span>
          <Select id="kb3-ingest-domain" labelledBy="kb3-ingest-domain-l" value={domain} options={DOMAIN_OPTIONS} onChange={setDomain} /></div>
      </div>
      {itemCount > 0 && <p className="kb-note" role="status">{`${itemCount}건 선택됨`}</p>}
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
        <p>글을 저장했어요. 이 서버는 자동 처리를 하지 않아 문서로만 저장돼요.</p>
        <Button size="sm" onClick={() => { onClose(); openDocument(legacyDone.document_id, legacyDone.revision_id); }}>문서 보기</Button>
      </div>}
      {done && <div className={registered > 0 ? "kb-callout" : "kb-callout kb3-callout--attention"} role="status">
        <p>{registered > 0 ? "접수했어요. 처리가 끝나면 지식 탐색과 그래프에 나타나요." : "새로 처리 대기에 올라간 항목이 없어요."} {ingestSummary(done.items)}</p>
        <ul className="kb3-files kb3-ingest-result" aria-label="접수 결과">
          {done.items.map((it, i) => {
            const v = ingestItemView(it);
            return <li key={`${i}-${it.job_id ?? it.name}`} data-status={it.status}>
              <span className="kb3-files__name">{it.name}</span>
              <Badge tone={v.tone}>{v.label}</Badge>
              {v.note && <span className={it.status === "failed" ? "tk-error" : "kb-note"}>{v.note}</span>}
              {v.canOpen && it.document_id && <Button size="sm" variant="ghost" onClick={() => { onClose(); openDocument(it.document_id!, it.revision_id ?? undefined); }}>열기</Button>}
            </li>;
          })}
        </ul>
        {done.items.some((i) => i.status === "failed") && <p className="kb-note">실패한 항목은 입력에 남겨 뒀어요. 고쳐서 다시 올릴 수 있어요.</p>}
        <Button size="sm" onClick={() => { onClose(); openJobs(); }}>처리 현황 보기</Button>
      </div>}
      <div className="kb-actions">
        <Button variant="primary" type="submit" busy={send.isPending}>추가</Button>
        <Button variant="ghost" onClick={onClose}>닫기</Button>
      </div>
    </form>
  </Dialog>;
}
