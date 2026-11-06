import type { Game, GameBuild, GameRequest } from "../../api/gameTypes";
import { Button } from "../../ui/Button";

type Action = "feedback" | "work" | "builds" | "locks";

export function GameNextAction({ game, builds, requests, loading, error, onRetry, onAction }: {
  game: Game; builds: GameBuild[]; requests: GameRequest[]; loading: boolean; error: boolean;
  onRetry: () => void; onAction: (action: Action) => void;
}) {
  if (error) return <section className="game-next" aria-label="지금 할 일"><h2>작업 상태를 확인하지 못했어요</h2><p>진행 중인 작업을 확인한 뒤 요청을 보낼 수 있어요.</p><Button onClick={onRetry}>상태 다시 확인</Button></section>;
  if (loading) return <p role="status">진행 상태를 확인하고 있어요</p>;
  const latest = builds[0] ?? game.last_build;
  const lastRequest = requests[0];
  const playable = builds.some((b) => b.status === "succeeded");
  let title: string, detail: string, label: string, action: Action;
  if (requests.some((r) => ["queued", "running", "waiting"].includes(r.status))) {
    title = "AI가 요청을 진행하고 있어요";
    detail = "작업 내용을 확인할 수 있어요. 코드 작업이 끝난 뒤 빌드와 플레이 확인이 이어집니다.";
    label = "진행 내용 보기"; action = "work";
  } else if (latest?.status === "building") {
    title = "플레이할 버전을 준비하고 있어요";
    detail = "빌드가 끝나면 게임 화면을 새로 불러옵니다. 이전 버전이 있으면 계속 플레이할 수 있어요.";
    label = "빌드 진행 보기"; action = "builds";
  } else if (game.lock_approved && game.lock_matches_repo !== true) {
    title = "꼭 지킬 설정을 확인해 주세요";
    detail = "저장소 설정이 승인한 내용과 다르거나 읽을 수 없어요. 설정을 확인해야 새 빌드를 적용할 수 있어요.";
    label = "설정 확인"; action = "locks";
  } else if (latest?.status === "failed") {
    title = playable ? "새 버전을 준비하다 멈췄어요" : "첫 실행 준비에서 멈췄어요";
    detail = "빌드 실패 내용은 AI에게 자동으로 전달돼요. 고칠 내용을 적어 수리를 맡겨 주세요.";
    label = "수리 요청 작성"; action = "feedback";
  } else if (lastRequest && ["failed", "cancelled", "interrupted"].includes(lastRequest.status)) {
    title = "이전 AI 작업이 끝까지 이어지지 못했어요";
    detail = "작업 내용을 확인하고, 이어서 할 내용을 다시 요청할 수 있어요.";
    label = "이전 작업 확인"; action = "work";
  } else if (lastRequest?.status === "succeeded" && !lastRequest.auto_build_result && (!latest || Date.parse(latest.created_at) < Date.parse(lastRequest.created_at))) {
    title = "AI 코드 작업이 끝났어요";
    detail = "아직 새 빌드 결과를 확인하지 못했어요. 코드 작업 완료와 플레이 준비는 별도로 확인합니다.";
    label = "빌드 결과 확인"; action = "builds";
  } else if (latest?.status === "succeeded" && game.active_build_id && game.active_build_id !== latest.id) {
    title = "검토할 새 버전이 있어요";
    detail = "현재 플레이 버전은 그대로예요. 새 버전을 해 보고 마음에 들면 이 버전 사용을 눌러 주세요.";
    label = "새 버전 검토"; action = "builds";
  } else if (!latest) {
    title = "첫 플레이를 준비해 볼까요";
    detail = "만들고 싶은 내용이나 현재 소스에서 고칠 점을 적어 주세요. 첫 빌드가 없어도 요청할 수 있어요.";
    label = "개발 요청 작성"; action = "feedback";
  } else {
    title = "직접 플레이하며 확인해 주세요";
    detail = "빌드가 끝났어요. 실제 재미와 조작, 요청한 변경이 맞는지는 플레이하며 확인해 주세요.";
    label = "수정할 곳 남기기"; action = "feedback";
  }
  return <section className="game-next" aria-label="지금 할 일">
    <div><span className="tk-help">지금 할 일</span><h2>{title}</h2><p>{detail}</p></div>
    <Button variant="primary" onClick={() => onAction(action)}>{label}</Button>
  </section>;
}
