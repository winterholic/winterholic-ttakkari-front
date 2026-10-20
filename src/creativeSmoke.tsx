// Local manual fixture only. Vite production includes index.html, never this file.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { setAccessToken } from "./api/client";
import { CreativePage, CreativeDetailPage } from "./pages/CreativePage";
import "./vendor/ttakkari/tokens.css";
import "./vendor/ttakkari/typography.css";
import "./vendor/ttakkari/components.css";
import "./shell/shell.css";
const token = await fetch("http://127.0.0.1:8897/test-token").then((r) =>
  r.json(),
);
setAccessToken(token.access_token);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<CreativePage />} />
        <Route path="/creative/:id" element={<CreativeDetailPage />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
// Measurements are visible to the configured browser's accessibility snapshot.
const output = document.createElement("output");
output.setAttribute("aria-label", "검증 계측");
document.body.append(output);
setInterval(() => {
  const video = document.querySelector("video");
  output.textContent = JSON.stringify({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > innerWidth,
    duration: video?.duration || null,
    currentTime: video?.currentTime || 0,
    paused: video?.paused ?? null,
    error: video?.error?.code ?? null,
  });
}, 1000);
