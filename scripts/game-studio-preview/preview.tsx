/** 실제 제품 컴포넌트를 합성 API로 검증한다. 운영 인증·게임·작업은 사용하지 않는다. */
import "../../src/vendor/ttakkari/tokens.css";
import "../../src/vendor/ttakkari/typography.css";
import "../../src/vendor/ttakkari/components.css";
import "../../src/vendor/ttakkari/prose.css";
import "../../src/boot.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { GamesPage } from "../../src/pages/GamesPage";
import { GamePage } from "../../src/pages/GamePage";

const state = new URLSearchParams(location.search).get("state") ?? "home";
const now = "2026-11-07T00:00:00Z";
const build = { id: "b1", game_id: "g1", seq: 1, status: state === "building" ? "building" : "failed", source_commit: "abc123", source_dirty: false, manifest_sha256: "m", lock_verified: true, bundle_sha256: null, bundle_bytes: null, bundle_files: null, run_id: null, artifact_id: null, restored_from_id: null, error: "검증용 빌드 실패", created_at: now, finished_at: now };
const game = { id: "g1", slug: "test-game", name: "플레이하며 만드는 게임 · 긴 제목과 모바일 줄바꿈 확인", engine_id: "web-phaser", workspace_id: "w1", pms_project_id: null, locked_revision: 0, active_build_id: null, lock_approved: false, lock_matches_repo: null, locked_decisions: [], genre: "어드벤처", created_at: now, last_build: state === "empty" ? null : build };
let submitted: object[] = [];
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const path = url.pathname;
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  if (!path.startsWith("/api/")) return response({ message: "검증 API 외의 요청은 차단했어요." }, 404);
  if (path === "/api/auth/refresh") return response({ access_token: "fixture", expires_in: 900, token_type: "bearer" });
  if (path === "/api/games/discover") return response({ candidates: [
    { slug: "existing-adventure", name: "기존 어드벤처 프로젝트", engine_id: "web-phaser", can_register: true, game_id: null, issues: ["연결 준비가 됐어요. 실제 플레이·캡처·저장 호환성은 연결 후 확인해 주세요.", "서버 관련 명령이 있어요. 게임 미리보기는 정적 웹 빌드만 제공해요."] },
    { slug: "unfinished-project", name: "설정이 없는 프로젝트", engine_id: null, can_register: false, game_id: null, issues: ["ttakkari-game.json 게임 설정이 필요해요. 원본 파일은 변경하지 않았어요."] },
  ], has_more: false });
  if (path === "/api/games") return response(init?.method === "POST" ? game : [game]);
  if (path === "/api/games/g1") return response(game);
  if (path.endsWith("/builds")) return response(state === "empty" ? [] : [build]);
  if (path.endsWith("/play")) return response({ code: "not_playable", message: "플레이할 성공 빌드가 아직 없습니다." }, 409);
  if (path.endsWith("/requests")) {
    if (init?.method === "POST") {
      const data = JSON.parse(String(init.body));
      const request = { session_id: "s1", run_id: "r1", status: "queued", kind: data.kind, instruction: data.instruction, build_id: null, lock: "unapproved", created_at: now };
      submitted = [request]; return response(request, 202);
    }
    return response(submitted);
  }
  if (path.startsWith("/api/tasks")) return response({ roots: [], nodes: [], total: 0 });
  return response([]);
};
const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <p className="tk-help">로컬 UI 검증 · 합성 데이터 · 실제 게임·AI 작업 실행 없음</p>
    <MemoryRouter initialEntries={[state === "home" ? "/games" : "/games/g1"]}><Routes>
      <Route path="/games" element={<GamesPage />} /><Route path="/games/:id" element={<GamePage />} />
    </Routes></MemoryRouter>
  </QueryClientProvider>,
);
