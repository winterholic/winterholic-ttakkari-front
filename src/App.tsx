import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { LibraryPage } from "./pages/LibraryPage";
import { FilesPage } from "./pages/FilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AssistantPage } from "./pages/AssistantPage";
import { MeetingDetailPage } from "./pages/MeetingDetailPage";
import { MeetingNewPage } from "./pages/MeetingNewPage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { MemosPage } from "./pages/MemosPage";
import { ChecklistsPage } from "./pages/ChecklistsPage";
import { MorePage } from "./pages/MorePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { TasksPage } from "./pages/TasksPage";
import { FailedTasksPage } from "./pages/FailedTasksPage";
import { DeskHome } from "./pages/DeskHome";
import { AppShell } from "./shell/AppShell";
import { PublicMeetingPage } from "./pages/PublicMeetingPage";
import { WeatherPage } from "./pages/WeatherPage";
import { StocksPage } from "./pages/StocksPage";
import { TossInvestPage } from "./pages/TossInvestPage";
import { OpsLogsPage } from "./pages/OpsLogsPage";
import { ArtcraftPage } from "./pages/ArtcraftPage";
import { ArtcraftManagePage } from "./pages/ArtcraftManagePage";
import { ArtcraftCategoryPage } from "./pages/ArtcraftCategoryPage";
import { ArtcraftTaskPage } from "./pages/ArtcraftTaskPage";
import { DesignSystemPage } from "./pages/DesignSystemPage";
import { ReverseDetailPage } from "./pages/ReverseDetailPage";
import { ReversePage } from "./pages/ReversePage";
import { OpsIssuePage } from "./pages/OpsIssuePage";
import { GamesPage } from "./pages/GamesPage";
import { GamePage } from "./pages/GamePage";

const RemoteDesktopPage = lazy(() => import('./pages/RemoteDesktopPage').then(m => ({ default: m.RemoteDesktopPage })));

// 도서관 화면은 그래프·트리맵·진단 코드가 모여 있어 열 때만 받는다.
const ContextLibraryPage = lazy(() => import("./pages/ContextLibraryPage").then((m) => ({ default: m.ContextLibraryPage })));
const ContextLibraryItemPage = lazy(() => import("./pages/ContextLibraryItemPage").then((m) => ({ default: m.ContextLibraryItemPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
// PMS·WBS 는 간트·칸반 코드가 모여 있어 열 때만 받는다.
const PmsListPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsListPage })));
const PmsProjectPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsProjectPage })));
// GitHub 탐색은 코드·diff·로그 뷰어가 모여 있어 열 때만 받는다.
const GithubPage = lazy(() => import("./pages/GithubPage").then((m) => ({ default: m.GithubPage })));
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
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/stocks/tossinvest" element={<TossInvestPage />} />
        <Route path="/notebooklm" element={<Suspense fallback={<RouteFallback />}><NotebookLMPage /></Suspense>} />
        <Route path="/notebooklm/:notebookId" element={<Suspense fallback={<RouteFallback />}><NotebookLMDetailPage /></Suspense>} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/research" element={<Suspense fallback={<RouteFallback />}><ResearchPage /></Suspense>} />
        <Route path="/logs" element={<OpsLogsPage />} />
        <Route path="/design-systems" element={<DesignSystemPage />} />
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
