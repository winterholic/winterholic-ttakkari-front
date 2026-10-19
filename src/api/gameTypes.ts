import type { ISODateTime, UUID } from "./types";

/** back/src/ttakkari/api/games.py 의 응답 모양. 필드 이름은 서버와 같다. */
export type BuildStatus = "building" | "succeeded" | "failed";

export interface GameBuild {
  id: UUID;
  game_id: UUID;
  seq: number;
  status: BuildStatus;
  source_commit: string | null;
  source_dirty: boolean;
  manifest_sha256: string | null;
  lock_verified: boolean;
  bundle_sha256: string | null;
  bundle_bytes: number | null;
  bundle_files: number | null;
  run_id: UUID | null;
  artifact_id: UUID | null;
  restored_from_id: UUID | null;
  error: string | null;
  created_at: ISODateTime;
  finished_at: ISODateTime | null;
}

export interface GameBuildDetail extends GameBuild {
  log_tail: string | null;
  snapshot_verified?: boolean | null;
}

export interface Game {
  id: UUID;
  slug: string;
  name: string;
  engine_id: string;
  workspace_id: UUID;
  pms_project_id: UUID | null;
  locked_revision: number;
  active_build_id: UUID | null;
  lock_approved: boolean;
  lock_matches_repo: boolean | null;
  locked_decisions: string[];
  created_at: ISODateTime;
  last_build: GameBuild | null;
  /** 저장소 매니페스트의 장르(back GameOut.genre). 비어 있으면 칩을 숨긴다. */
  genre?: string | null;
}

export interface GamePlay {
  url: string;
  origin: string;
  expires_at: ISODateTime;
  build_id: UUID;
  build_seq: number;
  bundle_sha256: string;
  frame_ancestors: string[];
  sandbox: string;
}

export type GameRequestKind = "develop" | "modify" | "verify";

/** 좌표는 이미지 왼쪽 위가 (0,0)인 0~1 비율. back games/feedback.py 의 AnnotationIn 과 같다. */
export type GameAnnotation =
  | { type: "box"; x: number; y: number; w: number; h: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "freehand"; points: [number, number][] };

/** 요청에 붙는 시각 피드백(back RequestIn.feedback). 스크린샷은 Artifact 참조이고 서버가 worker 가 열 수 있는 파일로 내놓는다. */
export interface GameFeedbackIn {
  build_id: UUID;
  artifact_id?: UUID | null;
  annotated_artifact_id?: UUID | null;
  width?: number | null;
  height?: number | null;
  coordinate_space: "normalized-0-1-top-left";
  annotations: GameAnnotation[];
  /** 관제탑 오브젝트 선택(back ADR 0059)으로 고른 오브젝트. 소스 위치가 아니라 게임이 알려 준 관측 정보다 */
  picked?: GamePickedObject[];
  /** 고른 위치(게임 화면 0~1 비율) */
  pick_point?: { x: number; y: number } | null;
}

export interface GamePickedObject {
  scene: string;
  name: string;
  type: string;
  texture: string | null;
  frame: string | null;
  text: string | null;
  container: string | null;
  depth: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface GameRequestIn {
  kind: GameRequestKind;
  instruction: string;
  build_id?: UUID | null;
  feedback?: GameFeedbackIn | null;
}

export interface GameRequest {
  session_id: UUID;
  run_id: UUID;
  status: string;
  kind: string;
  build_id: UUID | null;
  lock: string;
  /** Run 이 끝난 시점의 잠금 상태. worker 가 승인된 잠금 결정을 바꿨으면 "tampered". 끝나기 전에는 없다 */
  lock_after?: string | null;
  /** 자동 빌드 결과. 건너뛴 사유(lock_violation 등)와 타입 검사 실패를 요청 단위로 보인다 */
  auto_build_result?: GameAutoBuildResult | null;
  created_at: ISODateTime;
}

export interface GameAutoBuildResult {
  status: "succeeded" | "failed" | "skipped" | string;
  code?: string;
  message?: string;
  build_id?: UUID;
  seq?: number;
}

export interface GameRollbackIn {
  build_id: UUID;
  restore_source: boolean;
  confirm: true;
}

export interface GameRollbackOut {
  game_id: UUID;
  active_build_id: UUID;
  previous_active_build_id: UUID | null;
  restore_commit: string | null;
  restore_build: GameBuild | null;
}

/** POST /api/games/create (back ADR 0053). 비운 필드는 서버가 정한다(이름=아이디어 첫 줄, slug=이름에서 생성). */
export interface GameCreateIn {
  idea: string;
  name?: string | null;
  genre?: string;
  locked_decisions?: string[];
  start_development?: boolean;
}

export interface GameCreateOut {
  game: Game;
  /** 첫 개발 요청. start_development=false 거나 접수에 실패하면 null. */
  request: GameRequest | null;
  /** 게임은 만들어졌지만 첫 요청 접수가 실패했을 때. */
  request_error: { code: string; message: string } | null;
}
