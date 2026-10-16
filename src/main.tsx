// 디자인 시스템 CSS 순서가 중요하다(토큰 → 글자 → 컴포넌트 → 문서). docs/19 §1
import "./vendor/ttakkari/tokens.css";
import "./vendor/ttakkari/typography.css";
import "./vendor/ttakkari/components.css";
import "./vendor/ttakkari/prose.css";
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
