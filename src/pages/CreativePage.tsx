import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import {
  creativeCreate,
  creativeDemo,
  creativeEdit,
  creativeGet,
  creativeIllustrate,
  creativeList,
  creativeMedia,
  creativeRender,
  creativeUpload,
  draftOf,
} from "../api/creative";
import type {
  CreativeDraft,
  CreativeProject,
  CreativeScene,
} from "../api/creative";
import { errorText } from "../features/viewer/api";
import { PageHeader } from "../shell/PageHeader";
import { Button } from "../ui/Button";
import "./creative.css";

const sceneTime = (scenes: CreativeScene[], i: number) =>
  scenes.slice(0, i).reduce((n, s) => n + s.duration, 0);
const clock = (n: number) =>
  `${Math.floor(n / 60)}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;

function AssetImage({
  pid,
  id,
  alt,
  kind = "image",
  controls = false,
}: {
  pid: string;
  id: string | null;
  alt: string;
  kind?: string;
  controls?: boolean;
}) {
  const q = useQuery({
    queryKey: ["creative-media", pid, "asset", id],
    queryFn: () => creativeMedia(pid, "asset", id!),
    enabled: !!id,
    staleTime: 120000,
  });
  if (!id) return <span className="creative-placeholder">장면 이미지</span>;
  if (q.isError)
    return (
      <button type="button" onClick={() => void q.refetch()}>
        이미지 다시 불러오기
      </button>
    );
  if (q.data && kind === "video")
    return (
      <video
        src={q.data}
        controls={controls}
        muted={!controls}
        playsInline
        preload="metadata"
        aria-label={alt || "장면 클립"}
        onError={() => void q.refetch()}
      />
    );
  return q.data ? (
    <img
      src={q.data}
      alt={alt}
      loading="lazy"
      onError={() => void q.refetch()}
    />
  ) : (
    <span className="creative-placeholder">불러오는 중</span>
  );
}

export function CreativePage() {
  const q = useQuery({ queryKey: ["creative"], queryFn: creativeList });
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [duration, setDuration] = useState(30);
  const [aspect, setAspect] = useState("16:9");
  const [type, setType] = useState("music_video");
  const create = useMutation({
    mutationFn: () =>
      creativeCreate({ name, brief, duration, aspect, content_type: type }),
    onSuccess: (p) => navigate(`/creative/${p.id}`),
  });
  return (
    <div className="tk-screen">
      <PageHeader
        title="콘텐츠 스튜디오"
        meta="아이디어를 장면으로, 장면을 한 편의 영상으로"
      />
      <div className="tk-screen__body">
        <div className="tk-container creative-home">
          <div className="creative-intro">
            <span className="creative-eyebrow">
              AI CREATIVE STUDIO · PREVIEW
            </span>
            <h2>어떤 이야기를 만들까요?</h2>
            <p>
              음악과 이미지를 가져오고, 장면을 다듬어 하나의 영상으로
              완성하세요.
            </p>
          </div>
          <form
            className="creative-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <label className="creative-field">
              프로젝트 이름
              <input
                className="tk-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                placeholder="예: 작은 신호, 새벽으로 가는 여행"
              />
            </label>
            <label className="creative-field">
              만들고 싶은 콘텐츠
              <textarea
                className="tk-textarea"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                maxLength={6000}
                rows={3}
                placeholder="주제, 분위기, 등장인물과 이야기를 적어 주세요."
              />
            </label>
            <div className="creative-controls">
              <label className="creative-field">
                콘텐츠
                <select
                  className="tk-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="music_video">뮤직비디오</option>
                  <option value="animation">애니메이션</option>
                  <option value="education">설명·교육</option>
                  <option value="short">쇼츠</option>
                  <option value="narration">내레이션 영상</option>
                </select>
              </label>
              <label className="creative-field">
                목표 길이
                <select
                  className="tk-input"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  <option value={30}>30초</option>
                  <option value={60}>1분</option>
                  <option value={120}>2분</option>
                  <option value={240}>4분</option>
                </select>
              </label>
              <label className="creative-field">
                화면 비율
                <select
                  className="tk-input"
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value)}
                >
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                </select>
              </label>
            </div>
            {create.isError && (
              <p className="tk-error" role="alert">
                {errorText(create.error).message}
              </p>
            )}
            <Button
              type="submit"
              variant="primary"
              busy={create.isPending}
              disabled={!name.trim()}
            >
              프로젝트 만들기
            </Button>
          </form>
          <h2>내 프로젝트</h2>
          {q.isPending && <p role="status">프로젝트를 불러오는 중</p>}
          {q.isError && (
            <p className="tk-error" role="alert">
              {errorText(q.error).message}{" "}
              <Button onClick={() => void q.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {q.data?.length === 0 && (
            <div className="tk-empty tk-empty--boxed">
              <h3>첫 영상을 만들어 보세요</h3>
              <p>
                샘플 반주와 그래픽으로 30초 영상 제작을 바로 시험할 수 있어요.
              </p>
            </div>
          )}
          <div className="creative-projects">
            {q.data?.map((p) => (
              <Link
                className="creative-project"
                to={`/creative/${p.id}`}
                key={p.id}
              >
                <AssetImage
                  pid={p.id}
                  id={p.scenes[0]?.asset_id ?? null}
                  kind={
                    p.assets.find((a) => a.id === p.scenes[0]?.asset_id)?.kind
                  }
                  alt="첫 장면"
                />
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {clock(p.duration)} · {p.scenes.length}개 장면 ·{" "}
                    {p.render_jobs.some((j) => j.status === "succeeded")
                      ? "완성 영상 있음"
                      : "제작 중"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreativeDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["creative", id],
    queryFn: () => creativeGet(id),
    refetchInterval: 2500,
  });
  return (
    <div className="tk-screen">
      <PageHeader
        title={q.data?.name ?? "콘텐츠 제작"}
        meta="장면을 고르고, 수정하고, 영상으로 확인하세요"
        actions={
          <Link className="tk-button" to="/creative">
            목록
          </Link>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container creative-workspace">
          {q.isPending && <p role="status">제작 화면을 불러오는 중</p>}
          {q.isError && (
            <p role="alert" className="tk-error">
              {errorText(q.error).message}{" "}
              <Button onClick={() => void q.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {q.data && <Editor key={q.data.id} project={q.data} />}
        </div>
      </div>
    </div>
  );
}

function Editor({ project: p }: { project: CreativeProject }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CreativeDraft>(() => draftOf(p));
  const [selected, setSelected] = useState<string | undefined>(p.scenes[0]?.id);
  const [chosenRender, setChosenRender] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(p));
  const scenes = draft.scenes;
  const index = Math.max(
    0,
    scenes.findIndex((s) => s.id === selected),
  );
  const scene = scenes[index];
  const images = p.assets.filter(
    (a) => a.kind === "image" || a.kind === "video",
  );
  const music = p.assets.filter((a) => a.kind === "audio");
  const latest = p.render_jobs.at(-1);
  const completed = p.render_jobs.filter((j) => j.status === "succeeded");
  const renderId = chosenRender ?? completed.at(-1)?.id;
  const media = useQuery({
    queryKey: ["creative-media", p.id, "render", renderId],
    queryFn: () => creativeMedia(p.id, "render", renderId!),
    enabled: !!renderId,
    staleTime: 120000,
  });
  const audio = useQuery({
    queryKey: ["creative-media", p.id, "asset", draft.music_asset_id],
    queryFn: () => creativeMedia(p.id, "asset", draft.music_asset_id!),
    enabled: !!draft.music_asset_id,
    staleTime: 120000,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["creative", p.id] });
    await qc.invalidateQueries({ queryKey: ["creative"], exact: true });
  };
  const accept = async (result: CreativeProject) => {
    setDraft(draftOf(result));
    await refresh();
  };
  const action = useMutation({
    mutationFn: async (
      operation: "save" | "demo" | "illustrate" | "render" | File,
    ) => {
      if (operation === "save") return accept(await creativeEdit(p.id, draft));
      if (operation === "demo") return accept(await creativeDemo(p.id));
      if (operation === "illustrate")
        return accept(await creativeIllustrate(p.id, scene.id));
      if (operation === "render") {
        const job = await creativeRender(p.id, latest?.status === "failed");
        setChosenRender(job.status === "succeeded" ? job.id : null);
        return refresh();
      }
      await creativeUpload(p.id, operation);
      return accept(await creativeGet(p.id));
    },
  });
  const change = (values: Partial<CreativeScene>) =>
    setDraft((d) => ({
      ...d,
      scenes: d.scenes.map((s) =>
        s.id === scene.id ? { ...s, ...values } : s,
      ),
    }));
  const busy = action.isPending;
  const isVideo =
    p.assets.find((a) => a.id === scene?.asset_id)?.kind === "video";
  return (
    <>
      <div className="creative-toolbar">
        <span>
          {p.aspect} · 720p ·{" "}
          {clock(scenes.reduce((n, s) => n + s.duration, 0))} · {scenes.length}
          개 장면
        </span>
        <div className="creative-controls">
          <Button
            onClick={() => action.mutate("save")}
            busy={busy}
            disabled={!dirty}
          >
            변경 저장
          </Button>
          <Button
            variant="primary"
            onClick={() => action.mutate("render")}
            busy={busy}
            disabled={
              dirty ||
              !draft.music_asset_id ||
              scenes.some((s) => !s.asset_id) ||
              latest?.status === "running" ||
              latest?.status === "queued"
            }
          >
            {latest?.status === "failed" ? "렌더 재시도" : "영상 만들기"}
          </Button>
        </div>
      </div>
      {dirty && (
        <p className="tk-status" role="status">
          저장하지 않은 변경이 있어요. 저장한 뒤 업로드·생성·렌더할 수 있어요.{" "}
          {draft.revision !== p.revision && (
            <Button onClick={() => setDraft(draftOf(p))}>
              서버 변경 불러오기
            </Button>
          )}
        </p>
      )}
      {action.isError && (
        <p className="tk-error" role="alert">
          {errorText(action.error).message}
        </p>
      )}
      <div className="creative-production">
        <section
          className="creative-panel creative-preview"
          aria-label="미리보기"
        >
          <div className="creative-section-heading">
            <h2>영상 미리보기</h2>
            {completed.length > 0 && (
              <label className="creative-field">
                결과 비교
                <select
                  className="tk-input"
                  value={renderId}
                  onChange={(e) => setChosenRender(e.target.value)}
                >
                  {completed.map((j, i) => (
                    <option key={j.id} value={j.id}>
                      버전 {i + 1} ·{" "}
                      {new Date(j.created_at).toLocaleTimeString("ko-KR")}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div
            className="creative-stage"
            style={{ aspectRatio: draft.aspect.replace(":", "/") }}
          >
            {media.data ? (
              <video
                ref={videoRef}
                key={renderId}
                src={media.data}
                controls
                playsInline
                preload="metadata"
                onError={() => void media.refetch()}
              />
            ) : scene?.asset_id ? (
              <AssetImage
                pid={p.id}
                id={scene.asset_id}
                kind={isVideo ? "video" : "image"}
                controls
                alt={`장면 ${index + 1} 미리보기`}
              />
            ) : (
              <div className="creative-placeholder">
                <strong>장면에서 한 편의 영상으로</strong>
                <p>음악과 장면을 준비한 뒤 ‘영상 만들기’를 누르세요.</p>
              </div>
            )}
          </div>
          {media.isError && (
            <p role="alert" className="tk-error">
              미리보기를 불러오지 못했어요.{" "}
              <Button onClick={() => void media.refetch()}>
                다시 불러오기
              </Button>
            </p>
          )}
          {media.data && (
            <a
              className="tk-button"
              href={`${media.data}&download=true`}
              download={`${p.name}.mp4`}
              target="_blank"
              rel="noreferrer"
            >
              MP4 다운로드
            </a>
          )}
          {latest && (
            <div className="creative-render" aria-live="polite">
              <div className="creative-section-heading">
                <strong>
                  {
                    {
                      queued: "렌더 대기 중",
                      running: "장면을 합치는 중",
                      failed: "렌더 실패",
                      succeeded: "영상이 준비됐어요",
                    }[latest.status]
                  }
                </strong>
                <span>{latest.progress}%</span>
              </div>
              <progress
                value={latest.progress}
                max={100}
                aria-label="렌더 진행률"
              />
              {latest.error && <p className="tk-error">{latest.error}</p>}
              {latest.elapsed_seconds != null && (
                <small>
                  렌더 {latest.elapsed_seconds.toFixed(1)}초 · 캐시{" "}
                  {latest.cached_scenes}개 장면
                  {latest.peak_rss_bytes != null
                    ? ` · FFmpeg 최대 ${(latest.peak_rss_bytes / 1024 / 1024).toFixed(0)}MB`
                    : ""}
                </small>
              )}
            </div>
          )}
          <div className="creative-music">
            <h3>음악 트랙</h3>
            <label className="creative-field">
              사용할 음악
              <select
                className="tk-input"
                value={draft.music_asset_id ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    music_asset_id: e.target.value || null,
                  }))
                }
              >
                <option value="">음악 선택</option>
                {music.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {audio.data && (
              <audio
                src={audio.data}
                controls
                preload="metadata"
                onError={() => void audio.refetch()}
              />
            )}
            <p className="creative-hint">
              직접 올린 음악을 쓰거나 샘플 합성 반주로 시험하세요. 샘플은 보컬이
              없는 120 BPM 반주예요.
            </p>
          </div>
        </section>
        <section className="creative-panel" aria-label="장면 편집">
          <div className="creative-section-heading">
            <h2>장면 {index + 1}</h2>
            <span>
              {clock(sceneTime(scenes, index))}–
              {clock(sceneTime(scenes, index) + scene.duration)}
            </span>
          </div>
          <div className="creative-scene-preview">
            <AssetImage
              pid={p.id}
              id={scene.asset_id}
              kind={isVideo ? "video" : "image"}
              controls
              alt="선택한 장면"
            />
          </div>
          <fieldset disabled={busy} className="creative-editor-fields">
            <label className="creative-field">
              장면 설명·프롬프트
              <textarea
                className="tk-textarea"
                value={scene.prompt}
                maxLength={3000}
                rows={3}
                onChange={(e) => change({ prompt: e.target.value })}
              />
            </label>
            <label className="creative-field">
              화면 자막
              <textarea
                className="tk-textarea"
                value={scene.caption}
                maxLength={160}
                rows={2}
                onChange={(e) => change({ caption: e.target.value })}
              />
            </label>
            <div className="creative-controls">
              <label className="creative-field">
                길이(초)
                <input
                  className="tk-input"
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  value={scene.duration}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= 60) change({ duration: n });
                  }}
                />
              </label>
              <label className="creative-field">
                움직임
                <select
                  className="tk-input"
                  value={scene.animation}
                  onChange={(e) =>
                    change({
                      animation: e.target.value as CreativeScene["animation"],
                    })
                  }
                >
                  <option value="zoom_in">천천히 확대</option>
                  <option value="zoom_out">천천히 축소</option>
                  <option value="pan">옆으로 이동</option>
                  <option value="still">정지</option>
                </select>
              </label>
              <label className="creative-field">
                전환
                <select
                  className="tk-input"
                  value={scene.transition}
                  onChange={(e) =>
                    change({
                      transition: e.target.value as CreativeScene["transition"],
                    })
                  }
                >
                  <option value="fade">부드러운 페이드</option>
                  <option value="cut">바로 연결</option>
                </select>
              </label>
            </div>
            <label className="creative-field">
              장면 자산·이전 결과 비교
              <select
                className="tk-input"
                value={scene.asset_id ?? ""}
                onChange={(e) => change({ asset_id: e.target.value || null })}
              >
                <option value="">이미지·영상 선택</option>
                {images.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ·{" "}
                    {a.provenance === "user-upload" ? "업로드" : "생성 결과"}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="creative-controls">
            <Button
              disabled={dirty || busy}
              onClick={() => action.mutate("illustrate")}
            >
              그래픽 새 버전 생성
            </Button>
            <Button
              disabled={busy || scenes.length >= 60}
              onClick={() => {
                const id = crypto.randomUUID();
                setDraft((d) => ({
                  ...d,
                  scenes: [
                    ...d.scenes,
                    { ...scene, id, caption: "", prompt: "" },
                  ],
                }));
                setSelected(id);
              }}
            >
              장면 추가
            </Button>
            <Button
              disabled={busy || scenes.length <= 1}
              onClick={() => {
                setDraft((d) => ({
                  ...d,
                  scenes: d.scenes.filter((s) => s.id !== scene.id),
                }));
                setSelected(scenes.find((s) => s.id !== scene.id)?.id);
              }}
            >
              장면 빼기
            </Button>
          </div>
          <p className="creative-hint">
            그래픽 생성은 로컬 규칙 기반 일러스트예요. AI 생성 이미지도 파일로
            올려 사용할 수 있어요. 이전 자산은 보관됩니다.
          </p>
        </section>
      </div>
      <section className="creative-panel">
        <div className="creative-section-heading">
          <h2>타임라인</h2>
          <span>장면을 누르면 편집할 수 있어요</span>
        </div>
        <div
          className="creative-timeline"
          role="list"
          aria-label="영상 타임라인"
        >
          {scenes.map((s, i) => (
            <button
              type="button"
              role="listitem"
              aria-current={s.id === scene.id ? "step" : undefined}
              key={s.id}
              className="creative-shot"
              onClick={() => {
                setSelected(s.id);
                if (videoRef.current)
                  videoRef.current.currentTime = sceneTime(scenes, i);
              }}
            >
              <AssetImage
                pid={p.id}
                id={s.asset_id}
                kind={p.assets.find((a) => a.id === s.asset_id)?.kind}
                alt=""
              />
              <strong>
                {i + 1}. {clock(sceneTime(scenes, i))}
              </strong>
              <span>
                {s.duration}초 · {s.caption || "자막 없음"}
              </span>
            </button>
          ))}
        </div>
        <div className="creative-music-strip">
          ♫ 음악 ·{" "}
          {music.find((a) => a.id === draft.music_asset_id)?.name ??
            "아직 선택하지 않았어요"}
        </div>
      </section>
      <section className="creative-panel">
        <h2>기획과 자산</h2>
        <div className="creative-controls">
          <Button
            disabled={dirty || busy}
            busy={busy}
            onClick={() => action.mutate("demo")}
          >
            샘플 반주·빈 장면 채우기
          </Button>
          <label
            className="tk-button creative-upload"
            aria-disabled={dirty || busy}
          >
            음악·이미지·영상 올리기
            <input
              type="file"
              disabled={dirty || busy}
              accept="image/png,image/jpeg,image/webp,audio/*,video/mp4,video/quicktime,video/webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) action.mutate(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="creative-hint">
          100MB 이하 · 업로드 자산과 생성 이력은 프로젝트 안에 보관돼요.
        </p>
        <div className="creative-planning">
          <label className="creative-field">
            제목
            <input
              className="tk-input"
              maxLength={120}
              value={draft.name}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </label>
          <label className="creative-field">
            화면 비율
            <select
              className="tk-input"
              value={draft.aspect}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  aspect: e.target.value as CreativeDraft["aspect"],
                }))
              }
            >
              <option>16:9</option>
              <option>9:16</option>
              <option>1:1</option>
            </select>
          </label>
          <label className="creative-field">
            제작 의도
            <textarea
              className="tk-textarea"
              value={draft.brief}
              maxLength={6000}
              rows={3}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, brief: e.target.value }))
              }
            />
          </label>
          <label className="creative-field">
            공통 스타일
            <textarea
              className="tk-textarea"
              value={draft.style}
              maxLength={1000}
              rows={2}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, style: e.target.value }))
              }
            />
          </label>
        </div>
        <details>
          <summary>
            생성 이력 {p.generation_jobs.length}건 · 자산 {p.assets.length}개
          </summary>
          <ul>
            {p.generation_jobs.map((j) => (
              <li key={j.id}>
                {j.model} · {j.status} · {j.elapsed_seconds.toFixed(2)}초
              </li>
            ))}
          </ul>
          <p className="creative-hint">
            AI 기획·보컬·영상 모델의 자동 호출은 후속 단계입니다. 현재는 직접
            편집·업로드·로컬 그래픽·반주·합성을 지원합니다.
          </p>
        </details>
      </section>
    </>
  );
}
