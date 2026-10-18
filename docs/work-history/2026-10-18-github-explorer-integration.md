# GitHub 탐색 프론트: main 통합 (2026-10-18)

`feat/github-explorer-20261018`(75a3eb4, 기준 52c9391)의 6개 커밋을 최신 `origin/main`(79c4ec8) 위에 clean worktree(`/private/tmp/ttakkari-gh-integrate-front`)에서 cherry-pick했다. 충돌은 없었고 `git diff 52c9391 75a3eb4`와 `git diff origin/main HEAD`가 같다(69개 파일). 기존 front 체크아웃의 미커밋 36개 파일은 읽지도 포함하지도 않았다.

## 독립 검증 테스트 보존
verifier 브랜치 `verify/github-frontend-20261018`(3102d67)은 832cf62 위에 테스트 2파일만 더한 것이다. 둘 다 통합본에 그대로 들여왔다(충돌 없음, 별도 커밋 `test: GitHub 탐색 독립 검증 테스트 보존`).
- `src/features/github/adversarial.verify.test.tsx`: 반례 72건. 통합본(75a3eb4 이유 문구 수정 포함)에서 72건 통과.
- `src/features/github/realBackend.verify.test.tsx`: 실제 격리 백엔드와 실제 gh 계정에 붙는 9건. `GH_REAL_BACKEND`가 없으면 건너뛰므로 일반 vitest에는 영향이 없다. 이번 Run에서는 실행하지 않았다.

## 검사 (커밋 422f08e, 환경 파일 없이 `TTAKKARI_NO_ENV_FILE=1`)
- `vitest run`(전체): Test Files 102 passed, 2 skipped (104) / Tests 872 passed, 10 skipped (882). 건너뜀은 환경변수 게이트 테스트(실제 백엔드 9건 포함)다.
- `tsc -b`: 종료 0, `vite build`: 완료, `eslint .`: 종료 0, `node scripts/ui-lint.mjs`: 위반 138건(기준선 139건 이하)
- 이 worktree는 기존 체크아웃의 `node_modules`를 심볼릭 링크로 썼고 `pnpm`의 자동 설치는 막혔다. 그래서 `node_modules/.bin/*`를 직접 실행했다.

## 미검증·후속
- 실기기(iPhone Safari PWA), 운영 번들·운영 백엔드와의 실제 동작은 확인하지 않았다.
- 레이아웃 sweep(`pnpm check:layout`)·WebKit 스크린샷은 이 통합 Run에서 다시 돌리지 않았다. 기능 브랜치 단계의 결과를 따른다.
- 배포는 main push가 Vercel 자동 배포를 시작한다. 반영 여부는 push 뒤 Vercel 커밋 상태로 별도 확인한다.
