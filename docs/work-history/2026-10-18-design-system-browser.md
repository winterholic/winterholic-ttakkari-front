# 디자인시스템 조회 (2026-10-18)

사용자 요청에 따라 부가 기능 > 디자인시스템(`/design-systems`)을 추가했다. 백엔드 ADR 0034 공통 조회 서비스와 연결한다. 7개 프로젝트 선택, 토큰·지침·컴포넌트 CSS·예제 검색, 토큰 양 테마 색상/원본 값/참조 탐색/CSS 변수 복사, 문서와 원문 전환, 본문 구간 이동을 지원한다.

URL에 프로젝트·검색·종류·항목·커밋을 보존한다. 모바일은 목록/상세 전환, 데스크톱은 목록과 상세 2열이며 상세 안에서 라이트/다크를 비교한다. 긴 표는 별도 키보드 접근 가능한 스크롤 영역이다. 기존 front의 미커밋 작업과 분기 상태는 변경하지 않고 별도 front-design-system에서 작업했다.

검증:
- `TTAKKARI_NO_ENV_FILE=1 ../front/node_modules/.bin/vitest run`: **564 passed, 1 skipped**. 신규 6건 및 메뉴·Markdown 앱 링크 경로 계약 포함.
- `tsc -b`, `eslint .`, `node scripts/ui-lint.mjs`: 통과, 기존 기준선 아래 138건. 신규 CSS의 26개 토큰 존재 검사 통과.
- `TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:8796 ../front/node_modules/.bin/vite build`: 로컬 preview용 빌드 통과. 이 로컬 API 값은 커밋하지 않는다. 배포는 기존 Vercel 빌드 환경을 따른다.
- configured ttakkari_browser + 로컬 읽기 전용 테스트 인증 + 실제 DS 커밋: 320·390·1440, 라이트·다크, 토큰 참조/문서/예제/다음 구간 확인. 최종 console error 0. 실제 iOS 및 운영 로그인 검증은 미실행.

설계·스크린샷·로그: Run outbox `98a6b230-f896-4ce2-b9a3-fef4c684451e`. 백엔드 `/api/design-systems` 배포가 필요하다. HTML 예제는 소스이며 라이브 실행·브랜드 이미지 뷰어·편집 기능은 범위 밖이다.
