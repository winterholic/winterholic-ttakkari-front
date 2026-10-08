import { Navigate, Outlet } from "react-router";
import { useAuth } from "../auth";

// TODO(shell 담당): 디자인 시스템 셸(사이드바·탭바·드로어)로 교체
export function AppShell() {
  const { state } = useAuth();
  if (state === "loading") return null;
  if (state === "out") return <Navigate to="/login" replace />;
  return (
    <div className="tk-app">
      <main className="tk-app__main" id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
