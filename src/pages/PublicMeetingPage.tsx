import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router";
import { ApiError, downloadPublicMeetingShare, getPublicMeetingShare } from "../api/client";
import type { ExportFormat, ExportPart } from "../api/sharingTypes";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { MeetingDocumentView, FORMAT_LABELS, PART_LABELS } from "../features/meetings/MeetingDocumentView";
import { saveExport } from "../features/meetings/saveExport";
import "../features/meetings/meetings.css";
import "../features/meetings/sharing.css";

export function PublicMeetingPage() {
  const { shareId = "" } = useParams();
  const { hash } = useLocation();
  // 재방문할 수 있게 fragment는 주소에 남기되 쿠키나 웹 저장소에는 복사하지 않는다.
  const key = new URLSearchParams(hash.slice(1)).get("key") ?? "";
  if (!/^ps1_[A-Za-z0-9_-]{43}$/.test(key)) return <PublicFrame><h1>공유 링크를 확인해 주세요</h1><p>받은 주소의 # 뒤까지 포함한 전체 공유 링크로 열어 주세요.</p></PublicFrame>;
  return <PublicContent key={`${shareId}-${key}`} id={shareId} capability={key} />;
}

function PublicFrame({ children }: { children: React.ReactNode }) {
  return <main className="mt-public"><div className="mt-public__paper"><div className="mt-public__brand">Ttakkari <span>공유 문서</span></div>{children}<footer className="mt-public__footer">게시자가 선택한 자료를 보여 주는 읽기 전용 페이지예요.</footer></div></main>;
}

function PublicContent({ id, capability }: { id: string; capability: string }) {
  const instance = useId();
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [part, setPart] = useState<ExportPart>("document");
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const q = useQuery({
    queryKey: ["public-meeting", instance, id], queryFn: () => getPublicMeetingShare(id, capability),
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: "always", refetchInterval: 60_000,
  });
  if (q.isPending) return <PublicFrame><p role="status">공유 문서를 불러오는 중이에요.</p></PublicFrame>;
  if (q.isError || blocked) return <PublicFrame><h1>공유를 열 수 없어요</h1><p>링크가 만료되었거나 공유가 해제됐을 수 있어요. 보낸 사람에게 확인해 주세요.</p><Button onClick={() => { setBlocked(false); void q.refetch(); }}>다시 확인</Button></PublicFrame>;
  const data = q.data;
  const chosen = data.downloads.find((f) => f.format === format) ?? data.downloads[0];
  const selectedPart = chosen?.parts.includes(part) ? part : chosen?.parts[0];
  const download = async () => {
    if (!chosen || !selectedPart) return;
    setBusy(true); setDownloadError("");
    try { saveExport(await downloadPublicMeetingShare(id, capability, chosen.format, selectedPart, data.publication_revision), chosen.format); }
    catch (e) {
      if (e instanceof ApiError && [404, 401, 403].includes(e.status)) setBlocked(true);
      else if (e instanceof ApiError && e.status === 409) { setDownloadError("공개 내용이 갱신됐어요. 내용을 다시 확인하고 다운로드해 주세요."); void q.refetch(); }
      else setDownloadError(e instanceof ApiError && e.status === 429 ? "잠시 뒤 다시 다운로드해 주세요." : "파일을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };
  return <PublicFrame>
    <header className="mt-public__header"><h1>{data.document.title}</h1>
      {data.document.held_at && <p>{new Date(data.document.held_at).toLocaleString("ko-KR")}</p>}
      <p className="tk-help">게시 {new Date(data.published_at).toLocaleDateString("ko-KR")} · {new Date(data.expires_at).toLocaleString("ko-KR")}까지</p>
    </header>
    <div className="mt-public__tools"><Button size="sm" busy={q.isFetching} onClick={() => void q.refetch()}>새로 확인</Button>
      {chosen && <><label className="tk-field">다운로드 형식<span className="tk-select"><select value={chosen.format} disabled={busy} onChange={(e) => { const f = e.target.value as ExportFormat; setFormat(f); setPart(data.downloads.find((d) => d.format === f)?.parts[0] ?? "document"); }}>{data.downloads.map((d) => <option key={d.format} value={d.format}>{FORMAT_LABELS[d.format]}</option>)}</select></span></label>
        {chosen.format === "csv" && <label className="tk-field">CSV 목록<span className="tk-select"><select disabled={busy} value={selectedPart} onChange={(e) => setPart(e.target.value as ExportPart)}>{chosen.parts.map((p) => <option key={p} value={p}>{PART_LABELS[p]}</option>)}</select></span></label>}
        <Button size="sm" busy={busy} disabled={q.isFetching} onClick={() => void download()}><Icon name="download" />다운로드</Button></>}
    </div>
    {downloadError && <p className="tk-error" role="alert">{downloadError}</p>}
    <MeetingDocumentView document={data.document} />
  </PublicFrame>;
}
