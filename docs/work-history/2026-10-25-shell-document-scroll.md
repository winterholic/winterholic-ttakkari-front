# 2026-10-25 데스크톱 셸 문서 스크롤 차단

- 기준 revision: `e771c5e700307b9bc910faef3ea424273e10fab5` (origin/main).
- 이전 수정 `67d00e7`은 채택하지 않았다. 높이 상속 규칙은 이미 main의 `5c61907`에 있으며, dvh 갱신 실패라는 원인은 독립 검증에서 재현되지 않았다. 로컬 main의 다른 변경은 보존했다.
- 원본 이미지의 사이드바 상단이 사라지고 sticky 헤더는 남는 모습은 셸 전체가 위로 스크롤된 경우와 일치한다. 이미지 자체에는 DOM 측정값이 없으므로 당시 최초 트리거를 확정하지 않는다.
- 회귀 fixture에서 **인위적으로 넘치는 자식**을 추가하고 포커스/문서 스크롤을 수행했다. 수정 전 `scrollY=713`, 셸 `top=-713`, `bottom=207`, `height=920`. 높이 축소 없이 같은 빈 영역 형태가 재현됐다. 이것은 공통 실패 경로의 재현이며 원본 데이터를 이용한 최초 트리거 재현은 아니다.
- `shell.css`의 기존 데스크톱 미디어 쿼리에 `.tk-app { overflow: clip }`을 추가했다. 셸 밖 넘침이 문서 스크롤 범위로 전파되지 않게 하며, 내부 스크롤과 sticky의 기준은 유지한다. 모바일 규칙·vendor CSS·lint baseline은 바꾸지 않았다.
- CSS 근거: https://www.w3.org/TR/css-overflow-3/#valdef-overflow-clip . html/body에 적용하면 viewport 전파 시 hidden으로 해석되므로 앱 셸에 적용했다.

## 실행 증거

- configured `ttakkari_browser` Chromium + Vite 합성 API. fixture `/scripts/ui-sweep/shell-scroll.html`: 수정 전 위 두 검사 FAIL → 수정 후 6개 PASS. 1850×920, 1024×300에서 문서 원점·셸 경계·본문 스크롤(500)·사이드바 스크롤(300)·모달 표시·공개 문서의 문서 스크롤(713)을 확인했다.
- 실행 방법: 환경 파일 없이 Vite를 띄우고 위 fixture URL을 데스크톱 폭(1024 이상)에서 연다. 화면 아래와 console에 PASS/FAIL 및 측정값이 나온다. 이 HTML은 일반 앱 번들에 포함되지 않는다.
- 실제 앱 라우트 `/chat/s1`, `/memos`, `/calendar`, `/meetings`, `/library`, `/settings`: 각 1850×920과 360×740에서 셸 `top=0`, `height=innerHeight`, `scrollY=0` (총 12개 조합). 실제 계정·실제 API는 사용하지 않았다. 설정의 Google 계정 응답은 임시 서버에서 `{accounts:[]}`로 보완해 이전 fixture 크래시를 피했다.
- 실제 설정 화면의 데스크톱 사용자 메뉴: y445–864, 모든 항목 표시. 모바일 드로어: 360×740에서 306×740, Escape 닫기.
- `TTAKKARI_NO_ENV_FILE=1 node node_modules/vitest/vitest.mjs run src/shell/AppShell.test.tsx src/features/chat/Composer.test.tsx src/ui/Menu.test.tsx src/ui/Dialog.test.tsx`: 3 files, 22 passed.
- `TTAKKARI_NO_ENV_FILE=1 node node_modules/typescript/bin/tsc -b` 및 `TTAKKARI_NO_ENV_FILE=1 node node_modules/vite/bin/vite.js build`: exit 0, `dist/sw.js` 생성. 기존 큰 청크 경고가 있다.
- `node node_modules/eslint/bin/eslint.js .`, `node scripts/ui-lint.mjs`, `git diff --check`: exit 0. ui-lint 138/138, baseline 변경 없음.
- 이 Codex command sandbox의 브라우저 preflight는 mach-register/mach-lookup denied(exit 78)여서 로컬 Chrome은 실행하지 않았다. 브라우저 검사는 별도의 configured MCP 브라우저에서 수행했다.
- 원본 발생 환경의 최초 넘침 요소, 실기기 Safari·가상 키보드, 로그인된 운영 화면에서의 재발 여부는 미검증이다. 기존 독립 검증의 SPA/문서 뒤로가기·리사이즈 결과는 재사용했으며 이 변경 후의 해당 전이는 별도로 재실행하지 않았다.

## 게시

- 이 기록의 작성 시점에는 아직 push 전이다. 최종 SHA와 배포 결과는 GitHub main 및 해당 SHA의 Vercel deployment/status를 확인한다.
