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
