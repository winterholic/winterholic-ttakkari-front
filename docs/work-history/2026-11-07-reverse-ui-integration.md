# Reverse verifier UI integration preparation

- Prepared on `integrate/reverse-ui-20261107`; starting clean HEAD: `3050e62cf94bed537b6aa5c440273e9034986e0e`.
- Preserved reviewed patch `c315ffcd0a4bf5a1363d339391ba79dcd6ca1cbd` by fast-forward; its parent is `3050e62cf94bed537b6aa5c440273e9034986e0e`. The patch owns `src/api/reverseTypes.ts`, `src/features/reverse/Reconstruction.tsx`, `src/pages/ReversePage.test.tsx`, and `src/pages/reverse.css`.
- Fetched `origin/main` at `a86544548c006c41bb4a9a49ab0cd0ab8a09713e` using the per-command `winterholic` GitHub credential. Merged it with a normal `ort` merge, producing product integration commit `cb6bcee8acdf7553bd925d4e53b8459239614753`; parents are the reviewed patch and that main SHA. No conflicts. The merge preserves main's 11 artcraft paths; its `src/api/client.ts` additions are artcraft-only. Reverse client changes from the integration branch remain intact. Notification preference implementation remains intact, and source commit `e00e539` is an ancestor.
- Product integration differs from the reviewed patch only in those main-owned artcraft paths. Re-ran the affected reverse fixture and full type/build bundle: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot` (25 passed, 1.23s); `TTAKKARI_NO_ENV_FILE=1 pnpm build` (`tsc -b`, Vite build succeeded; existing large-chunk advisory).
- `git diff --check` passed for the main merge. Final repository HEAD is this record commit; resolve its full SHA with `git rev-parse HEAD`. Product integration HEAD is `cb6bcee8acdf7553bd925d4e53b8459239614753`. Push, deployment, backend changes, browser/E2E, and full regression suite were not part of this preparation.

## Web evidence and screenshot UI follow-up

- Started from verified clean repository HEAD `073621ff9a37eb6780355016519158ac0ffc1aa3`. Read the pinned backend contract with `git show 9fb233bdb2f58c67ac4aee19c97d209e46b331cb:docs/reverse-platform/web-evidence.md`; this UI uses only that committed comparison/evidence contract, not uncommitted prompt or ZIP work.
- Added separate implementation/verifier functional and visual summaries, including optional `result_state.visual_comparison` and `result_state.verification_visual_comparison` normalization. A web functional match remains separate from visual mismatch/unverified. CLI/API and legacy entries do not show visual summaries when the server says not required or sends no visual comparison.
- Web evidence reads `integrity.status` plus its reasons and `provenance.status` plus its reason from the `web_capture` item. Preview actions require verified integrity, a safe relative PNG reference with SHA-256/size metadata, workspace/output path, and the corresponding implementation or verifier session. On click they resolve the artifact and fetch content through existing APIs, check PNG signature/size, and render a local object URL. Missing, unsafe, unverified and failed reads remain explicit; no screenshot URL is constructed from the evidence path.
- TDD fixtures first failed on missing result-state summary, evidence status and preview behavior, then passed. Final focused verification: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot` — 29 passed; `TTAKKARI_NO_ENV_FILE=1 pnpm build` — `tsc -b` and Vite build succeeded (large-chunk advisory). `design-lint.py` — 0 errors, 7 existing index-key warnings. `git diff --check` passed.
- Product change commit: `0b0fef2552161bf8cda56bc587d17b9c75005a07`, owning only the four reverse UI files listed above. This integration record is updated in a follow-up documentation commit; the branch's final full SHA is available via `git rev-parse HEAD`.
- Browser rendering, operational UI/API E2E, and actual ReverseJob E2E remain unverified. The independent c315 audit remains separate and was not repeated. Push, deployment, backend and main/original/audit worktrees were not changed.

## 0b0fef PNG 검산·회차 캐시 교정

- 고정 감사의 4096바이트 유효 PNG를 테스트 fixture 두 개로 보존했다. 파일 SHA는 `a3d513e8…f1d955`와 `15b951ed…e97c49`; 실제 전체 바이트 SHA-256을 계산해 비교한다. PNG signature·크기만 같은 변조 응답은 거부하고, Web Crypto를 쓸 수 없거나 digest가 실패해도 오류로 표시한다.
- 캡처 상태 식별자에 작업, workspace, output 경로, 구현/verifier 역할 세션, 비교 run, PNG 참조를 포함한다. 동일 상대 경로에서도 SHA 변경과 새 run을 각각 전환해 URL·오류·loading 초기화, 늦은 이전 응답 폐기, object URL 해제를 회귀 검사한다. 요청 실패 후 재시도와 구현/verifier 세션 분리도 포함한다.
- TDD RED: `pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot -t '4096바이트|새 회차'` — 두 반례 실패(변조 거부 알림 없음, 회차 URL 해제 없음). GREEN: `pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot` — 31 passed. `pnpm build` — `tsc -b`, Vite build 성공(기존 500 kB chunk advisory).
- 제품 수정은 `src/features/reverse/Reconstruction.tsx`, 회귀·실제 PNG 바이트는 `src/pages/ReversePage.test.tsx`와 `src/features/reverse/test-fixtures/`, 이 기록만 소유한다. 운영 artifact/API, 브라우저 및 ReverseJob 동작은 미검증이며 push·배포하지 않았다.

