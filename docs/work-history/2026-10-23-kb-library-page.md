# 지식 도서관 페이지 (백엔드 ADR 0063, 2026-10-23)

- 요청: "지식도서관 페이지는 만들어지지도 않았네, 프론트랑 백 배포까지". 개인 맥락 도서관(`/context-library`, 근거 탭 `features/knowledge`)과는 별개의 화면이다. 테이블·검색 풀을 섞지 않는다.
- 위치: 공유 checkout의 다른 세션 미커밋 변경을 피하려고 `origin/main`(4348cb7) 기준 worktree `front-kb-library`(브랜치 feat/kb-library-20261023)에서 작업했다.
- 라우트 `/knowledge-library`(lazy), 부가 기능 목록 항목 "지식 도서관"(아이콘 `kb-library` = lucide Library). 구현: `src/pages/KnowledgeLibraryPage.tsx`, `src/features/kb/{Search,Documents,Evidence,Register}.tsx`, `kb.css`, `api/kbTypes.ts`, `api/client.ts`의 `kb*` 함수.
- 화면: 검색(강조된 패시지 발췌, 현재/이전 버전 배지, 출처, 원문 위치·해시 일치 펼치기), 문서(목록 페이지네이션, 버전 선택, 패시지, 원문 위치), 등록(텍스트·.txt/.md 파일 읽기, 멱등 안내, 문서 키로 새 버전). 상태는 URL(q, view, dq, doc, rev). 빈·로딩·오류·다음 쪽 오류, 640px 이하 한 열, 1024px 이상 2단. 값은 tk-* 토큰.
- 발췌 강조 좌표는 서버가 코드포인트 기준으로 주므로 `Array.from`으로 센다(`splitHighlights`, 이모지 시험 포함).
- 시험: `KnowledgeLibraryPage.test.tsx` 12개. 기존 `AppShell.test`의 부가 기능 목록 두 곳과 `linkTarget.test`의 APP_ROUTE_ROOTS 대조를 새 항목에 맞췄다.
- 한계: 브라우저 실제 렌더·320/390px 레이아웃 확인은 하지 않았다(jsdom 시험과 lint만). 검색은 백엔드의 단어 일치 방식이라 의미 검색 품질을 가정하지 않는다.
