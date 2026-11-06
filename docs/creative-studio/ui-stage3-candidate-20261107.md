# Creative Studio Stage3 UI candidate (2026-11-07)

## 범위와 출처

- 기준 source/HEAD: `front-creative-production-20261107`, `31de7817313636331f9e414cb5400a2afa5baeb4`.
- 시작 시 기존 Creative UI WIP 6개 추적 파일(`src/App.tsx`, `src/api/creativeV2.ts`, `CreativePlanPage.tsx`, 해당 테스트, CSS, `vite.config.ts`)과 `docs/creative-studio/`의 기존 evidence/compatibility 문서를 확인하고 보존했다. 저장소/상위 작업 위치에서 `AGENTS.md`는 발견되지 않았다.
- 현재 Run은 `257a80aa-4399-4a99-a12d-02233088fd52`, profile `회사 코덱스 ai2 (ai2@hyperez.io)`로 확인했다.
- 읽기 전용 backend source: `docs/creative-studio/core-stage3-20261107.md` §5, `src/ttakkari/creative/v2/storyboard.py`, `storyboard_runs.py`, `src/ttakkari/api/creative_v2.py`의 `/storyboard/runs` route들.
- 직전 UI 근거는 [`ui-integration-evidence-20261107.md`](ui-integration-evidence-20261107.md), 최소 API/Stage2 호환 근거는 [`ui-core-compatibility-20261107.md`](ui-core-compatibility-20261107.md). 기존 Stage2 caption repair → `applied_needs_approval` → 별도 승인 → 원래 `caption_mode` dispatch/render, revision/result/SHA 링크의 제약은 이번 변경에서 완화하지 않았다.

## 변경한 기본 경로

- `/creative`와 `/creative/plan`의 첫 제작 동작을 `POST /api/creative/v2/storyboard/runs` (`engine: "codex"`)로 연결했다. 기존 `/plans` 직접 구조화 생성은 `구조화 계획 입력 (보조 경로)` 안에 남겼다.
- payload는 서버 schema에 맞춰 `brief`, `sources`, `engine`만 보낸다. 기본 source는 locator가 `사용자 요청`인 brief 원문이다. 고급 펼침에서 사용자가 직접 적은 source 본문/locator만 추가하며 자동 검색은 하지 않는다. `model`은 생략한다. duration, aspect, attachment, quality objective는 request에 넣지 않았다.
- start의 `Idempotency-Key`는 같은 편집 내용의 네트워크/응답 재시도 동안 재사용한다. 입력이 바뀌면 새 key를 발급한다. resume도 별도 key를 만들어 해당 재시도에 유지한다.
- queued/running 상태를 1.5초 간격으로 읽고, `completed_needs_review`, `invalid_output`, failed/cancelled/interrupted를 서버 phase/status에서 구분한다. 취소는 서버에 요청하고 서버가 반환한 결과를 다시 읽는다. terminal 상태에서는 같은 storyboard context로 resume한다.
- 검토 화면은 서버 sources와 quote/application, summary, 장면, 초 단위 길이, 선택 전략·근거, shot action/layers/capabilities, 대안을 표시한다. source 본문을 전문가 검색 결과라고 부르지 않는다.
- 사용자가 출력 SHA 및 구성 검토를 체크하면 현재 `output_sha256`만 accept body의 `reviewed_output_sha256`로 전달한다. stale 409/422는 확인 체크를 해제하고 최신 결과를 다시 읽는다. accept 성공 후 미승인 plan 상세로 이동하며 이 경로에서 approve/dispatch/render는 호출하지 않는다.
- 신규 storyboard materialize 계획은 backend 고정 계약대로 16:9이고 모델 장면 길이 합만 표시한다. 원하는 길이를 보장한다고 하지 않는다. 상세의 렌더 안내는 v1 slideshow 단정 대신 서버가 현재 반환한 production engine/asset-generation engine을 보여준다.

## 검증 및 실패 교정