## 56dd StrictMode 캡처 수명 교정

- `CapturePair`의 effect setup마다 mounted flag를 true로 복원하고, 실제 cleanup은 false 설정·소유 object URL 해제를 유지한다. 이전 SHA 검산, 증거 identity 및 늦은 응답 guard는 그대로 보존했다.
- RED: `pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot -t 'StrictMode'` — 일치 SHA PNG 미표시와 변조 SHA 오류 누락으로 `2 failed`. GREEN: `pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot` — `32 passed`. StrictMode content 오류 뒤 재시도 검사도 통과했다.
- `pnpm build` — `tsc -b`와 Vite production build 성공(기존 대용량 chunk advisory). 확인된 결함은 개발 StrictMode의 effect replay 수명 문제다. 운영 빌드의 브라우저 preview 동작은 이 빌드 결과만으로 검증하지 않았으며 실제 API/ReverseJob E2E도 미검증이다.

## 2026-11-07 최신 main 통합 및 게시

- 시작 전 지정 격리 worktree `integrate/reverse-ui-20261107`는 clean이었고 HEAD는 `a9fe03d809f504282c6f7db9b4e21c83f6508b81`였다. 당시 참고 ahead 10 / behind 32. `GH_TOKEN` per-command `winterholic` 인증으로 `git fetch origin main` 실행, fetch 시점 origin/main은 `a3b2b51ee88e1c37a0a44f60e8eac3cfdf8ed71d`.
- origin의 최신 제품 변경을 merge-base `a86544548c006c41bb4a9a49ab0cd0ab8a09713e` 기준으로 살폈다. 이번 원격 변경은 collector·creative 기능과 `/creative` route 이동 등이며 Reverse runtime (`src/features/reverse/Reconstruction.tsx`, ReversePage/detail·CSS·type·fixture), Reverse client 및 공용 UI 토큰/컴포넌트에는 merge-base 이후 원격 변경이 없었다. HEAD 기준 `git diff --name-only a865445..origin/main -- <Reverse/API/UI paths>` 결과는 비어 있었다. Reverse에 보이는 HEAD↔origin 간 큰 net 차이는 origin의 신규 Reverse 수정이 아니라 a9 branch가 main보다 앞서 가진 감사된 Reverse 구현이다.
- `git merge --no-edit origin/main`은 `ort`로 충돌 없이 완료했다. merge commit `c230eefeafccb53337c72f14e57b6a5729a0f679`, 부모 순서: `a9fe03d809f504282c6f7db9b4e21c83f6508b81`, `a3b2b51ee88e1c37a0a44f60e8eac3cfdf8ed71d`. `git diff --name-only HEAD^1 HEAD -- <Reverse/API/UI paths>` 결과가 비었고 해당 경로의 첫 부모 대비 tree가 동일하다. 따라서 독립 감사를 무효화할 Reverse/API/CSS/공용 UI 수정이나 충돌 처리는 없었다. remote main의 수집·창작 기능 변경은 유지됐다.
- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/pages/ReversePage.test.tsx --reporter=dot` → `1 passed`, `32 passed`; `TTAKKARI_NO_ENV_FILE=1 pnpm build` → `tsc -b`, Vite 3,111 modules 및 PWA 생성 성공. 기존 500 kB 이상 chunk advisory. `git diff --check HEAD^1 HEAD` 통과. 저장소 `package.json`에는 별도 pre-push script가 없고 Git common hooks의 pre-push도 없다. 로컬 표준 type/build 검증을 push gate로 사용한다.
- 독립 감사 재사용 범위: 감사 기준 a9와 merge tree의 Reverse/API/CSS/common UI 경로가 byte-for-byte 같아 일반 mount/StrictMode 4개 캡처, SHA 검산과 오류 502 재시도, SHA-only·Run-only identity 교체, stale content 폐기, 390/1280 폭 fixture 브라우저 증거를 그대로 재사용한다. 이번 main 변화는 Reverse 렌더 경로를 바꾸지 않아 추가 브라우저 캡처는 하지 않았다. 감사 문서/22개 audit-only 파일은 recheck worktree의 감사 commit `4e644d1`에 남겨 제품 변경에 섞지 않았다.
- 확인하지 않은 범위: 인증된 운영 API·운영 Reverse 화면·실제 ReverseJob E2E, DB, 전체 프론트 회귀. 독립 브라우저 fixture 증거는 실제 API/backend 검증이 아니다.
- 다음 게시 절차: 검증과 기록 commit 후 `git push origin HEAD:main` 정상 fast-forward를 실행하고, 응답 및 단회 GitHub/Vercel status 조회에서 해당 전체 SHA의 원격 main 수락과 배포 state를 확인한다. 기록 commit SHA, push 결과, 조회 시점 상태는 아래에 덧붙인다.

## 원격 main 추가 이동·최종 게이트

- 첫 merge 뒤 원격이 계속 이동해 normal fetch/merge를 두 번 더 했다. `950d1207e33a4bdcdb8d37d724162a12f52c19b0`까지의 creative 소스·fixture 변경은 `ort`로 충돌 없이 통합했고, merge `633c71e63eacd1030dca2317635b7c6bcfb90818`의 부모는 `c230eefeafccb53337c72f14e57b6a5729a0f679`와 `950d1207e33a4bdcdb8d37d724162a12f52c19b0`. 이어 원격 `67fead1fde53def22022f95a2e8ef087c736689c`의 creative release 문서 갱신만 충돌 없이 merge했다. 최종 준비 merge `b1f6bdedd28dbb2954dd1b69eb021bb55ef8ab2a` 부모는 `633c71e63eacd1030dca2317635b7c6bcfb90818`와 `67fead1fde53def22022f95a2e8ef087c736689c`.
- 두 후속 원격 이동은 각각 creative storyboarding 코드/테스트와 creative 문서만 변경했다. Reverse/API/common UI tree는 여전히 a9와 바이트 동일 (`git diff --quiet a9... HEAD` 종료 0). 그 뒤 focused Reverse fixture `32 passed`, 전체 `TTAKKARI_NO_ENV_FILE=1 pnpm test --run`은 `171 passed, 2 skipped` test files 및 `1688 passed, 10 skipped` tests, `TTAKKARI_NO_ENV_FILE=1 pnpm build`는 type check·Vite·PWA 생성 성공. 테스트 중 jsdom Canvas 미구현 메시지는 출력됐으나 suite exit 0. build에는 기존 500 kB chunk advisory.
- 추가 실행한 `TTAKKARI_NO_ENV_FILE=1 pnpm lint`는 exit 1: Reverse의 기존 warning 2개(`ownedUrls.current` cleanup, `items` useMemo dependency)와 remote-owned `src/pages/creative/StoryboardCreateFlow.tsx:100`의 `react-hooks/set-state-in-effect` error 1개. 이 creative 파일은 `origin/main`과 동일하고 이번 요청은 Reverse 통합이므로 수정하지 않았다. repo `package.json` 별도 push script와 Git pre-push hook은 없고, GitHub main protection 조회는 `Branch not protected`(HTTP 404)였다. 정상 push 자체는 생략 게이트가 아니라 기존 무보호 main fast-forward 경로다.
- 기존 독립 UI 감사를 그대로 재사용할 수 있는지 최종 tree를 다시 대조했다. `Reconstruction`, Reverse 페이지/detail/test/CSS, Reverse API type/client 및 `src/ui`·공용 vendor tree가 a9와 동일해 fixture 브라우저 4장과 SHA/502·재시도·identity 전환/stale response·390/1280 관찰은 그대로 유효하다. 실제 운영 API/ReverseJob E2E와 운영 화면은 미검증이다.
- 감사 22개 파일은 독립 recheck worktree에만 유지되고 이 통합에 포함되지 않았다. 원문: `front-reverse-ui-recheck-a9fe03d8-20261107/docs/reverse-platform/audit-front-a9fe03d8-20261107/`; 감사 commit `4e644d1`.
- 마지막 `git fetch origin main` 뒤 준비 당시 origin/main은 `67fead1...`, 통합 HEAD는 `b1f6bed...`였다. 아래 push 이후 원격 SHA와 단회 Vercel status 결과를 이어 기록한다. 이전 main `950d120...`의 GitHub Vercel status `success / Deployment has completed`는 확인했으나 이번 후보의 배포 결과 증거가 아니다.
- 저장소 및 상위 경로에 적용되는 `AGENTS.md`는 발견되지 않았다.

## 최초 main 게시 확인

- 최종 통합 tree를 `GH_TOKEN` per-command `winterholic`으로 `git push origin HEAD:main` 했고 GitHub 응답은 `67fead1..6938e1c HEAD -> main`이었다. 즉 fast-forward push 수락.
- 이어 `git fetch origin main` 후 `HEAD`와 `origin/main` 모두 `6938e1c1ee61ab6b42660da7ffcef59527837f41`, worktree clean이었다.
- 해당 전체 SHA의 단회 GitHub commit status 조회는 `Vercel: pending`, description `Vercel is deploying your app`와 deployment URL `https://vercel.com/winterholics-projects/ttakkari/BxktHmUhxoSmLTigkGRRDbSUsW7U`를 반환했다. 동일 SHA deployments 목록은 빈 배열이었다. 지시대로 상태를 다시 폴링하지 않았으므로 이 기록 시점의 Vercel 성공·production 반영은 미확인이다. 운영 revision과 화면도 미관찰.
