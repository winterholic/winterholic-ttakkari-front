import { Navigate, Route, Routes } from "react-router";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { LibraryPage } from "./pages/LibraryPage";
import { FilesPage } from "./pages/FilesPage";
import { AppShell } from "./shell/AppShell";

// 영역 넷은 라우트다(디자인 시스템 docs/19 §5). 결과물은 어느 화면에서든 ?artifact=<id> 로 연다.
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/:sessionId" element={<WorkspacePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/files" element={<FilesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}
