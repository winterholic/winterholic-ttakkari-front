import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { DeskHome } from "./pages/DeskHome";
import { AppShell } from "./shell/AppShell";
import { PublicMeetingPage } from "./pages/PublicMeetingPage";

// 첫 화면(채팅·접수)에 필요 없는 화면은 열 때만 받는다. 메인 번들이 줄어 첫 로딩과 파싱이 가벼워진다. 경로 전환 중 빈 화면은 AppShell 의 Suspense 가 받는다.
const WorkspacePage = lazy(() => import("./pages/WorkspacePage").then((m) => ({ default: m.WorkspacePage })));
const LibraryPage = lazy(() => import("./pages/LibraryPage").then((m) => ({ default: m.LibraryPage })));
const FilesPage = lazy(() => import("./pages/FilesPage").then((m) => ({ default: m.FilesPage })));
const AccountsPage = lazy(() => import("./pages/AccountsPage").then((m) => ({ default: m.AccountsPage })));
const LegacySettingsRedirect = lazy(() => import("./pages/AccountsPage").then((m) => ({ default: m.LegacySettingsRedirect })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })));
const MeetingDetailPage = lazy(() => import("./pages/MeetingDetailPage").then((m) => ({ default: m.MeetingDetailPage })));
const MeetingNewPage = lazy(() => import("./pages/MeetingNewPage").then((m) => ({ default: m.MeetingNewPage })));
const MeetingsPage = lazy(() => import("./pages/MeetingsPage").then((m) => ({ default: m.MeetingsPage })));
const MemosPage = lazy(() => import("./pages/MemosPage").then((m) => ({ default: m.MemosPage })));
const ChecklistsPage = lazy(() => import("./pages/ChecklistsPage").then((m) => ({ default: m.ChecklistsPage })));
const MorePage = lazy(() => import("./pages/MorePage").then((m) => ({ default: m.MorePage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage").then((m) => ({ default: m.ResourcesPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((m) => ({ default: m.TasksPage })));
const FailedTasksPage = lazy(() => import("./pages/FailedTasksPage").then((m) => ({ default: m.FailedTasksPage })));
const WeatherPage = lazy(() => import("./pages/WeatherPage").then((m) => ({ default: m.WeatherPage })));
const StocksPage = lazy(() => import("./pages/StocksPage").then((m) => ({ default: m.StocksPage })));
const TossInvestPage = lazy(() => import("./pages/TossInvestPage").then((m) => ({ default: m.TossInvestPage })));
const OpsLogsPage = lazy(() => import("./pages/OpsLogsPage").then((m) => ({ default: m.OpsLogsPage })));
const ArtcraftPage = lazy(() => import("./pages/ArtcraftPage").then((m) => ({ default: m.ArtcraftPage })));
const ArtcraftManagePage = lazy(() => import("./pages/ArtcraftManagePage").then((m) => ({ default: m.ArtcraftManagePage })));
const ArtcraftCategoryPage = lazy(() => import("./pages/ArtcraftCategoryPage").then((m) => ({ default: m.ArtcraftCategoryPage })));
const ArtcraftTaskPage = lazy(() => import("./pages/ArtcraftTaskPage").then((m) => ({ default: m.ArtcraftTaskPage })));
const DesignSystemPage = lazy(() => import("./pages/DesignSystemPage").then((m) => ({ default: m.DesignSystemPage })));
const ReverseDetailPage = lazy(() => import("./pages/ReverseDetailPage").then((m) => ({ default: m.ReverseDetailPage })));
const ReversePage = lazy(() => import("./pages/ReversePage").then((m) => ({ default: m.ReversePage })));
const OpsIssuePage = lazy(() => import("./pages/OpsIssuePage").then((m) => ({ default: m.OpsIssuePage })));
const GamesPage = lazy(() => import("./pages/GamesPage").then((m) => ({ default: m.GamesPage })));
const GamePage = lazy(() => import("./pages/GamePage").then((m) => ({ default: m.GamePage })));
const RemoteDesktopPage = lazy(() => import('./pages/RemoteDesktopPage').then(m => ({ default: m.RemoteDesktopPage })));
const CreativePage = lazy(() => import('./pages/CreativePage').then(m => ({ default: m.CreativePage })));
const ProductionRecordsPage = lazy(() => import('./pages/ProductionRecordsPage').then(m => ({ default: m.ProductionRecordsPage })));
const ProductionRecordDetailPage = lazy(() => import('./pages/ProductionRecordsPage').then(m => ({ default: m.ProductionRecordDetailPage })));
const CreativePlanNewPage = lazy(() => import('./pages/creative/CreativePlanPage').then(m => ({ default: m.CreativePlanNewPage })));
const CreativePlanDetailPage = lazy(() => import('./pages/creative/CreativePlanPage').then(m => ({ default: m.CreativePlanDetailPage })));
const CreativeDetailPage = lazy(() => import('./pages/CreativePage').then(m => ({ default: m.CreativeDetailPage })));

// 도서관 화면은 그래프·트리맵·진단 코드가 모여 있어 열 때만 받는다.
const ContextLibraryPage = lazy(() => import("./pages/ContextLibraryPage").then((m) => ({ default: m.ContextLibraryPage })));
const ContextLibraryItemPage = lazy(() => import("./pages/ContextLibraryItemPage").then((m) => ({ default: m.ContextLibraryItemPage })));
const CollectPage = lazy(() => import("./pages/CollectPage").then((m) => ({ default: m.CollectPage })));
const KnowledgeLibraryPage = lazy(() => import("./pages/KnowledgeLibraryPage").then((m) => ({ default: m.KnowledgeLibraryPage })));
const HarnessPage = lazy(() => import("./pages/HarnessPage").then((m) => ({ default: m.HarnessPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
// PMS·WBS 는 간트·칸반 코드가 모여 있어 열 때만 받는다.
const PmsListPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsListPage })));
const PmsProjectPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsProjectPage })));
// GitHub 탐색은 코드·diff·로그 뷰어가 모여 있어 열 때만 받는다.
const GithubPage = lazy(() => import("./pages/GithubPage").then((m) => ({ default: m.GithubPage })));
const TtsPage = lazy(() => import("./pages/TtsPage").then((m) => ({ default: m.TtsPage })));
const NotebookLMPage = lazy(() => import("./pages/NotebookLMPage").then((m) => ({ default: m.NotebookLMPage })));
const NotebookLMDetailPage = lazy(() => import("./pages/NotebookLMDetailPage").then((m) => ({ default: m.NotebookLMDetailPage })));
const WbsListPage = lazy(() => import("./pages/WbsPage").then((m) => ({ default: m.WbsListPage })));
const ResearchPage = lazy(() => import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })));
const WbsProjectPage = lazy(() => import("./pages/WbsPage").then((m) => ({ default: m.WbsProjectPage })));

