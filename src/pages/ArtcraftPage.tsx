import { Navigate, useSearchParams } from "react-router";
import { HubScreen } from "../features/artcraft/work/HubScreen";
import "../features/artcraft/artcraft.css";
import "../features/artcraft/work/work.css";

const LEGACY_TABS = ["apps", "bugs", "agent"];

/**
 * 더보기 > ArtCraft 허브(ADR 0039). 하고 싶은 일(범주)을 골라 에이전트에게 작업을 시킨다.
 * 예전 관제 화면 링크(/artcraft?tab=bugs&focus=BUG-001)는 /artcraft/manage 로 넘긴다(알림·메모에 남은 링크 보호).
 */
export function ArtcraftPage() {
  const [params] = useSearchParams();
  const tab = params.get("tab");
  if (tab && LEGACY_TABS.includes(tab)) {
    const next = new URLSearchParams(params);
    return <Navigate to={`/artcraft/manage?${next.toString()}`} replace />;
  }
  return <HubScreen />;
}
