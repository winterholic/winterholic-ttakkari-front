import type { ReactNode } from "react";

/** Project-scoped reusable API key issuance and revocation panel. */
export function ProjectApiKeyPanel({ children }: { children: ReactNode }) {
  return <section className="share-section share-api-key-panel" aria-label="프로그램용 API Key">
    <div className="share-section-head"><div><h2>프로그램용 API Key</h2><p>REST와 MCP 클라이언트가 Authorization 헤더로 사용하는 재사용 키입니다.</p></div></div>
    {children}
  </section>;
}
