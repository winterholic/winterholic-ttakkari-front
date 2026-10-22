import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router";
import {
  getProductionRecord,
  isRecordsUnsupported,
  listProductionRecords,
  mediaSrc,
} from "../api/productionRecords";
import type {
  ProductionRecord,
  RecordKind,
  RecordMedia,
  RecordMetric,
  RecordShot,
  RecordSource,
  RecordStatus,
  RecordSummary,
  RecordVerdict,
  Scalar,
} from "../api/productionRecords";
import { errorText } from "../features/viewer/api";
import { PageHeader } from "../shell/PageHeader";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "./productionRecords.css";

type Tone = "info" | "success" | "warning" | "danger" | undefined;

const KIND_LABEL: Record<RecordKind, string> = {
  production: "일반 제작",
  project: "스튜디오 프로젝트",
  motion_graphics: "모션그래픽",
  music_video: "뮤직비디오",
  cinematic_3d: "시네마틱 3D",
  character_video: "캐릭터 영상",
  audio: "오디오",
  image: "이미지",
  video_gen: "영상 생성",
  benchmark: "벤치마크",
  pipeline: "파이프라인",
  design: "설계",
};
const STATUS_LABEL: Record<RecordStatus, string> = {
  completed: "완료",
  partial: "일부 완료",
  failed: "실패",
  in_progress: "진행 중",
  draft: "초안",
};
const STATUS_TONE: Record<RecordStatus, Tone> = {
  completed: "success",
  partial: "warning",
  failed: "danger",
  in_progress: "info",
  draft: undefined,
};
const VERDICT_LABEL: Record<RecordVerdict, string> = {
  pass: "검수 통과",
  conditional: "조건부 통과",
  fail: "검수 실패",
  unreviewed: "검수 전",
};
const VERDICT_TONE: Record<RecordVerdict, Tone> = {
  pass: "success",
  conditional: "warning",
  fail: "danger",
  unreviewed: undefined,
};
const SOURCE_LABEL: Record<RecordSource, string> = { g0: "G0 제작", v1: "v1 프로젝트", lab: "lab 실험" };
const STAGE_STATUS_LABEL = { done: "완료", partial: "일부", skipped: "생략", failed: "실패", not_run: "미실행" } as const;
const SHOT_STATUS_LABEL = { ok: "정상", failed: "실패", flagged: "주의", not_run: "미실행" } as const;
const SHOT_STATUS_TONE: Record<RecordShot["status"], Tone> = { ok: "success", failed: "danger", flagged: "warning", not_run: undefined };
const TOOL_KIND_LABEL: Record<string, string> = {
  renderer: "렌더러", engine: "엔진", model: "모델", tts: "TTS", stt: "STT", encoder: "인코더", library: "라이브러리", analysis: "분석", audio: "오디오",
};
const CRITERION_LABEL = { pass: "통과", fail: "실패", unknown: "미확인" } as const;
const CRITERION_TONE: Record<"pass" | "fail" | "unknown", Tone> = { pass: "success", fail: "danger", unknown: undefined };

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
};
const clock = (sec: number) => {
  if (sec >= 60) return `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초`;
  return `${Number.isInteger(sec) ? sec : sec.toFixed(1)}초`;
};

/** 값이 없으면 숫자 0 이나 빈칸이 아니라 '미측정'으로 보여 준다. */
function Value({ value, unit }: { value: Scalar | undefined; unit?: string | null }) {
  if (value === null || value === undefined || value === "")
    return <span className="records-unmeasured">미측정</span>;
  return <>{typeof value === "number" ? value.toLocaleString("ko-KR") : String(value)}{unit ? ` ${unit}` : ""}</>;
}

function Unsupported() {
  return (
    <div className="tk-empty tk-empty--boxed records-pending" role="status">
      <Icon name="clock" />
      <h3>백엔드 배포 대기</h3>
      <p>제작 기록 API가 아직 운영 서버에 배포되지 않았어요. 배포가 끝나면 이 화면에 기록이 나타나요. 기존 스튜디오는 그대로 쓸 수 있어요.</p>
      <Link className="tk-button" to="/creative">콘텐츠 스튜디오로 돌아가기</Link>
    </div>
  );
}

function Thumb({ src, kind, label }: { src: string | undefined; kind: RecordKind; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className="records-thumb records-thumb--empty" aria-hidden="true">
        <Icon name={kind === "audio" ? "mic" : kind === "design" ? "file-text" : "image"} />
        <span>{KIND_LABEL[kind]}</span>
      </span>
    );
  return (
    <span className="records-thumb">
      <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className="tk-chip" aria-pressed={pressed} onClick={onClick}>
      <span>{children}</span>
    </button>
  );
}

