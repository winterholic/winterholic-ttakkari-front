// 디자인 시스템 CSS 순서가 중요하다(토큰 → 글자 → 컴포넌트 → 문서). docs/19 §1
import "./vendor/ttakkari/tokens.css";
import "./vendor/ttakkari/typography.css";
import "./vendor/ttakkari/components.css";
import "./vendor/ttakkari/prose.css";
import "./boot.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth";
import { App } from "./App";
import { setupPwaUpdate } from "./pwaUpdate";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { UpdateToast } from "./UpdateToast";
import { PublicMeetingPage } from "./pages/PublicMeetingPage";

// Pretendard·JetBrains Mono. font-display: swap 이라 글꼴이 늦게 와도 글자는 먼저 보인다. 오프라인에서는 서비스워커 캐시가 준다.
for (const href of [
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5/index.min.css",
]) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

const publicEntry = window.location.pathname.startsWith("/share/");
if (!publicEntry) setupPwaUpdate();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {publicEntry ? <BrowserRouter><Routes><Route path="/share/:shareId" element={<PublicMeetingPage />} /></Routes></BrowserRouter> : <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>}
      </QueryClientProvider>
    </AppErrorBoundary>
    {!publicEntry && <UpdateToast />}
  </StrictMode>,
);
