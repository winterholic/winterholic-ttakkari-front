import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, exportMeetingDocument, listMeetingShares, previewMeetingShare, publishMeetingShare, republishMeetingShare, revokeMeetingShare } from "../../api/client";
import type { MeetingDetail } from "../../api/client";
import type { ExportFormat, ExportPart, MeetingSection, MeetingSelection, OwnerShare, ShareInput, SharePreview } from "../../api/sharingTypes";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { MeetingDocumentView, FORMAT_LABELS, PART_LABELS, SECTION_LABELS } from "./MeetingDocumentView";
import { saveExport } from "./saveExport";
import "./sharing.css";

type Mode = "download" | "share";
const FORMATS: ExportFormat[] = ["txt", "md", "json", "csv"];
const shareKey = (id: string) => ["meetings", "shares", id];

export function shareError(error: unknown): string {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      sharing_disabled: "서버에서 공개 공유를 준비 중이에요. 개인 다운로드는 사용할 수 있어요.",
      source_changed: "원본 내용이 바뀌었어요. 미리보기를 다시 확인해 주세요.",
      revision_conflict: "공개 내용이 바뀌었어요. 새로 불러온 뒤 다시 시도해 주세요.",
      already_shared: "이미 활성 공유가 있어요. 기존 공유를 갱신하거나 해제해 주세요.",
      source_not_ready: "자료가 아직 준비되지 않았어요. 전사·분석이 끝난 뒤 다시 시도해 주세요.",
    };
    return messages[error.code] ?? error.message;
  }
  return "연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

export function MeetingSharing({ m }: { m: MeetingDetail }) {
  const [mode, setMode] = useState<Mode | null>(null);
  return <>
    <div className="mt-delivery" aria-label="회의록 전달">
      <span className="tk-help">필요한 내용만 골라 전달해요</span>
      <div className="tk-button-group">
        <Button size="sm" onClick={() => setMode("download")}><Icon name="download" />다운로드</Button>
        <Button size="sm" onClick={() => setMode("share")}><Icon name="share" />공유</Button>
      </div>
    </div>
    {mode && <DeliveryDialog key={`${m.id}-${mode}`} m={m} mode={mode} onClose={() => setMode(null)} />}
  </>;
}

