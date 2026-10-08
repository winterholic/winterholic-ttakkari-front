// 디자인 시스템 CSS 순서가 중요하다(토큰 → 글자 → 컴포넌트 → 문서). docs/19 §1
import "./vendor/ttakkari/tokens.css";
import "./vendor/ttakkari/typography.css";
import "./vendor/ttakkari/components.css";
import "./vendor/ttakkari/prose.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth";
import { App } from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
