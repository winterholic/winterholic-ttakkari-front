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
import { MorePage } from "./pages/MorePage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { TasksPage } from "./pages/TasksPage";
import { AppShell } from "./shell/AppShell";

// 도서관 화면은 그래프·트리맵·진단 코드가 모여 있어 열 때만 받는다.
const ContextLibraryPage = lazy(() => import("./pages/ContextLibraryPage").then((m) => ({ default: m.ContextLibraryPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
// PMS·WBS 는 간트·칸반 코드가 모여 있어 열 때만 받는다.
const PmsListPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsListPage })));
const PmsProjectPage = lazy(() => import("./pages/PmsPage").then((m) => ({ default: m.PmsProjectPage })));
const WbsListPage = lazy(() => import("./pages/WbsPage").then((m) => ({ default: m.WbsListPage })));
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
      <Route element={<AppShell />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/work" element={<ChatPage pool="work" />} />
        <Route path="/work/:sessionId" element={<ChatPage pool="work" />} />
        <Route path="/tasks" element={<TasksPage />} />
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
        <Route path="/files" element={<FilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/new" element={<MeetingNewPage />} />
        <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        <Route path="/pms" element={<Suspense fallback={<RouteFallback />}><PmsListPage /></Suspense>} />
        <Route path="/pms/:projectId" element={<Suspense fallback={<RouteFallback />}><PmsProjectPage /></Suspense>} />
        <Route path="/pms/:projectId/:tab" element={<Suspense fallback={<RouteFallback />}><PmsProjectPage /></Suspense>} />
        <Route path="/wbs" element={<Suspense fallback={<RouteFallback />}><WbsListPage /></Suspense>} />
        <Route path="/wbs/:projectId" element={<Suspense fallback={<RouteFallback />}><WbsProjectPage /></Suspense>} />
        <Route path="/wbs/:projectId/:view" element={<Suspense fallback={<RouteFallback />}><WbsProjectPage /></Suspense>} />
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
