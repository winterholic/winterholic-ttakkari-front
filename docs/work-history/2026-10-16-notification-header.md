# 홈 상단바 알림 진입점 — 2026-10-16

사용자가 더보기에서 알림으로 들어가는 동선이 깊다고 지적하고, 첨부한 메인 상단바 우측에 직접 진입점을 요청했다.

- 개인·회사 DeskHome의 상단바 오른쪽 끝에 종 아이콘을 추가했다. 로딩·실패 상태에서도 접근할 수 있다.
- 전체 미확인 개수를 표시하고 100개 이상은 99+로 줄인다. 개수 로드 전에는 0으로 단정하지 않는다. API 오류여도 링크는 남는다.
- 기존 notifications 조회 API를 limit=1로 재사용한다. 30초 갱신, 앱 복귀 재동기화, 목록 읽음 처리의 캐시 무효화와 연결했다.
- 최소 알림 터치 영역 44×44px. 처음 추가할 때 359px 이하 간격을 줄였으나, 아래 말풍선 제거 후 충분한 폭이 확보돼 해당 보정을 해제했다.
- 검증: TTAKKARI_NO_ENV_FILE=1 node node_modules/vitest/vitest.mjs run src/pages/DeskHome.test.tsx src/pages/NotificationsPage.test.tsx src/shell/AppShell.test.tsx → 32 passed. tsc -b, Vite build, 변경 파일 ESLint, git diff --check exit 0. 기존 500KB 번들 경고가 있다.
- 지정 ttakkari_browser에서 실제 PageHeader/PoolSwitch/NotificationLink/NotificationsPage를 합성 알림 API로 렌더했다. 390×844·320×740·1280×900에서 알림 버튼 44×44, 겹침 없음, 120→99+ 표시, 알림함 이동→알림 읽음→홈 복귀 후 배지 제거를 확인했다. 회사 홈에도 같은 진입점을 확인했다. quick.mjs는 로컬 브라우저 직접 실행 대신 승인된 브라우저 도구의 box 계측을 사용해 미실행했다. 실제 로그인·기기 PWA의 검증은 포함하지 않는다.
- 작업 위치: /Users/winterholic/testing/ttakkari-header-notifications. 원본 front의 계정 사용량 관련 미커밋 변경은 건드리지 않았다. 합성 미리보기 파일과 Vite 프로세스는 검증 후 제거·종료했다.
- 브라우저 증거: /Users/winterholic/.ttakkari/data/outbox/f0853153-01da-4694-a232-6d93c403e3b3/browser/.

## 후속: 모바일 말풍선 진입점 제거

- 사용자가 알림 옆 말풍선이 하단 작업 탭과 중복된다고 요청했다. 개인·회사 홈 모바일 상단바에서 대화 링크를 제거했다. 데스크톱 옆 패널 토글과 하단 탐색은 유지했다.
- 관련 기존 검사 `TTAKKARI_NO_ENV_FILE=1 node node_modules/vitest/vitest.mjs run src/pages/DeskHome.test.tsx src/shell/AppShell.test.tsx` → 26 passed. tsc -b·Vite build·변경 파일 ESLint exit 0.
- 지정 브라우저에서 실제 DeskHome 전체를 합성 API로 렌더해 390px와 320px 개인·회사 헤더에 말풍선이 없고 알림 링크 44×44와 모드 전환이 유지되는 것을 box snapshot으로 확인했다. 데스크톱 토글도 렌더된다. 전체 AppShell과 로그인한 실제 PWA 검증은 미포함이다. 임시 파일·서버·브라우저 종료.
- 증거: outbox/5bc81dc5-4cdb-4946-926f-310307291c42/browser. 이 커밋 main push 후 Vercel 및 운영 번들로 적용을 확인한다.
