import type { ExportFormat } from "../../api/sharingTypes";

/** 임시 Blob URL만 사용한다. 공유 비밀이나 owner 토큰은 파일 URL에 넣지 않는다. */
export function saveExport(blob: Blob, format: ExportFormat) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meeting-export.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
