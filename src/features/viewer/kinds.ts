import type { ArtifactOut, ExportPolicy, PreviewStatus } from "../../api/types";

/** 뷰어가 고르는 화면. kind·preview_status·export_policy 만으로 정해지는 순수 함수의 결과다. */
export type ViewMode =
  | "blocked"
  | "markdown"
  | "pdf"
  | "code"
  | "sheet"
  | "image"
  | "html"
  | "preview-pdf"
  | "preview-pending"
  | "preview-converting"
  | "preview-failed"
  | "preview-unavailable"
  | "other";

export function resolveViewMode(a: Pick<ArtifactOut, "kind" | "preview_status" | "export_policy">): ViewMode {
  // 민감 자료는 백엔드가 content 를 403 으로 막는다. 요청 자체를 하지 않고 정책 상태를 보여 준다.
  if (a.export_policy === "sensitive") return "blocked";
  switch (a.kind) {
    case "markdown":
      return "markdown";
    case "pdf":
      return "pdf";
    case "code":
      return "code";
    case "sheet":
      return "sheet";
    case "image":
      return "image";
    case "html":
      return "html";
    case "pptx":
    case "docx":
      return previewMode(a.preview_status);
    default:
      return "other";
  }
}

function previewMode(s: PreviewStatus): ViewMode {
  switch (s) {
    case "ready":
      return "preview-pdf";
    case "pending":
      return "preview-pending";
    case "processing":
      return "preview-converting";
    case "failed":
      return "preview-failed";
    default:
      // unavailable, not_required(변환 대상인데 상태가 없는 경우)
      return "preview-unavailable";
  }
}

/** 변환 대기·진행 중이면 5초마다 다시 조회한다. */
export const PREVIEW_POLL_MS = 5000;
export const shouldPollPreview = (a: Pick<ArtifactOut, "kind" | "preview_status">): boolean =>
  (a.kind === "pptx" || a.kind === "docx") && (a.preview_status === "pending" || a.preview_status === "processing");

export interface DownloadState {
  enabled: boolean;
  reason: string | null;
}

const REASONS: Record<ExportPolicy, string> = {
  allow: "이 결과물은 지금 다운로드할 수 없어요.",
  deny: "반출이 차단된 자료라 다운로드할 수 없어요.",
  sensitive: "민감 자료는 원격 다운로드가 막혀 있어요. Mac Studio 에서 직접 여세요.",
};

export function downloadState(a: Pick<ArtifactOut, "downloadable" | "export_policy">): DownloadState {
  if (a.downloadable && a.export_policy !== "deny" && a.export_policy !== "sensitive") return { enabled: true, reason: null };
  return { enabled: false, reason: REASONS[a.export_policy] };
}

/** 툴바에 어떤 도구가 있는지. 없는 기능은 자리를 비우지 않고 버튼을 뺀다(docs/09 §2). */
export function toolsFor(mode: ViewMode): { zoom: boolean; find: boolean; pages: boolean } {
  return {
    zoom: mode === "pdf" || mode === "preview-pdf" || mode === "image",
    find: mode === "markdown" || mode === "code",
    pages: mode === "pdf" || mode === "preview-pdf",
  };
}

export const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300] as const;
export function stepZoom(current: number, dir: "in" | "out"): number {
  if (dir === "in") return ZOOM_STEPS.find((z) => z > current) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current) ?? ZOOM_STEPS[0];
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(i + 1).toLowerCase() : "";
}

/** docs/19 §3: 한글 조합 중 Enter 는 보내지 않는다. 터치 기기의 Enter 는 줄바꿈. */
export function shouldSubmitOnEnter(e: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  keyCode: number;
  isComposing: boolean;
}, coarsePointer: boolean): boolean {
  if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return false;
  const mod = e.metaKey || e.ctrlKey;
  return mod || (!e.shiftKey && !coarsePointer);
}

/** 파일 이름으로 고르는 글리프 계열(파일 찾기 목록용). 서버가 kind 를 주는 결과물은 KIND_GLYPH 를 쓴다. */
export function glyphTypeForFilename(filename: string): { type: string; icon: "file-text" | "file-pdf" | "presentation" | "sheet" | "image" | "file-code" | "globe" | "file-archive" } {
  const e = extOf(filename);
  if (["md", "markdown", "txt", "docx", "doc", "rtf"].includes(e)) return { type: "doc", icon: "file-text" };
  if (e === "pdf") return { type: "pdf", icon: "file-pdf" };
  if (["pptx", "ppt", "key"].includes(e)) return { type: "slide", icon: "presentation" };
  if (["xlsx", "xls", "csv", "tsv"].includes(e)) return { type: "sheet", icon: "sheet" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(e)) return { type: "image", icon: "image" };
  if (["html", "htm"].includes(e)) return { type: "doc", icon: "globe" };
  if (["py", "ts", "tsx", "js", "jsx", "json", "yaml", "yml", "toml", "sh", "go", "rs", "java", "c", "cpp", "css", "sql", "log", "xml"].includes(e)) return { type: "code", icon: "file-code" };
  return { type: "other", icon: "file-archive" };
}

/** 오늘이면 시각, 아니면 월.일, 해가 다르면 연.월.일. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.getFullYear() === now.getFullYear() ? `${p(d.getMonth() + 1)}.${p(d.getDate())}` : `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

export function dayGroup(iso: string, now = new Date()): "오늘" | "이번 주" | "그 전" {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return "오늘";
  return now.getTime() - d.getTime() < 7 * 86_400_000 ? "이번 주" : "그 전";
}

/** 보존 기한이 7일 안이면 "N일 뒤 정리"(amber), 아니면 null. */
export function retentionSoon(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
  if (days > 7) return null;
  return days <= 0 ? "곧 정리" : `${days}일 뒤 정리`;
}
