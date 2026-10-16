import type { ExportFormat } from "../../api/sharingTypes";

/** 서버가 만드는 형식에 더해, 브라우저에서 만드는 HTML 사본도 같은 경로로 저장한다. */
export type SaveFormat = ExportFormat | "html";

/** 임시 Blob URL만 사용한다. 공유 비밀이나 owner 토큰은 파일 URL에 넣지 않는다. */
export function saveExport(blob: Blob, format: SaveFormat) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `meeting-export.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