function RecordCard({ item }: { item: RecordSummary }) {
  return (
    <Link className="tk-card records-card" to={`/creative/records/${item.id}`}>
      <Thumb src={mediaSrc(item.thumbnail_url)} kind={item.kind} label={`${item.title} 대표 이미지`} />
      <div className="records-card__body">
        <div className="records-card__badges">
          <Badge mono>{item.source_label}</Badge>
          <Badge>{KIND_LABEL[item.kind]}</Badge>
          <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
          <Badge tone={VERDICT_TONE[item.verdict]}>{VERDICT_LABEL[item.verdict]}</Badge>
        </div>
        <strong className="records-card__title">{item.title}</strong>
        {item.engines.length > 0 && (
          <div className="records-card__engines" aria-label="사용 엔진">
            {item.engines.map((e) => <Badge key={e} tone="info">{e}</Badge>)}
          </div>
        )}
        <span className="records-card__meta">
          {item.duration_seconds !== null ? `${clock(item.duration_seconds)} · ` : ""}
          {item.shot_count > 0 ? `샷 ${item.shot_count} · ` : ""}
          {fmtDate(item.created_at)}
        </span>
      </div>
    </Link>
  );
}

export function ProductionRecordsPage() {
  const q = useQuery({ queryKey: ["creative-records"], queryFn: listProductionRecords, retry: false });
  const [source, setSource] = useState<RecordSource | null>(null);
  const [kind, setKind] = useState<RecordKind | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const items = useMemo(
    () =>
      (q.data?.items ?? []).filter(
        (i) => (!source || i.source === source) && (!kind || i.kind === kind) && (!engine || i.engines.includes(engine)),
      ),
    [q.data, source, kind, engine],
  );
  const filtered = !!(source || kind || engine);
  return (
    <div className="tk-screen">
      <PageHeader
        title="제작 기록"
        meta="어떤 과정으로 만들었고 어떤 결과가 나왔는지"
        actions={<Link className="tk-button" to="/creative">스튜디오</Link>}
      />
      <div className="tk-screen__body">
        <div className="tk-container records-home">
          {q.isPending && <p role="status">제작 기록을 불러오는 중</p>}
          {q.isError && isRecordsUnsupported(q.error) && <Unsupported />}
          {q.isError && !isRecordsUnsupported(q.error) && (
            <p className="tk-error" role="alert">
              {errorText(q.error).message} <Button onClick={() => void q.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {q.data && (
            <>
              <div className="tk-filterbar" role="group" aria-label="제작 기록 필터">
                <div className="tk-chips" role="group" aria-label="출처">
                  <Chip pressed={source === null} onClick={() => setSource(null)}>{`전체 ${q.data.total}`}</Chip>
                  {(["g0", "v1", "lab"] as const).map((s) => (
                    <Chip key={s} pressed={source === s} onClick={() => setSource(source === s ? null : s)}>
                      {`${SOURCE_LABEL[s]} ${q.data.counts[s]}`}
                    </Chip>
                  ))}
                </div>
                <div className="tk-chips" role="group" aria-label="유형">
                  {q.data.kinds.map((k) => (
                    <Chip key={k} pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}>{KIND_LABEL[k]}</Chip>
                  ))}
                </div>
                {q.data.engines.length > 0 && (
                  <div className="tk-chips" role="group" aria-label="엔진">
                    {q.data.engines.map((e) => (
                      <Chip key={e} pressed={engine === e} onClick={() => setEngine(engine === e ? null : e)}>{e}</Chip>
                    ))}
                  </div>
                )}
                <p className="tk-filterbar__count" role="status">
                  {filtered ? `${items.length} / ${q.data.total}건` : `${q.data.total}건`}
                </p>
              </div>
              {q.data.lab.configured && !q.data.lab.available && (
                <p className="tk-error" role="alert">lab 실험 폴더를 읽을 수 없어요. 설정한 경로를 확인해 주세요.</p>
              )}
              {q.data.lab.skipped.length > 0 && (
                <p className="records-hint" role="status">
                  읽지 못한 lab 매니페스트 {q.data.lab.skipped.length}건: {q.data.lab.skipped.map((s) => s.path).join(", ")}
                </p>
              )}
              {items.length === 0 ? (
                <div className="tk-empty tk-empty--boxed">
                  <h3>{filtered ? "조건에 맞는 기록이 없어요" : "아직 제작 기록이 없어요"}</h3>
                  <p>{filtered ? "필터를 바꿔 보세요." : "제작을 마치면 과정과 결과가 여기에 남아요."}</p>
                </div>
              ) : (
                <div className="records-grid">
                  {items.map((i) => <RecordCard key={i.id} item={i} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- 상세 -----------------------------------------------------------------------------------

const TABS = [
  { id: "process", label: "과정" },
  { id: "shots", label: "샷" },
  { id: "results", label: "결과물" },
  { id: "numbers", label: "수치·도구" },
  { id: "review", label: "검수·문서" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function MediaView({ media, onStale }: { media: RecordMedia; onStale: () => void }) {
  const src = mediaSrc(media.url);
  if (!media.available || !src)
    return (
      <figure className="records-media">
        <div className="records-media__missing" role="status">파일을 찾을 수 없어요</div>
        <figcaption>{media.label}</figcaption>
      </figure>
    );
  return (
    <figure className="records-media">
      {media.kind === "video" && (
        <video src={src} controls playsInline preload="metadata" aria-label={media.label} onError={onStale} />
      )}
      {media.kind === "audio" && <audio src={src} controls preload="none" aria-label={media.label} onError={onStale} />}
      {media.kind === "image" && (
        <a href={src} target="_blank" rel="noreferrer" aria-label={`${media.label} 원본 열기`}>
          <img src={src} alt={media.label} loading="lazy" onError={onStale} />
        </a>
      )}
      <figcaption>
        {media.label}
        {media.duration_seconds ? ` · ${clock(media.duration_seconds)}` : ""}
        {media.caption ? <span className="records-media__caption">{media.caption}</span> : null}
      </figcaption>
    </figure>
  );
}

function ProcessTab({ r }: { r: ProductionRecord }) {
  return (
    <div className="records-stack">
      {(r.brief || r.style) && (
        <section className="records-panel" aria-label="브리프">
          <h2>브리프</h2>
          {r.brief && <p className="records-prose">{r.brief}</p>}
          {r.style && <p className="records-prose records-prose--muted">스타일: {r.style}</p>}
        </section>
      )}
      <section className="records-panel" aria-label="단계 타임라인">
        <h2>단계 타임라인</h2>
        <ol className="records-timeline">
          {r.stages.map((s) => (
            <li key={s.key} className="records-timeline__item" data-status={s.status}>
              <span className="records-timeline__dot" aria-hidden="true" />
              <div>
                <div className="records-timeline__head">
                  <strong>{s.label}</strong>
                  <Badge tone={s.status === "done" ? "success" : s.status === "failed" ? "danger" : s.status === "partial" ? "warning" : undefined}>
                    {STAGE_STATUS_LABEL[s.status]}
                  </Badge>
                  {s.seconds !== null && <span className="records-card__meta">{clock(s.seconds)}</span>}
                </div>
                {s.summary && <p className="records-prose">{s.summary}</p>}
                {s.details.length > 0 && (
                  <ul className="records-list">{s.details.map((d) => <li key={d}>{d}</li>)}</ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>
      {r.revisions.length > 0 && (
        <section className="records-panel" aria-label="수정과 재렌더">
          <h2>수정·재렌더</h2>
          {r.revisions.map((rev) => (
            <div key={rev.label} className="records-revision">
              <strong>{rev.label}</strong>
              {rev.summary && <p className="records-prose">{rev.summary}</p>}
              <ul className="records-defects">
                {rev.defects.map((d) => (
                  <li key={d.id} data-status={d.status}>
                    <div className="records-defects__head">
                      <Badge mono>{d.id}</Badge>
                      <Badge tone={d.status === "fixed" ? "success" : d.status === "open" ? "warning" : undefined}>
                        {d.status === "fixed" ? "수정됨" : d.status === "open" ? "남음" : "보류"}
                      </Badge>
                      {d.location && <span className="records-card__meta">{d.location}</span>}
                    </div>
                    <p className="records-prose">{d.symptom}</p>
                    {d.fix && <p className="records-prose records-prose--muted">조치: {d.fix}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ShotCard({ shot, media, onStale }: { shot: RecordShot; media: Map<string, RecordMedia>; onStale: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const key = shot.keyframe_media_id ? media.get(shot.keyframe_media_id) : undefined;
  const out = shot.output_media_id ? media.get(shot.output_media_id) : undefined;
  const keySrc = key?.available ? mediaSrc(key.url) : undefined;
  const outSrc = out?.available ? mediaSrc(out.url) : undefined;
  const long = (shot.prompt?.length ?? 0) > 120;
  return (
    <article className="tk-card records-shot">
      {out && out.kind === "video" && outSrc ? (
        // preload=metadata 라 첫 프레임이 포스터처럼 보이고 본문은 누를 때 받는다.
        <video className="records-shot__media" src={outSrc} poster={keySrc} controls playsInline preload="metadata" aria-label={`${shot.label} 결과 영상`} onError={onStale} />
      ) : out && out.kind === "audio" && outSrc ? (
        <audio className="records-shot__audio" src={outSrc} controls preload="none" aria-label={`${shot.label} 결과 오디오`} onError={onStale} />
      ) : keySrc ? (
        <img className="records-shot__media" src={keySrc} alt={`${shot.label} 키프레임`} loading="lazy" onError={onStale} />
      ) : null}
      <div className="records-shot__head">
        <strong>{shot.label}</strong>
        <Badge tone={SHOT_STATUS_TONE[shot.status]}>{SHOT_STATUS_LABEL[shot.status]}</Badge>
      </div>
      <div className="records-card__engines">
        {shot.engine && <Badge tone="info">{shot.engine}</Badge>}
        {shot.model && <Badge mono>{shot.model}</Badge>}
      </div>
      {shot.prompt && (
        <div className="records-shot__prompt">
          <span className="records-hint">프롬프트·의도</span>
          <p className={expanded ? "records-prose" : "records-prose records-prose--clamp"}>{shot.prompt}</p>
          {long && (
            <button type="button" className="tk-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? "접기" : "전체 보기"}
            </button>
          )}
        </div>
      )}
      <dl className="records-kv">
        <dt>시드</dt>
        <dd>{shot.seed !== null ? shot.seed : <span className="records-unmeasured">없음</span>}</dd>
        <dt>소요 시간</dt>
        <dd><Value value={shot.seconds} unit="초" /></dd>
        {shot.start_seconds !== null && shot.end_seconds !== null && (
          <>
            <dt>구간</dt>
            <dd>{`${shot.start_seconds}–${shot.end_seconds}초`}</dd>
          </>
        )}
        {Object.entries(shot.params).map(([k, v]) => (
          <div key={k} className="records-kv__row">
            <dt>{k}</dt>
            <dd><Value value={v} /></dd>
          </div>
        ))}
      </dl>
      {shot.note && <p className="records-prose records-prose--muted">{shot.note}</p>}
    </article>
  );
}

function ShotsTab({ r, media, onStale }: { r: ProductionRecord; media: Map<string, RecordMedia>; onStale: () => void }) {
  if (r.shots.length === 0)
    return (
      <div className="tk-empty tk-empty--boxed">
        <h3>기록된 샷이 없어요</h3>
        <p>샷 단위 기록이 없는 항목이에요.</p>
      </div>
    );
  return (
    <div className="records-grid records-grid--shots">
      {r.shots.map((s) => <ShotCard key={s.id} shot={s} media={media} onStale={onStale} />)}
    </div>
  );
}

function ResultsTab({ r, onStale }: { r: ProductionRecord; onStale: () => void }) {
  const results = r.media.filter((m) => m.role === "result" || m.role === "after" || m.role === "audio");
  const compare = r.media.filter((m) => m.role === "before" || m.role === "compare");
  const stills = r.media.filter((m) => ["keyframe", "contact_sheet", "evidence", "reference"].includes(m.role) && m.kind === "image");
  if (results.length + compare.length + stills.length === 0)
    return (
      <div className="tk-empty tk-empty--boxed">
        <h3>결과물이 없어요</h3>
        <p>이 기록에는 재생하거나 볼 수 있는 결과물이 연결되어 있지 않아요.</p>
      </div>
    );
  return (
    <div className="records-stack">
      {results.length > 0 && (
        <section className="records-panel" aria-label="결과물">
          <h2>결과물</h2>
          <div className="records-media-grid">{results.map((m) => <MediaView key={m.id} media={m} onStale={onStale} />)}</div>
        </section>
      )}
      {compare.length > 0 && (
        <section className="records-panel" aria-label="전후 비교">
          <h2>전후 비교</h2>
          <p className="records-hint">비교 영상은 왼쪽이 이전, 오른쪽이 이후예요.</p>
          <div className="records-media-grid">{compare.map((m) => <MediaView key={m.id} media={m} onStale={onStale} />)}</div>
        </section>
      )}
      {stills.length > 0 && (
        <section className="records-panel" aria-label="콘택트 시트와 키프레임">
          <h2>콘택트 시트·키프레임</h2>
          <div className="records-media-grid">{stills.map((m) => <MediaView key={m.id} media={m} onStale={onStale} />)}</div>
        </section>
      )}
    </div>
  );
}

function MetricRow({ m }: { m: RecordMetric }) {
  // 근거·비고는 항목 칸 아래에 작게 둔다. 폰 폭에서 세 번째 칸이 글자 단위로 쪼개지는 것을 막는다.
  const hint = m.note || m.source;
  return (
    <tr>
      <th scope="row">
        <span>{m.label}</span>
        {hint && <span className="records-hint records-metrics__hint">{hint}</span>}
      </th>
      <td className="tk-table__num"><Value value={m.value} unit={m.unit} /></td>
    </tr>
  );
}

function NumbersTab({ r }: { r: ProductionRecord }) {
  return (
    <div className="records-stack">
      <section className="records-panel" aria-label="실측 수치">
        <h2>실측 수치</h2>
        {r.metrics.length === 0 ? (
          <p className="records-prose records-prose--muted">기록된 실측이 없어요.</p>
        ) : (
          <div className="tk-table-wrap">
            <table className="tk-table records-metrics">
              <thead><tr><th>항목</th><th>값</th></tr></thead>
              <tbody>{r.metrics.map((m) => <MetricRow key={m.key} m={m} />)}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="records-panel" aria-label="비용">
        <h2>비용</h2>
        {r.cost === null ? (
          <p className="records-prose"><span className="records-unmeasured">미측정</span> 비용 근거가 기록되어 있지 않아요.</p>
        ) : (
          <p className="records-prose">
            <strong>{r.cost.usd === null ? "미측정" : `$${r.cost.usd}`}</strong>
            {r.cost.paid_services.length > 0 ? ` · 유료 서비스 ${r.cost.paid_services.join(", ")}` : " · 유료 서비스 사용 없음"}
            {r.cost.note ? ` · ${r.cost.note}` : ""}
          </p>
        )}
      </section>
      {r.tables.map((t) => (
        <section className="records-panel" key={t.title} aria-label={t.title}>
          <h2>{t.title}</h2>
          <div className="tk-table-wrap">
            <table className="tk-table">
              <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {t.rows.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}><Value value={cell} /></td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {t.source && <p className="records-hint">출처: {t.source}</p>}
        </section>
      ))}
      <section className="records-panel" aria-label="사용한 도구와 모델">
        <h2>사용한 도구·모델</h2>
        {r.tools.length === 0 ? (
          <p className="records-prose records-prose--muted">기록된 도구가 없어요.</p>
        ) : (
          <ul className="records-tools">
            {r.tools.map((t) => (
              <li key={t.name}>
                <div className="records-defects__head">
                  <strong>{t.name}</strong>
                  <Badge>{TOOL_KIND_LABEL[t.kind] ?? t.kind}</Badge>
                  {t.version && <Badge mono>{t.version}</Badge>}
                </div>
                {t.role && <p className="records-prose">{t.role}</p>}
                {t.license && <p className="records-prose records-prose--muted">라이선스: {t.license}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewTab({ r }: { r: ProductionRecord }) {
  const docs = r.media.filter((m) => m.kind === "document");
  return (
    <div className="records-stack">
      <section className="records-panel" aria-label="검수 판정">
        <h2>검수 판정</h2>
        <div className="records-card__badges">
          <Badge tone={VERDICT_TONE[r.review.verdict]}>{VERDICT_LABEL[r.review.verdict]}</Badge>
          <Badge>{r.review.independent ? "독립 검수" : "독립 검수 아님"}</Badge>
        </div>
        {r.review.reviewer && <p className="records-prose records-prose--muted">검수자: {r.review.reviewer}</p>}
        {r.review.summary && <p className="records-prose">{r.review.summary}</p>}
        {r.review.criteria.length > 0 && (
          <ul className="records-defects">
            {r.review.criteria.map((c) => (
              <li key={c.name}>
                <div className="records-defects__head">
                  <Badge tone={CRITERION_TONE[c.result]}>{CRITERION_LABEL[c.result]}</Badge>
                  <strong>{c.name}</strong>
                </div>
                {c.evidence && <p className="records-prose records-prose--muted">{c.evidence}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="records-panel" aria-label="남은 한계">
        <h2>남은 한계</h2>
        {r.review.limitations.length === 0 ? (
          <p className="records-prose records-prose--muted">기록된 한계가 없어요.</p>
        ) : (
          <ul className="records-list">{r.review.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        )}
      </section>
      <section className="records-panel" aria-label="원문 문서">
        <h2>원문 문서</h2>
        {docs.length === 0 ? (
          <p className="records-prose records-prose--muted">연결된 문서가 없어요.</p>
        ) : (
          <ul className="records-docs">
            {docs.map((d) => (
              <li key={d.id}>
                {d.available && d.url ? (
                  <a href={mediaSrc(d.url)} target="_blank" rel="noreferrer">
                    <Icon name="file-text" /> <span>{d.label}</span>
                  </a>
                ) : (
                  <span className="records-unmeasured">{d.label} (파일 없음)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {r.warnings.length > 0 && (
        <p className="records-hint" role="status">{r.warnings.join(" · ")}</p>
      )}
    </div>
  );
}

export function ProductionRecordDetailPage() {
  const { rid = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.find((t) => t.id === params.get("tab"))?.id ?? "process";
  // 재생 주소는 5분 뒤 만료되므로 열어 둔 동안 주기적으로 새 주소를 받는다.
  const q = useQuery({
    queryKey: ["creative-record", rid],
    queryFn: () => getProductionRecord(rid),
    retry: false,
    refetchInterval: 240_000,
  });
  const r = q.data;
  const mediaById = useMemo(() => new Map((r?.media ?? []).map((m) => [m.id, m])), [r]);
  const onStale = () => void q.refetch();
  return (
    <div className="tk-screen">
      <PageHeader
        title={r?.title ?? "제작 기록"}
        meta={r ? `${r.source_label} · ${fmtDate(r.created_at)}` : "과정과 결과물 상세"}
        actions={<Link className="tk-button" to="/creative/records">목록</Link>}
      />
      <div className="tk-screen__body">
        <div className="tk-container records-detail">
          {q.isPending && <p role="status">제작 기록을 불러오는 중</p>}
          {q.isError && isRecordsUnsupported(q.error) && (
            <div className="tk-empty tk-empty--boxed records-pending" role="status">
              <Icon name="clock" />
              <h3>기록을 찾을 수 없어요</h3>
              <p>없는 기록이거나 백엔드가 이 API를 아직 배포하지 않았어요.</p>
              <Link className="tk-button" to="/creative/records">목록으로</Link>
            </div>
          )}
          {q.isError && !isRecordsUnsupported(q.error) && (
            <p className="tk-error" role="alert">
              {errorText(q.error).message} <Button onClick={() => void q.refetch()}>다시 불러오기</Button>
            </p>
          )}
          {r && (
            <>
              <section className="records-summary" aria-label="요약">
                <div className="records-card__badges">
                  <Badge mono>{r.source_label}</Badge>
                  <Badge>{KIND_LABEL[r.kind]}</Badge>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  <Badge tone={VERDICT_TONE[r.review.verdict]}>{VERDICT_LABEL[r.review.verdict]}</Badge>
                  {r.engines.map((e) => <Badge key={e} tone="info">{e}</Badge>)}
                </div>
                {r.summary && <p className="records-prose">{r.summary}</p>}
                <span className="records-card__meta">
                  {r.duration_seconds !== null ? `${clock(r.duration_seconds)} · ` : ""}샷 {r.shots.length} · 결과물 {r.media.length}
                </span>
              </section>
              <div className="tk-tablist records-tabs" role="tablist" aria-label="상세 보기">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    id={`records-tab-${t.id}`}
                    className="tk-tab"
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-controls="records-tabpanel"
                    tabIndex={tab === t.id ? 0 : -1}
                    onClick={() => setParams({ tab: t.id }, { replace: true })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div id="records-tabpanel" role="tabpanel" aria-labelledby={`records-tab-${tab}`}>
                {tab === "process" && <ProcessTab r={r} />}
                {tab === "shots" && <ShotsTab r={r} media={mediaById} onStale={onStale} />}
                {tab === "results" && <ResultsTab r={r} onStale={onStale} />}
                {tab === "numbers" && <NumbersTab r={r} />}
                {tab === "review" && <ReviewTab r={r} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
