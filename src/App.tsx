import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { LibraryPage } from "./pages/LibraryPage";
import { FilesPage } from "./pages/FilesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AssistantPage } from "./pages/AssistantPage";
import { MemosPage } from "./pages/MemosPage";
import { MorePage } from "./pages/MorePage";
import { AppShell } from "./shell/AppShell";

const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));

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
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/more" element={<MorePage />} />
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
