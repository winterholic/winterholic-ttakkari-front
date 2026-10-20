# G32 버전 이력 탐색·필터·비교 UX

게임 관제탑 "버전" 탭을 탐색·비교 도구로 키웠다. 설계와 이유는 back ADR 0061.

- **필터**: 검색(요청문·v번호·커밋·오류) + "필터" 토글 뒤 세 줄 `tk-segmented--scroll`(상태·기간·시각 피드백). 이미 받은 목록에서 거르고, 개수와 "필터 지우기"를 항상 보인다. 피드백은 "반영"(만든 요청에 화면 표시·오브젝트·영상이 붙음)과 "받음"(이 버전 기준 피드백 요청이 나감)으로 나눴다. `GameFeedback` 표는 쓰이지 않아 Run 표식에서 읽는다.
- **버전 행**: 경위(수정·개발 요청·복구 빌드·직접 빌드)와 기준 버전, 요청문, 피드백 종류 배지, 이 버전에 걸린 요청 수.
- **비교**: 행의 "비교에 담기"로 이전·최신 칸을 채움(현재 최신보다 오래되면 이전 칸). 칸마다 경위·요청문, 캡처, "해 보기"(그 빌드를 sandbox iframe 대화상자로 한 번에 하나, 진행 저장·캡처 bridge 연결 없음). 변경 요약은 빌드 기록 + 소스 변경(파일 증감·커밋 제목, `/compare`) + 사이에 들어온 요청문.
- **이전 세대 서버 공존**: `/versions`·`/compare` 가 없거나 실패하면 빌드 목록·빌드 기록 요약만 보이고 요청·피드백 필터를 숨긴다(Vercel 이 백엔드 배포보다 먼저 나갈 수 있다).
- **코드**: `versionInfo.ts`(순수 함수), `VersionFilters.tsx`, `VersionCompare.tsx`(비교·소스 변경·해 보기), `BuildHistory.tsx`(조립). 롤백·빌드 로그 동작은 그대로. `listGameBuilds` 기본 limit 을 50→100 으로 올렸다.
- **ui-lint**: G30 때 들어간 `games.css` 위반(hex·px·vh·없는 토큰, 기준선 0 초과)이 `npm run lint` 를 깨고 있어 토큰으로 고쳤다. 위반 138건 기준선 이내로 확인.

검증: `npx vitest run` 1138 passed(새 13개: 필터·비교 칸·소스 변경·이전 서버 폴백·해 보기·실패 빌드), `npx tsc -b` 오류 없음, `npx eslint src` 오류 없음, `node scripts/ui-lint.mjs` ok, `npm run build` 성공. `eslint .` 는 git 무시 대상 `.agent-notes/` 때문에 이 worktree 에서만 실패한다(내 변경과 무관, `src` 는 통과).

브라우저(합성): Chromium 390x844(Google Chrome for Testing 1248, playwright-core), 합성 API 응답(route 가로채기)과 합성 게임 페이지. 확인: 버전 6개 목록, 필터 열기·피드백 반영(2개)·기간 7일(3개)·필터 지우기, 비교 담기(`/compare?base=b3&head=b6` 호출), 소스 변경·사이의 요청 표시, 해 보기 대화상자의 iframe 열림·닫으면 제거. 가로 넘침 없음(scrollWidth 390=viewport), 콘솔 오류 0. 처음 본 결함 두 가지를 고쳤다: 비교 칸에서 피드백 배지가 오른쪽으로 잘림(배지를 부분별로 나눔), 커밋 해시가 줄바꿈되며 쪼개짐. 증거 스크린샷은 outbox 참조.

미검증: 실제 게임·실제 worker Run 이 쌓인 운영 데이터, 빌드 100개 이상, iOS Safari·실기기, 합성이 아닌 실제 Phaser iframe 의 "해 보기". 백엔드 배포 전에는 이전 서버 폴백 상태로 동작한다.
