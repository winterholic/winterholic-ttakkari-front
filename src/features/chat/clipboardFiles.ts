/** 백엔드 config.upload_max_bytes 기본값과 같다. 서버가 413 으로 막기 전에 미리 알려 준다. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
/** 백엔드 RunIn.context_artifact_ids max_length 와 같다. */
export const MAX_CONTEXT_FILES = 10;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/avif": "avif",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 브라우저가 스크린샷 blob 에 붙이는 이름("image.png" 등)이거나 이름이 없는 경우. */
function isAnonymous(file: File): boolean {
  return file.name === "" || /^image\.[a-z0-9]+$/i.test(file.name);
}

/** 이름 없는 붙여넣기는 paste-YYYYMMDD-HHmmss.png 로 바꾼다. 같은 초에 여러 장이면 -2, -3 을 붙인다. */
export function nameClipboardFiles(files: File[], now = new Date()): File[] {
  const stamp = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("") + "-" + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
  let n = 0;
  return files.map((f) => {
    if (!isAnonymous(f)) return f;
    n += 1;
    const ext = MIME_EXT[f.type] ?? (f.type.startsWith("image/") ? "png" : "bin");
    const suffix = n > 1 ? "-" + n : "";
    return new File([f], "paste-" + stamp + suffix + "." + ext, { type: f.type, lastModified: f.lastModified });
  });
}

/**
 * 붙여넣기에서 첨부할 파일을 꺼낸다. 없으면 [] 이고 기본 붙여넣기(텍스트)를 그대로 둔다.
 * text/html 이 같이 있으면(웹페이지·엑셀·워드에서 복사) 사용자가 원한 것은 텍스트라 파일을 가져가지 않는다.
 * 스크린샷, 탐색기·Finder 에서 복사한 파일처럼 파일만(또는 파일 이름 text/plain 과 함께) 있을 때만 첨부한다.
 */
export function filesFromClipboard(data: DataTransfer | null, now = new Date()): File[] {
  if (!data) return [];
  if (Array.from(data.types ?? []).includes("text/html")) return [];
  let files = Array.from(data.files ?? []);
  // 일부 브라우저는 files 를 비우고 items 에만 파일을 둔다.
  if (files.length === 0) {
    files = Array.from(data.items ?? []).flatMap((it) => {
      if (it.kind !== "file") return [];
      const f = it.getAsFile();
      return f ? [f] : [];
    });
  }
  return nameClipboardFiles(files, now);
}

export interface AttachCheck {
  accepted: File[];
  /** 사용자에게 알릴 문장들(실패한 이유별로 한 줄). */
  problems: string[];
}

/** 크기·개수 규칙. 입력창 붙여넣기, 파일 선택, 드롭이 모두 같은 규칙을 쓴다. */
export function checkAttachFiles(files: File[], currentCount: number): AttachCheck {
  const accepted: File[] = [];
  let tooBig = 0;
  let empty = 0;
  let overflow = 0;
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) tooBig += 1;
    else if (f.size === 0) empty += 1;
    else if (currentCount + accepted.length >= MAX_CONTEXT_FILES) overflow += 1;
    else accepted.push(f);
  }
  const problems: string[] = [];
  if (tooBig) problems.push(MAX_UPLOAD_BYTES / (1024 * 1024) + "MB 를 넘는 파일 " + tooBig + "개는 올릴 수 없어요.");
  if (empty) problems.push("비어 있는 파일이나 폴더 " + empty + "개는 건너뛰었어요.");
  if (overflow) problems.push("한 번에 " + MAX_CONTEXT_FILES + "개까지만 붙일 수 있어서 " + overflow + "개는 뺐어요.");
  return { accepted, problems };
}
