# 계정관리 개별 로딩과 설정 통합

사용자 요청: 화면을 먼저 표시하고 각 계정 데이터를 독립 로딩한다. 중복된 설정 메뉴는 제거한다.

## 확인·변경
- 기존 계정 관리와 설정 메뉴는 둘 다 SettingsPage를 열었다. `/accounts`를 정본으로 통합하고 설정 메뉴를 제거했다. `/settings`는 query/hash를 보존해 이동한다. Google 계정·Qwen·음성·단축어·권한 폴더는 모두 보존했다.
- 목록은 DB 메타데이터(`/api/accounts?details=false`)만 먼저 받는다. 로그인 상태는 계정마다 `/status`로 조회한다. 개인·회사 모드는 목록/상태 캐시를 공유하며 상태 폴링은 개인 목록 하나가 담당한다.
- 상태 오류/재시도는 해당 행에만 표시한다. 뒤에서 목록 갱신이 실패해도 기존 행을 유지한다. 인증 확인·수정 응답은 독립 상태 캐시에도 반영해 옛 로그인 상태로 돌아가지 않는다.
- 권한 폴더 로딩은 해당 섹션에 표시한다. 다른 섹션 위에 전체 설정 skeleton을 쌓지 않는다.
- 꺼진 계정 행은 data-disabled로 색만 낮춘다. 부모 aria-disabled 때문에 스위치·메뉴가 비활성으로 상속되는 문제를 제거했다.

## 검증
- 전체 vitest: 1508 passed, 10 skipped. 계정/통합 페이지/링크 회귀 74 passed.
- tsc -b, 변경 파일 ESLint, Vite production build 통과.
- ui-lint의 collector/Missions.tsx inline-px 1건 및 collector.css 3건은 수정 전 origin/main archive에서도 동일 재현했다. 이 변경으로 늘어난 위반은 없다.
- configured browser: 390×844, 1440×1000. 합성 API의 Muse/작업공간 응답을 20초 지연시켜 빠른 계정과 제목·독립 섹션이 먼저 표시됨을 snapshot에서 확인했다. 기존 settings query/hash 이동과 단일 메뉴도 확인했다.
- dev 서버 SW MIME 오류는 dev에 sw.js가 없어서 발생한 검증 환경의 오류다. 실제 공급자 응답 속도·운영 전환은 별도 확인 대상이다. ui-refine quick.mjs 자동 계측은 미실행; browser snapshot의 bounding box로 지목한 계정 영역만 확인했다. 전역 미감/전체 UI 감사는 범위 밖이다.