function DeliveryDialog({ m, mode, onClose }: { m: MeetingDetail; mode: Mode; onClose: () => void }) {
  const qc = useQueryClient();
  const sharing = mode === "share";
  const [selection, setSelection] = useState<MeetingSelection>({ sections: sharing ? ["summary", "decisions", "actions"] : ["summary", "decisions", "actions", "discussions", "open_issues", "transcript"], include_people: false, include_evidence: false });
  const [formats, setFormats] = useState<ExportFormat[]>(["txt", "md", "json", "csv"]);
  const [confirmed, setConfirmed] = useState(false);
  const [days, setDays] = useState("7");
  const [reviewed, setReviewed] = useState<{ input: ShareInput; preview: SharePreview } | null>(null);
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [part, setPart] = useState<ExportPart>("document");
  const [issued, setIssued] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const shares = useQuery({ queryKey: shareKey(m.id), queryFn: () => listMeetingShares(m.id), enabled: sharing, refetchOnWindowFocus: true });
  const active = shares.data?.find((s) => s.effective_state === "active");
  const input: ShareInput = { resource: { type: "meeting", id: m.id }, selection, download_formats: sharing ? formats : [], confirm_work_scope: m.scope === "work" && confirmed };
  const invalidateReview = () => { setReviewed(null); preview.reset(); action.reset(); };
  const preview = useMutation({ mutationFn: () => previewMeetingShare(input), onSuccess: (data) => { setReviewed({ input, preview: data }); setPart("document"); setFormat("txt"); } });
  const action = useMutation({
    mutationFn: async () => {
      if (!reviewed) return;
      if (!sharing) {
        const blob = await exportMeetingDocument({ resource: reviewed.input.resource, selection: reviewed.input.selection, format, part, expected_source_revision: reviewed.preview.source_revision });
        saveExport(blob, format); return;
      }
      const supported = reviewed.preview.format_options.filter((f) => f.enabled && f.applicable).map((f) => f.format);
      const body = { ...reviewed.input, download_formats: (reviewed.input.download_formats ?? []).filter((f) => supported.includes(f)), expected_source_revision: reviewed.preview.source_revision, expires_at: new Date(Date.now() + Number(days) * 86400000).toISOString() };
      const result = active
        ? await republishMeetingShare(active.id, { ...body, expected_publication_revision: active.publication_revision })
        : await publishMeetingShare(body);
      if (result.capability_url) setIssued(result.capability_url);
      await qc.invalidateQueries({ queryKey: shareKey(m.id) });
      return result;
    },
    onError: (err) => { if (err instanceof ApiError && ["source_changed", "revision_conflict"].includes(err.code)) { setReviewed(null); void shares.refetch(); } },
  });
  const revoke = useMutation({ mutationFn: revokeMeetingShare, onSuccess: async () => { setIssued(""); setRevokeId(null); action.reset(); await qc.invalidateQueries({ queryKey: shareKey(m.id) }); } });
  const busy = preview.isPending || action.isPending || revoke.isPending;
  const available = reviewed?.preview.format_options.filter((f) => f.enabled && f.applicable) ?? [];
  const parts = available.find((f) => f.format === format)?.parts ?? [];
  const canPreview = selection.sections.length > 0 && (m.scope !== "work" || confirmed);
  const error = preview.error || action.error || revoke.error;
  return <Dialog open title={sharing ? "회의록 공유" : "회의록 다운로드"} size="lg" modal={busy} onClose={onClose} footer={<>
    <Button onClick={onClose} disabled={busy}>닫기</Button>
    {sharing && action.isSuccess ? <Button variant="primary" onClick={onClose}>확인</Button> : !reviewed ? <Button variant="primary" disabled={!canPreview || busy} busy={preview.isPending} onClick={() => preview.mutate()}>미리보기</Button>
      : <Button variant="primary" disabled={busy || (!sharing && !parts.includes(part)) || (sharing && (shares.isPending || shares.isError || reviewed.preview.public_sharing_enabled === false))} busy={action.isPending} onClick={() => action.mutate()}>{sharing ? (active ? "공개 내용 갱신" : "공개 링크 만들기") : "파일 저장"}</Button>}
  </>}>
    <div className="mt-share-form">
      <p className="tk-help">{sharing ? "선택해 게시한 내용만 링크를 가진 사람이 로그인 없이 볼 수 있어요. 원본 수정은 자동 공개되지 않아요." : "선택한 내용만 파일로 저장해요. 공개 링크는 만들어지지 않아요."}</p>
      <div className="mt-share-controls" hidden={!!reviewed}><fieldset disabled={busy} className="mt-share-fields"><legend>포함할 내용</legend><div className="mt-share-checks">
        {(Object.keys(SECTION_LABELS) as MeetingSection[]).map((s) => <label key={s}><input type="checkbox" checked={selection.sections.includes(s)} onChange={(e) => {
          invalidateReview(); setSelection({ ...selection, sections: e.target.checked ? [...selection.sections, s] : selection.sections.filter((v) => v !== s), include_evidence: s === "transcript" && !e.target.checked ? false : selection.include_evidence });
        }} />{SECTION_LABELS[s]}</label>)}
      </div><div className="mt-share-checks">
        <label><input type="checkbox" checked={selection.include_people} onChange={(e) => { invalidateReview(); setSelection({ ...selection, include_people: e.target.checked }); }} />참석자·화자 이름·담당자 포함</label>
        <label><input type="checkbox" disabled={!selection.sections.includes("transcript")} checked={selection.include_evidence} onChange={(e) => { invalidateReview(); setSelection({ ...selection, include_evidence: e.target.checked }); }} />근거 발화 포함</label>
      </div></fieldset>
      {m.scope === "work" && <label className="mt-share-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => { invalidateReview(); setConfirmed(e.target.checked); }} />회사 자료의 선택 내용과 외부 전달 가능 여부를 확인했어요</label>}
      {sharing && <fieldset disabled={busy} className="mt-share-fields"><legend>받는 사람이 다운로드할 형식</legend><div className="mt-share-checks">
        {FORMATS.map((f) => <label key={f}><input type="checkbox" checked={formats.includes(f)} onChange={(e) => { invalidateReview(); setFormats(e.target.checked ? [...formats, f] : formats.filter((x) => x !== f)); }} />{FORMAT_LABELS[f]}</label>)}
      </div><p className="tk-help">모두 끄면 조회만 허용해요. CSV는 시각이 있는 전사나 분석 목록을 선택했을 때 제공해요.</p>
        <label className="tk-field">링크 유효 기간<span className="tk-select"><select value={days} onChange={(e) => setDays(e.target.value)}><option value="1">1일</option><option value="7">7일</option><option value="30">30일</option></select></span></label>
      </fieldset>}</div>
      {reviewed && !(sharing && action.isSuccess) && <>
        <div className="mt-share-review-head"><p className="tk-help">포함: {reviewed.input.selection.sections.map((s) => SECTION_LABELS[s]).join(" · ")}{sharing ? ` / ${days}일간 공유` : ""}</p><Button size="sm" disabled={busy} onClick={invalidateReview}>선택 바꾸기</Button></div>
        <section className="mt-share-preview" aria-label="전달 내용 미리보기"><h3>전달 내용 미리보기</h3><p className="tk-help">이 내용으로 {sharing ? "공개돼요. 게시 전에 확인해 주세요." : "저장돼요."}</p><MeetingDocumentView document={reviewed.preview.document} /></section>
        {!sharing && <div className="mt-share-format"><label className="tk-field">파일 형식<span className="tk-select"><select value={format} onChange={(e) => { const f = e.target.value as ExportFormat; setFormat(f); setPart(available.find((o) => o.format === f)?.parts[0] ?? "document"); }}>{available.map((f) => <option key={f.format} value={f.format}>{FORMAT_LABELS[f.format] ?? f.format}</option>)}</select></span></label>
          {format === "csv" && <label className="tk-field">CSV에 담을 목록<span className="tk-select"><select value={part} onChange={(e) => setPart(e.target.value as ExportPart)}>{parts.map((p) => <option key={p} value={p}>{PART_LABELS[p]}</option>)}</select></span></label>}
        </div>}
      </>}
      <p className="tk-help">PDF·Word·자막 파일은 아직 지원하지 않아요.</p>
      {sharing && reviewed?.preview.public_sharing_enabled === false && <p className="tk-help" role="status">공개 공유는 서버 업데이트 후 사용할 수 있어요. 개인 다운로드는 지금 사용할 수 있어요.</p>}
      {error && <p className="tk-error" role="alert">{shareError(error)}</p>}
      {action.isSuccess && <p role="status" className="tk-help">{sharing ? "공개 내용을 게시했어요." : "파일 저장을 요청했어요."}</p>}
      {issued && <div className="mt-share-issued"><label className="tk-field">공유 링크<textarea className="tk-textarea" readOnly value={issued} rows={3} onFocus={(e) => e.target.select()} /></label>
        <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(issued); setCopied(true); setCopyFailed(false); } catch { setCopyFailed(true); } }}><Icon name="copy" />{copied ? "복사했어요" : "링크 복사"}</Button>
        <p className="tk-help">링크는 이 창에서만 복사할 수 있어요. 잃어버리면 기존 공유를 해제하고 새로 만드세요. 링크를 전달받은 사람은 다시 전달할 수도 있어요.</p>
        {copyFailed && <p className="tk-help" role="status">위 링크를 눌러 직접 복사해 주세요.</p>}
      </div>}
      {sharing && <section className="mt-share-history" aria-label="기존 공유"><h3>기존 공유</h3>
        {shares.isPending && <p role="status">공유 상태를 불러오는 중이에요.</p>}
        {shares.isError && <p className="tk-error" role="alert">공유 상태를 불러오지 못했어요. <Button size="sm" onClick={() => void shares.refetch()}>다시 확인</Button></p>}
        {shares.data?.length === 0 && <p className="tk-help">아직 공개한 링크가 없어요.</p>}
        {shares.data?.map((s: OwnerShare) => <div key={s.id} className="mt-share-history__row"><p><strong>{{ active: "공유 중", expired: "만료", unavailable: "사용 불가", revoked: "해제됨" }[s.effective_state]}</strong> · {new Date(s.expires_at).toLocaleString("ko-KR")}까지</p>
          {s.effective_state === "active" && (revokeId === s.id ? <div><p className="tk-help">이 링크로 더 이상 열 수 없게 할까요? 이미 저장한 사본은 남아요.</p><Button size="sm" disabled={busy} onClick={() => setRevokeId(null)}>취소</Button><Button size="sm" variant="danger" busy={revoke.isPending} disabled={busy} onClick={() => revoke.mutate(s.id)}>공유 해제 확인</Button></div> : <Button size="sm" disabled={busy} onClick={() => setRevokeId(s.id)}>공유 해제</Button>)}
        </div>)}
      </section>}
    </div>
  </Dialog>;
}
