import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { getArtcraftApps } from "../api/client";
import { AgentTab } from "../features/artcraft/AgentTab";
import { AppsTab } from "../features/artcraft/AppsTab";
import { BugsTab } from "../features/artcraft/BugsTab";
import { useForegroundResync } from "../hooks/useForegroundResync";
import { PageHeader } from "../shell/PageHeader";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { toast } from "../ui/toastStore";
import { ErrorState, ListSkeleton } from "../features/viewer/screenStates";
import { errorText } from "../features/viewer/api";
import "../features/artcraft/artcraft.css";

type Tab = "apps" | "bugs" | "agent";
const TABS: { id: Tab; label: string }[] = [
  { id: "apps", label: "앱" },
  { id: "bugs", label: "버그·기여" },
  { id: "agent", label: "에이전트 연결" },
];
const KEY = ["artcraft", "apps"] as const;

/** ArtCraft > 관리. Mac Studio 에 설치된 ArtCraft 앱 13개의 상태·스모크·버그 후보·MCP 설정(디자인시스템과 별개 도메인). 작업 시키기는 /artcraft 허브가 맡는다. */
export function ArtcraftManagePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: Tab = TABS.some((t) => t.id === requested) ? (requested as Tab) : "apps";
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: KEY, queryFn: () => getArtcraftApps(false), refetchInterval: 30_000 });
  useForegroundResync(() => { void qc.invalidateQueries({ queryKey: ["artcraft"] }); });
  const refresh = useMutation({
    mutationFn: () => getArtcraftApps(true),
    onSuccess: (data) => qc.setQueryData(KEY, data),
    onError: (e) => toast({ message: errorText(e).message, tone: "danger" }),
  });
  const go = (next: Tab, key?: string) => setParams(next === "apps" ? {} : { tab: next, ...(key ? { focus: key } : {}) }, { replace: true });
  const apps = overview.data?.apps;
  const meta = apps ? `${apps.length}개 앱 · 실행 중 ${apps.filter((a) => a.gui.running).length}` : "설치된 ArtCraft 앱 관제";
  return (
    <div className="tk-screen">
      <PageHeader
        title="ArtCraft 관리"
        meta={meta}
        actions={
          <>
            <IconButton aria-label="상태 새로고침" disabled={refresh.isPending} aria-busy={refresh.isPending || undefined} onClick={() => refresh.mutate()}>
              <Icon name="retry" />
            </IconButton>
            <Link className="tk-button tk-button--ghost tk-button--sm" to="/artcraft"><Icon name="back" /><span>작업</span></Link>
          </>
        }
      />
      <div className="tk-screen__body">
        <div className="tk-container tk-container--lg">
          <div className="ac">
            <div className="tk-tablist" role="tablist" aria-label="ArtCraft 관리 보기">
              {TABS.map((t) => (
                <button key={t.id} role="tab" type="button" className="tk-tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>
              ))}
            </div>
            {tab === "apps" && (
              overview.isPending ? <ListSkeleton label="앱 상태를 읽는 중" rows={4} />
                : overview.isError ? <ErrorState what="ArtCraft 상태" error={overview.error} onRetry={() => void overview.refetch()} />
                  : <AppsTab data={overview.data} onGoto={(next, key) => go(next, key)} />
            )}
            {tab === "bugs" && <BugsTab focus={params.get("focus")} />}
            {tab === "agent" && <AgentTab focus={params.get("focus")} />}
          </div>
        </div>
      </div>
    </div>
  );
}