function RouteFallback() {
  return (
    <p className="tk-status tk-status--agent" role="status">
      <span className="tk-spinner tk-spinner--sm" aria-hidden="true" />
      불러오는 중
    </p>
  );
}

// 영역 넷은 라우트다(디자인 시스템 docs/19 §5). 결과물은 어느 화면에서든 ?artifact=<id> 로 연다.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/share/:shareId" element={<PublicMeetingPage />} />
      <Route element={<AppShell />}>
        <Route path="/remote-desktop" element={<Suspense fallback={<RouteFallback />}><RemoteDesktopPage /></Suspense>} />
        {/* /chat·/work 는 맡긴 일의 계층 캔버스(ADR 0014), /thread 는 따까리 대화 전체 화면 */}
        <Route path="/chat" element={<DeskHome pool="personal" />} />
        <Route path="/chat/thread" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/work" element={<DeskHome pool="work" />} />
        <Route path="/work/thread" element={<ChatPage pool="work" />} />
        <Route path="/work/:sessionId" element={<ChatPage pool="work" />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/failed" element={<FailedTasksPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route
          path="/context-library"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ContextLibraryPage />
            </Suspense>
          }
        />
        <Route path="/context-library/items/:kind/:id" element={<Suspense fallback={<RouteFallback />}><ContextLibraryItemPage /></Suspense>} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/settings" element={<LegacySettingsRedirect />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/stocks/tossinvest" element={<TossInvestPage />} />
        <Route path="/tts" element={<Suspense fallback={<RouteFallback />}><TtsPage /></Suspense>} />
        <Route path="/notebooklm" element={<Suspense fallback={<RouteFallback />}><NotebookLMPage /></Suspense>} />
        <Route path="/notebooklm/:notebookId" element={<Suspense fallback={<RouteFallback />}><NotebookLMDetailPage /></Suspense>} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/research" element={<Suspense fallback={<RouteFallback />}><ResearchPage /></Suspense>} />
        <Route path="/logs" element={<OpsLogsPage />} />
        <Route path="/design-systems" element={<DesignSystemPage />} />
        <Route path="/collect" element={<Suspense fallback={<RouteFallback />}><CollectPage /></Suspense>} />
        <Route path="/knowledge-library" element={<Suspense fallback={<RouteFallback />}><KnowledgeLibraryPage /></Suspense>} />
        <Route path="/harness" element={<Suspense fallback={<RouteFallback />}><HarnessPage /></Suspense>} />
        <Route path="/artcraft" element={<ArtcraftPage />} />
        <Route path="/reverse" element={<ReversePage />} />
        <Route path="/reverse/:jobId" element={<ReverseDetailPage />} />
        <Route path="/artcraft/manage" element={<ArtcraftManagePage />} />
        <Route path="/artcraft/c/:category" element={<ArtcraftCategoryPage />} />
        <Route path="/artcraft/t/:taskId" element={<ArtcraftTaskPage />} />
        <Route path="/logs/issues/:id" element={<OpsIssuePage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/new" element={<MeetingNewPage />} />
        <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        <Route path="/pms" element={<Suspense fallback={<RouteFallback />}><PmsListPage /></Suspense>} />
        <Route path="/pms/:projectId" element={<Suspense fallback={<RouteFallback />}><PmsProjectPage /></Suspense>} />
        <Route path="/pms/:projectId/:tab" element={<Suspense fallback={<RouteFallback />}><PmsProjectPage /></Suspense>} />
        <Route path="/wbs" element={<Suspense fallback={<RouteFallback />}><WbsListPage /></Suspense>} />
        <Route path="/wbs/:projectId" element={<Suspense fallback={<RouteFallback />}><WbsProjectPage /></Suspense>} />
        <Route path="/wbs/:projectId/:view" element={<Suspense fallback={<RouteFallback />}><WbsProjectPage /></Suspense>} />
        <Route path="/github/*" element={<Suspense fallback={<RouteFallback />}><GithubPage /></Suspense>} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/creative" element={<Suspense fallback={<RouteFallback />}><CreativePlanNewPage /></Suspense>} />
        <Route path="/creative/legacy" element={<Suspense fallback={<RouteFallback />}><CreativePage /></Suspense>} />
        <Route path="/creative/plan" element={<Suspense fallback={<RouteFallback />}><CreativePlanNewPage /></Suspense>} />
        <Route path="/creative/plan/:id" element={<Suspense fallback={<RouteFallback />}><CreativePlanDetailPage /></Suspense>} />
        <Route path="/creative/records" element={<Suspense fallback={<RouteFallback />}><ProductionRecordsPage /></Suspense>} />
        <Route path="/creative/records/:rid" element={<Suspense fallback={<RouteFallback />}><ProductionRecordDetailPage /></Suspense>} />
        <Route path="/creative/:id" element={<Suspense fallback={<RouteFallback />}><CreativeDetailPage /></Suspense>} />
        <Route path="/games/:id" element={<GamePage />} />
        <Route path="/checklists" element={<ChecklistsPage />} />
        <Route path="/memos" element={<MemosPage />} />
        <Route path="/memos/:memoId" element={<MemosPage />} />
        <Route
          path="/calendar"
          element={
            // FullCalendar 는 약 77KB(gzip)라 캘린더를 열 때만 받는다.
            <Suspense fallback={<RouteFallback />}>
              <CalendarPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
