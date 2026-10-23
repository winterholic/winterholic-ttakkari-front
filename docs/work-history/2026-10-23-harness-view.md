# 하네스 조회 화면 (2026-10-23)

## 결과
- 부가 기능 > 하네스(`/harness`) 추가. 백엔드 ADR 0069의 `/api/harness`(소유자 전용 읽기 API)를 쓴다. 편집 기능 없음.
- 구현 커밋: a7fa716(origin/main 38a9711 위로 리베이스). 공유 checkout(main)에 미커밋 WIP(accounts·chat·pms 등)가 많아 건드리지 않고 `origin/main` 기준 worktree `front-harness-view`에서 작업했다.
- 화면: 찾기(검색 입력이 맨 위, 카테고리 칩 13종·요약 4칸·필터, 목록 → 상세, 1024px 이상 2단)와 세션별로 보기(접수·기획·작업자·메인 × 엔진 × 개인/회사, 레이어 카드에 순서·적용 여부·출처·근거 배지). 상태는 모두 URL(`q`·`cat`·`engine`·`scope`·`active`·`warn`·`hide_missing`·`item`·`view`·`s`·`le`·`pool`).
- 상세: 출처 경로·범위·수정 시각·크기·활성 이유·실리는 세션(누르면 세션별 보기로), frontmatter description 강조 상자(긴 설명은 접힘), 마크다운 렌더/원문, 긴 본문 접기·구간 이동, 마스킹 안내. 모바일은 상세에서 상단 탭·검색을 감춰 본문 공간을 확보한다.
- 변경 파일: `src/pages/HarnessPage.tsx`, `src/features/harness/{Finder,Detail,Layers}.tsx·labels.ts·harness.css`, `src/api/harnessTypes.ts`, `client.ts`(API 4개), `shell/features.ts`·`App.tsx`(라우트, lazy)·`linkTarget.ts`(APP_ROUTE_ROOTS)·`AppShell.test.tsx`(부가 기능 목록).

## 검증 (rebase 후)
- `pnpm exec tsc -b` 오류 없음. `pnpm lint` → `ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음)`.
- `vitest run` → `Test Files 139 passed | 2 skipped`, `Tests 1322 passed | 10 skipped`(신규 HarnessPage.test.tsx 10개: 기능 등록, 읽기 전용(편집 컨트롤 없음), 검색·필터의 URL·API 반영, 상세의 description 강조·마스킹 안내·경고, 긴 본문 접기·구간 이동, 경고에서 항목 이동, 레이어 순서·적용 여부·근거 배지·엔진 전환, 레이어에서 상세 이동, 실패 재시도, 강조·날짜 도우미).
- `pnpm build` 성공(`HarnessPage-*.js` 별도 chunk).
- 화면: 실제 harness_view 서비스(홈의 ~/.claude 등 실데이터, 따까리 홈은 임시 폴더라 비서 지침·고정 기억은 시험용 예시)를 임시 FastAPI 로 올리고 Chrome 으로 390×844(×2)·1440×900 캡처 23장, 가로 넘침 없음(`scrollWidth ≤ innerWidth`, 본문 스크롤러 포함). 라이트·다크 모두. 스크린샷은 outbox 에 저장했다.
- 중간에 vite dev 서버가 파일 변경을 놓쳐 이전 화면이 찍힌 적이 있어(서버 재시작 후 재캡처), 최종 캡처는 재시작 뒤 것이다.

## 미검증
- 로그인된 운영 화면, 실제 iOS Safari(WebKit 미설치로 Chrome 에뮬레이션만), 스크린리더 읽기 순서.
- 따까리 홈의 실제 지침·계정·측정 파일을 보여 주는 화면(서버에서 읽는 부분이라 운영 배포 후 확인 필요).
- 백엔드 배포가 끝나기 전에는 `/harness` 가 오류 상태(404)를 보여 준다(재시도 버튼 제공).
