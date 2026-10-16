# 2026-10-16 회의록 읽기·내보내기·공개 페이지

- 사용자 요청: 전날 미착수였던 문서형 전사, 다양한 파일 다운로드, 로그인 없는 선택 공유를 이어 구현한다.
- 동일 화자의 연속 발화·화자 이름·시각·검색·근거 연결은 유지하고 발화 카드 외곽선을 제거했다. 검수 표시는 선택 제어로 옮기며 반복 접힘 표시는 기본 읽기에서도 남겼다.
- owner 다운로드: 내용/이름/근거 선택 → 미리보기 → source revision 고정 export. TXT/MD/JSON/CSV의 적용 가능 part는 서버 응답으로 결정한다. 다운로드는 공유 생성 없이 Blob으로 저장한다.
- owner 공유: 선택 → 검토 → 명시적 게시, 1/7/30일 만료, 다운로드 형식 선택/조회 전용, 현재 snapshot 갱신, 해제 확인을 제공한다. 발급 비밀은 웹 저장소에 넣지 않는다. 기존 링크를 잃었으면 회수 후 재발급한다.
- `/share/:shareId#key=…`는 직접 진입 시 AuthProvider/AppShell 밖에서 초기화하며 capability 전용 fetch를 사용한다(credentials omit, cache no-store, no owner token/refresh). 조회 재확인 실패 시 이전 본문도 숨긴다. 목차는 key fragment를 덮어쓰지 않고 문서 안에서 이동한다.
- no-store/no-referrer/noindex/CSP 헤더 및 public navigation SW fallback 제외. 외부 Markdown 이미지·HTML·앱 내부 자료 자동 조회를 하지 않는다. CSP의 인라인 허용은 기존 theme bootstrap의 정확한 SHA-256 한 개다.
- PDF/Word/자막, PMS/WBS/Artifact 공유, 새 녹음 재생 UI·서버 화자 이름 편집 연결은 이번 범위 밖이다. 이름 기본 제외는 메타데이터 대상이며 본문 속 이름을 자동 익명화하지 않으므로 preview 검토가 필요하다.
- 검증: 기능 부재 RED 뒤 owner/public 인증 분리, revision/CSV part, 명시적 게시 전제, 회사 확인, 선택 변경 시 재검토, 웹 저장소 비밀 미저장, 조회 실패 시 이전 본문 제거, 목차 이동 회귀를 확인했다. 최종 명령·결과는 아래에 보충한다.
- 지정 브라우저에서 합성 자료로 1280px/390px·라이트/다크 화면, 공유 preview/발급/해제, 목차 이동, TXT 실제 브라우저 다운로드를 확인했다. UI fixture는 review/의 로컬 검증 전용이며 배포 커밋에는 포함하지 않는다. 실제 개인 회의 자료는 작업 중 공개하지 않았다. 실제 휴대폰/로그인한 운영 자료 end-to-end는 미검증이다.
- 다른 세션의 알림 작업 파일이 나타나 기존 체크아웃에서 내 변경만 별도 worktree로 옮겼으며, 다른 세션 파일은 보존했다. 의존성은 기존 node_modules를 사용했고 pnpm worktree 설치 래퍼의 symlink 제약 때문에 node로 tsc/Vite/Vitest/ESLint를 직접 실행했다.
- 운영 반영은 front push 후 Vercel commit status와 실제 공개 경로/번들 확인, backend는 외부 배포 예약만 사용한다. 예약 수락은 배포 성공으로 쓰지 않는다.

최종 검증: `node node_modules/vitest/vitest.mjs run --reporter=dot` → **458 passed, 1 skipped**. `node node_modules/typescript/bin/tsc -b`, Vite production build, 변경 파일 ESLint, `git diff --check` 통과. design-lint 4파일 검출 없음, 새 CSS 미정의 토큰 없음. backend 새 격리 DB의 공유/export/migration 59 passed, Ruff 통과.
