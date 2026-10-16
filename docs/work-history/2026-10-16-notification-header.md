# 홈 상단바 알림 진입점 — 2026-10-16

사용자가 더보기에서 알림으로 들어가는 동선이 깊다고 지적하고, 첨부한 메인 상단바 우측에 직접 진입점을 요청했다.

- 개인·회사 DeskHome의 상단바 오른쪽 끝에 종 아이콘을 추가했다. 로딩·실패 상태에서도 접근할 수 있다.
- 전체 미확인 개수를 표시하고 100개 이상은 99+로 줄인다. 개수 로드 전에는 0으로 단정하지 않는다. API 오류여도 링크는 남는다.
- 기존 notifications 조회 API를 limit=1로 재사용한다. 30초 갱신, 앱 복귀 재동기화, 목록 읽음 처리의 캐시 무효화와 연결했다.
- 최소 알림 터치 영역 44×44px. 359px 이하에서는 홈 헤더 간격과 모드 전환 좌우 패딩만 줄여 제목 공간을 확보한다.
- 검증: TTAKKARI_NO_ENV_FILE=1 node node_modules/vitest/vitest.mjs run src/pages/DeskHome.test.tsx src/pages/NotificationsPage.test.tsx src/shell/AppShell.test.tsx → 32 passed. tsc -b, Vite build, 변경 파일 ESLint, git diff --check exit 0. 기존 500KB 번들 경고가 있다.
- 지정 ttakkari_browser에서 실제 PageHeader/PoolSwitch/NotificationLink/NotificationsPage를 합성 알림 API로 렌더했다. 390×844·320×740·1280×900에서 알림 버튼 44×44, 겹침 없음, 120→99+ 표시, 알림함 이동→알림 읽음→홈 복귀 후 배지 제거를 확인했다. 회사 홈에도 같은 진입점을 확인했다. quick.mjs는 로컬 브라우저 직접 실행 대신 승인된 브라우저 도구의 box 계측을 사용해 미실행했다. 실제 로그인·기기 PWA의 검증은 포함하지 않는다.
- 작업 위치: /Users/winterholic/testing/ttakkari-header-notifications. 원본 front의 계정 사용량 관련 미커밋 변경은 건드리지 않았다. 합성 미리보기 파일과 Vite 프로세스는 검증 후 제거·종료했다.
- 브라우저 증거: /Users/winterholic/.ttakkari/data/outbox/f0853153-01da-4694-a232-6d93c403e3b3/browser/.