- TDD 첫 RED: 새 flow 테스트를 먼저 추가했고 첫 실행은 `Failed to resolve import "./StoryboardCreateFlow"`로 실패했다. 컴포넌트/API를 추가한 뒤 관련 테스트 묶음은 통과했다.
- 최종 관련 회귀: `pnpm exec vitest --run src/pages/creative/StoryboardCreateFlow.test.tsx src/pages/creative/CreativePlanPage.test.tsx src/pages/CreativePage.test.tsx --reporter=dot` → `Test Files 3 passed (3); Tests 39 passed (39)`. 기본 경로, 지원 request와 header, SHA accept, approve/render 미호출, stale SHA 재확인, 404/503 입력 보존, cancel/resume/invalid output, 기존 구조화 보조 경로 및 Stage2 page 동작을 포함한다.
- 타입: `pnpm exec tsc --noEmit` → exit 0, 진단 없음.
- 빌드: `pnpm build` → 최종 Vite build 완료(`✓ built in 325ms`, PWA 95 entries 생성). 기존 대형 bundle 경고(최대 index 857.77 kB 및 PDF worker 1,264.34 kB)는 남았다.
- diff 형식: `git diff --check` → exit 0.
- 승인된 `ttakkari_browser`는 Vite 화면의 임시 fixture entry에 연결했다. 최초 proxy 설정에서 브라우저가 `127.0.0.1:8787`을 직접 호출해 CORS preflight `ERR_FAILED`가 났다. 이는 fixture setup 실패였고 API POST가 전달되지 않았다. `VITE_API_BASE=`와 격리 fixture `127.0.0.1:8789` same-origin proxy로 다시 열어 이후 상호작용을 완료했다.
- Browser fixture 관측: start 202(queued) → GET running → GET completed_needs_review → SHA 체크 → `/accept` 200 → MemoryRouter의 미승인 plan 경로. 별도 fixture 입력에서 running → cancel 200 → cancelled → resume 202 → invalid_output과 schema error를 보였다. HTTP 404 fixture는 `이 서버에는 storyboard API가 배포되지 않았습니다 (HTTP 404)`를 표시하고 입력을 보존했다. Fixture 데이터는 실제 model/backend run이 아니다.
- fixture 캡처는 현 Run outbox에 공유했다: happy/review+accept `8a57be8f-0283-4b66-bd06-a2581456ed10`, cancel/resume/invalid `041b629e-0236-4d83-b468-9b47bf71fad1`, 404/input preservation `0d6e947b-803b-4fcd-a028-10507e31d09a`.

## 남은 범위

- 현재 deployed backend의 Stage3 API/authenticated UI 여정은 호출하지 않았다. 로컬 source의 신규 route와 404/503 fixture는 운영 배포 상태의 대체 증거가 아니다.
- 실제 모델 Run, accept된 실제 계획, approve/dispatch/render, 원격 consumer는 수행하지 않았다.
- 원격 source 소비, 첨부, 임의 품질 목표, 자연어 수정, 전체 복원, 독립 평가도 이 후보의 완료가 아니다.
- Stage2 QA fixture 계측/전체 화면 재계측은 반복하지 않았다. 기존 handoff evidence를 유지하고, 변경 페이지 테스트와 기존 Stage2 관련 테스트를 함께 실행했다.

## 최종 source fingerprint

`shasum -a 256`을 후보 고정 전 실행했다. 아래 파일은 후보 커밋의 추적 대상 코드이며, 이 문서 자체와 기존 Stage2 evidence 문서의 hash는 self-reference를 피하려고 생략했다.

| 파일 | SHA-256 |
|---|---|
| `src/App.tsx` | `3edb2d43b349b18b12769108b99f1a0776ce628bc3ce1b0ae43cc5dc1b360d51` |
| `src/api/creativeV2.ts` | `8ce76eb7aeb40d93482dc760b05c67ec848b90135a10b63d7b77203698b37c52` |
| `src/pages/creative/CreativePlanPage.tsx` | `9f90ee7a9745af45e7d8912d4ac63427e9145e4902d1945b21550a841458e781` |
| `src/pages/creative/CreativePlanPage.test.tsx` | `e080f95770a50813f680d92bb15b5b3b5700108f63e27182a19d204442a5d5c9` |
| `src/pages/creative/StoryboardCreateFlow.tsx` | `f4bb3cb7777515143715c0b3dd642f22bdef0e6dbcdf7f1ca136e1347025e701` |
| `src/pages/creative/StoryboardCreateFlow.test.tsx` | `fde74acaa7d7b8f56442e8c31fa0240beb410189185028fd816d6fd70e2daefd` |
| `src/pages/creative/creativePlan.css` | `a5e3b1264d2cd996a0a382a9550e86529baebe48351ff49bea043eb5d816aa76` |
| `vite.config.ts` | `9bfcf190e827c128907f3a1d712e0d4278151606370e089b48251dddb29dcde4` |
