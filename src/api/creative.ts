import { apiUrl, json } from "./client";

export interface CreativeScene {
  id: string;
  duration: number;
  prompt: string;
  caption: string;
  asset_id: string | null;
  animation: "still" | "zoom_in" | "zoom_out" | "pan";
  transition: "fade" | "cut";
}
export interface CreativeAsset {
  id: string;
  kind: "audio" | "image" | "video";
  name: string;
  provenance: string;
  sha256: string;
  metadata: { duration?: number; bpm?: number; vocal?: boolean };
}
export interface CreativeJob {
  id: string;
  status: "queued" | "running" | "failed" | "succeeded";
  progress: number;
  output: string | null;
  error: string | null;
  elapsed_seconds: number | null;
  peak_rss_bytes: number | null;
  cached_scenes: number;
  created_at: string;
}
export interface CreativeProject {
  id: string;
  revision: number;
  name: string;
  brief: string;
  content_type: string;
  style: string;
  aspect: "16:9" | "9:16" | "1:1";
  duration: number;
  music_asset_id: string | null;
  scenes: CreativeScene[];
  assets: CreativeAsset[];
  render_jobs: CreativeJob[];
  generation_jobs: Array<{
    id: string;
    model: string;
    elapsed_seconds: number;
    output_asset_id: string;
    status: string;
  }>;
  updated_at: string;
}
export type CreativeDraft = Pick<
  CreativeProject,
  | "revision"
  | "name"
  | "brief"
  | "style"
  | "aspect"
  | "music_asset_id"
  | "scenes"
>;
export const draftOf = (p: CreativeProject): CreativeDraft => ({
  revision: p.revision,
  name: p.name,
  brief: p.brief,
  style: p.style,
  aspect: p.aspect,
  music_asset_id: p.music_asset_id,
  scenes: p.scenes,
});
const root = "/api/creative/projects";
export const creativeList = () => json<CreativeProject[]>(root);
export const creativeGet = (id: string) =>
  json<CreativeProject>(`${root}/${id}`);
export const creativeCreate = (body: {
  name: string;
  brief: string;
  duration: number;
  aspect: string;
  content_type: string;
}) => json<CreativeProject>(root, { method: "POST", json: body });
export const creativeEdit = (id: string, body: CreativeDraft) =>
  json<CreativeProject>(`${root}/${id}`, { method: "PATCH", json: body });
export const creativeDemo = (id: string) =>
  json<CreativeProject>(`${root}/${id}/demo`, { method: "POST" });
export const creativeIllustrate = (id: string, sceneId: string) =>
  json<CreativeProject>(`${root}/${id}/scenes/${sceneId}/illustration`, {
    method: "POST",
  });
export const creativeRender = (id: string, retry = false) =>
  json<CreativeJob>(`${root}/${id}/renders`, {
    method: "POST",
    json: { retry },
  });
export const creativeUpload = (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return json<CreativeAsset>(`${root}/${id}/assets`, { method: "POST", form });
};
export const creativeMedia = async (
  pid: string,
  kind: "asset" | "render",
  id: string,
) => {
  const link = await json<{ url: string }>(`${root}/${pid}/media-link`, {
    method: "POST",
    json: { kind, id },
  });
  return apiUrl(link.url);
};
