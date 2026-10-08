import { Link, Navigate, Outlet, Route, Routes } from "react-router";
import { useAuth } from "./auth";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { SessionPage } from "./pages/SessionPage";
import { LibraryPage } from "./pages/LibraryPage";
import { ArtifactPage } from "./pages/ArtifactPage";

function RequireAuth() {
  const { state, logout } = useAuth();
  if (state === "loading") return <p>불러오는 중</p>;
  if (state === "out") return <Navigate to="/login" replace />;
  return (
    <>
      <nav>
        <Link to="/">홈</Link> <Link to="/library">라이브러리</Link> <button onClick={() => void logout()}>로그아웃</button>
      </nav>
      <Outlet />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/s/:sessionId" element={<SessionPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/a/:artifactId" element={<ArtifactPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
