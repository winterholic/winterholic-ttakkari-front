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
  /** 서버가 아직 내려주지 않는다(매니페스트에만 있음). 오면 장르 칩으로 보인다. */
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

export interface GameRequestIn {
  kind: GameRequestKind;
  instruction: string;
  build_id?: UUID | null;
}

export interface GameRequest {
  session_id: UUID;
  run_id: UUID;
  status: string;
  kind: string;
  build_id: UUID | null;
  lock: string;
  created_at: ISODateTime;
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
