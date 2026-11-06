# 독립 검증 감사 — 검토·품질·운영

> 아래의 기존 감사 본문은 교정 전 기록을 보존한다. 2026-11-07 01:30 KST에 `3b3e76476c612fee14c989ac1b4f1aa9ea3b08f6` 기준 독립 재검증을 추가했으며, 현재 상태는 마지막 절을 따른다.

## 실행 범위와 환경

- 프로필 출처 구분: 기획이 ownerAPI `e05693f5`에서 최초 감사 Run.profile을 **ai2**로 확인했다고 사용자에게 보고받았다. 이 검증자는 해당 ownerAPI를 직접 조회하지 않았다. 실행 컨텍스트는 Codex였으며, 이를 최초 Run.profile과 혼동하지 않는다.
- 기준 커밋: `e2d89e6`; 기존 비교 대상: `4a62ca0`, `4020828`; 최신 보정 대상: `9e71bd1`, 문서 `0b28512`(checkout HEAD).
- 운영 읽기 관측: 2026-11-07 00:41–00:44 KST (2026-11-06 15:41–15:44 UTC), 추가 `/missions` 관측 00:48–00:49 KST. `CollectPage`가 `Overview`/`Review`에 scope를 전달하지 않아 같은 기본 scope로 경로를 조회했다. 작업 중 다른 검증자의 `baseline-contract.md`가 뒤늦게 나타났으며 그 운영 읽기 시각은 00:45:30 KST다. 거기에는 `/review` total 2310·audit 468건, 이 감사 호출에는 2309·464건으로 기록되어 시간 사이 데이터 변동이 있다. 두 문서는 각 관측값을 별도 유지한다.
- 운영 요청은 `ttk get`만 사용했다. 재처리·검토·적재·학습·자동 수집 일시정지/재개·출처 추가 같은 쓰기 요청은 보내지 않았다.
- 이 검증자는 독립 감사 문서와 mock 결함 재현 테스트를 작성했으나, 테스트 파일은 이후 교정자 `30d9b585-a5fc-4f23-a901-15496c99c926`에게 소유권을 이양했다. 이 시점부터 테스트 파일을 편집·실행하지 않는다. 제품 파일은 수정하지 않았다. 미추적 스크린샷은 열거나 수정하지 않았고 `manifest.md`만 경로 목록 확인을 위해 읽었다.

## 기능 보존 비교

| 기능 | 판정 | 근거와 제한 |
|---|---|---|
| 검토 큐·필터·페이지 | **부분** | 검색/사유/출처/조치 필터, 현재 불러온 범위와 서버 전체 총량 분리, 다음 페이지 진입을 유지한다. 로컬 mock 테스트도 loaded-range 필터를 확인한다. 다만 실응답 `accepted + can_reprocess=true` 행이 “재처리 가능” 필터에 들어가면서 실제 행에는 재처리 버튼이 없다(아래 결함 1). |
| 보류 표본 감사 | **pass** | 날짜·그룹 총량·표본 상한과 항목을 표시하고 승인/일괄 통과 문구를 두지 않는다. 실응답 345개 그룹, 총 464개 표본 행을 읽었다. mock 테스트도 모수 표시를 확인한다. |
| 재처리 및 정책 차단 가드 | **부분** | 일반 held 재처리의 mock 대기/성공/실패와 정책 사유가 있는 행의 버튼 숨김은 기존 테스트에서 확인됐다. 이번 독립 테스트는 실응답 모양의 accepted 경계도 재현했다. 운영 재처리 요청은 금지되어 미실행이다. |
| ItemReview·적재 | **mock pass** | 기존 16개 검증 기록의 ItemReview mock 테스트는 이유 입력 요구, review API 호출, accept 뒤 import API 호출을 다룬다. 이번 검증에서 해당 기록을 재실행하지 않았다. 실제 운영 쓰기는 미실행이다. |
| 품질 패널·학습 | **부분 / 코드 보존 pass** | `Quality.tsx`와 `collector.ts`는 두 대상 커밋에서 변경되지 않았다. 앞선 mock 테스트 기록은 QualityPanel 자체를 렌더하지 않아 학습 요청 동작은 이 감사에서 검증하지 않았다. 실 item detail에서는 6개 품질 항목의 `measured`/`unmeasured` 상태가 있지만 모든 score가 null이었다. 값은 출력하지 않았다. |
| 자동 수집·운영 현황 | **부분** | pause/resume·runtime 오류·대기 작업·예산·예시 출처 기능은 Overview 코드와 기존 mock 테스트 기록에서 보존됐다. 실제 summary 응답의 `awaiting_review=2309`, `blocked=338`, `failed=647`, `awaiting_delivery=3`와 Review 총량 2309가 관측 시각에 일치했다. 운영 상태 변경은 미실행이다. |
| 출처 동선 | **pass (변경 파일 범위)** | 두 대상 커밋의 변경 파일 목록에는 출처 관리 화면/API가 없다. 별도 IA 작업자가 편집 중인 페이지·CSS는 소유권 때문에 변경/검증하지 않았다. |
| 중복 근거·Item detail | **fail** | 실 detail 응답은 `dedupe` 객체를 제공하지만 새 화면의 기술 상세 JSON은 이를 제외하면서 “중복 근거는 기술 상세에서 확인”이라고 안내한다(결함 2). 일부 `accepted` 상세는 `decision` 필드가 빠졌지만 top-level `status`와 reason code는 있다. 이때 UI는 “판정 정보 없음”으로 표시한다(결함 3). |
| ResearchPanel | **fail (최신 커밋 대조)** | `mission.triage.precise_eval` 실제 값을 받는 화면인데 엔진·상태·대기 건수가 응답에 없다고 고정 표시한다. 첫 페이지 임무 20개와 detail 읽기에서 필드를 확인했다(아래 결함 4). UI 브라우저 검증은 미실행이다. |

## 실제 서버 계약 관측

첫 코드/증거 탐색 당시 `baseline-contract.md`는 없었다. 작업 중 00:46 KST에 해당 파일이 생긴 것을 확인해 읽었다. 그 파일은 같은 owner-authenticated `ttk` API에서 00:45:30 KST에 받은 데이터를 보존하지만 serving revision은 미확인이라고 명시한다. 이번 mission 호출도 동일 owner-authenticated `ttk` 경로의 응답이며, 특정 backend serving revision에 귀속할 수는 없다. 정확한 경로는 `src/api/collector.ts`/`src/api/collectionMissions.ts`에서 확인했고, 이번 응답 본문은 개인정보·미리보기·ID·URL을 출력하지 않도록 제한해 집계와 키만 기록했다.

| 읽기 전용 경로 | 관측 결과 |
|---|---|
| `GET /api/assistant/collect/summary` | 키 `funnel/jobs/outbox/waiting/runtime/budget`; 관측 funnel 총량: awaiting_review 2309, blocked 338, failed 647, awaiting_delivery 3. 서버 응답에 집계 시각은 없었다. |
| `GET /api/assistant/collect/review?offset=0` | total 2309, limit 20, offset 0, returned 20. 최초 응답에서 accepted 3, held 17, `can_reprocess=true` 20, policy-code row 0. 이후 요청에서는 페이지 구성이 달라져 이 행 구성을 고정된 스냅샷으로 보지 않았다. |
| `GET /api/assistant/collect/review/audit?per_group=2` | day `2026-11-07`, per_group 2, 345 groups, 464 sample rows; 그룹 held 합계 2171, sampled 합계 464. summary held 2182와 11건 차이는 응답만으로 원인을 설명할 수 없어 **unverified**. |
| `GET /api/assistant/collect/items/{id}` | 첫 번째 읽은 accepted 항목에는 detail keys에 `dedupe`, `quality`, status, reason_codes가 있었고 `decision` key는 없었다. 별도 held/duplicate 응답에는 dedupe의 5개 키 중 4개가 null이 아니었다. 실제 ID/URL/필드 값은 저장하지 않았다. |
| `GET /api/assistant/collect/missions` | 추가 관측 00:48–00:49 KST. offset 0, limit 20, returned 20, `has_more=true`; 20/20에 `triage.precise_eval`가 있었다. `engine`은 모두 `unavailable`; pending은 13개 0, 7개 양수(관측 범위 25–1353); processing과 unresolved는 20/20 모두 0이었다. 목록은 전체 임무가 아니라 첫 20개다. |
| `GET /api/assistant/collect/missions/{id}` | pending 양수인 임무 하나를 목록 응답에서 선택해 읽었다. detail에도 precise_eval가 있고 관측값은 engine `unavailable`, pending 176, processing 0, unresolved 0이었다. 임무 식별자·제목·목표는 기록하지 않았다. |

`ttk get` 결과의 관측 시각은 응답 자체의 `as_of`가 아니라 실행 시각이다. 여러 호출 사이에 review 첫 페이지 구성이 달라져 summary와 큐 응답을 동일 DB 스냅샷으로 간주하지 않았다.

## 재현 결함

### 1. “재처리 가능” 필터에 버튼 없는 accepted 행 포함 — 중간

- **조건:** `status === "accepted" && can_reprocess === true &&` 정책/권리 차단 사유 없음.
- **근거:** 실제 첫 페이지에서 accepted 3행 모두 재처리 가능 플래그가 참이었다. `Review.tsx` 필터는 `can_reprocess`와 정책 가드만 보지만 실제 버튼은 `status === "held"`까지 요구한다.
- **재현:** 당시 `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/ReviewIndependentAudit.test.tsx --reporter=dot` 실행에서 3개 테스트가 통과했다. 이는 결함 동작을 기대값으로 둔 재현 하네스의 통과이지 제품 정상 통과가 아니다. 기획은 소유권 이양 뒤 같은 파일을 직접 실행해 2 tests passed로 보고했고, 그 역시 버그 존재를 재현한 결과로 해석한다.
- **영향:** 사용자는 “재처리 가능” 필터 결과를 실제 실행 가능한 항목으로 오해할 수 있다.
- **수정 주체:** 제품 UI 소유자. 독립 감사자는 제품 파일을 수정하지 않았다.

### 2. `dedupe` 실제 응답을 기술 상세에서 버림 — 중간

- **조건:** 중복 reason을 가진 review row를 열어 item detail을 확인.
- **근거:** 실제 detail 응답에는 `dedupe` 키(`algorithm_version`, `canonical_candidate`, `canonical_status`, `cluster_id`, `exact_of`)가 있고 duplicate reason 응답은 이 중 4개가 null이 아니었다. `Review.tsx`의 기술 JSON과 `CollectItemDetail` 타입에는 `dedupe`가 없다. 반면 row 문구는 “중복 근거는 기술 상세에서 확인”이라고 한다.
- **재현:** `ttk get /api/assistant/collect/review?offset=0` 응답에서 duplicate reason row를 선택한 뒤 `ttk get /api/assistant/collect/items/{id}`로 읽었다(동일 출처 값은 출력하지 않음). 정적 대조: `rg -n "DUPLICATE_REASON|dedupe|기술 상세" src/features/collector/Review.tsx src/api/collector.ts` — UI는 dedupe를 참조하지 않고 안내 문구만 확인됨.
- **영향:** 중복 관계를 확인하려는 검토자가 서버가 제공한 근거를 화면에서 볼 수 없다. 문구가 현재 화면의 실제 제공 범위를 과장한다.
- **수정 주체:** API 타입 및 Review detail 화면 소유자.

### 3. `decision` 생략 응답에서 판정 상태를 놓침 — 낮음~중간

- **조건:** item detail에 top-level status/reason_codes가 있고 `decision` 키가 생략됨.
- **근거:** 실제 accepted detail에서 decision key가 없고 status/reason_codes는 존재했다. `Detail`은 `d.decision`만 판정 라벨에 사용해 “판정 정보 없음”으로 표시한다.
- **재현:** 당시 좁은 Vitest 실행의 두 번째 테스트가 `decision`을 뺀 서버 응답 모양에서 “판정 정보 없음” 렌더링을 확인했다. 이 테스트 파일의 현재 내용은 교정자 소유이며 확인/수정하지 않았다.
- **영향:** 이미 제공된 상태·사유를 사용자가 판정 정보 없음으로 받아들일 수 있다.
- **수정 주체:** Review detail 화면/API 계약 소유자.

### 4. ResearchPanel이 mission 정밀 판정 응답을 숨김 — 중간

- **조건:** `ResearchPanel`에 `triage.precise_eval`이 포함된 `CollectionMission` 전달.
- **근거:** `collectionMissions.ts` 타입은 `engine`, `pending`, `processing`, `unresolved`를 정의한다. 실제 `/missions` 첫 페이지 20개 모두 해당 객체를 제공했고, 7개 임무에서 pending이 양수였다. 선택한 detail도 pending 176, processing 0, unresolved 0, engine `unavailable`를 제공했다.
- **UI 동작:** `ResearchPanel.tsx`는 `mission.triage`를 읽지 않고 “조사 응답에 없음 · 미확인”, “정밀 평가 대기 건수도 제공되지 않음”을 고정 출력한다. `9e71bd1`에서 해당 문구가 추가됐고 `0b28512` 문서도 이를 미제공으로 기록했다.
- **재현:** 당시 세 번째 mock 테스트에 engine/pending/processing/unresolved를 넣어도 정적 미제공 문구만 보이는 동작을 확인했다. 기획이 보고한 2-test 실행에는 이 추가 사례가 포함됐는지 확인하지 않았다. 테스트 파일은 교정자 소유로 이양됐으므로 여기서 재실행하지 않는다. 실제 응답은 `ttk get /api/assistant/collect/missions`, 이어서 선택 임무의 `/missions/{id}` 읽기로 확인.
- **영향:** 임무 단위 pending과 서버가 보고한 engine 값을 검토자가 볼 수 없다. 관측 범위에서 engine 값은 실제 엔진명이 아니라 `unavailable`였으므로 이를 실제 엔진 식별자로 바꾸어 말하면 안 된다. 모델명과 별도 run-state 필드는 타입에 없으며 계속 미확인으로 표현해야 한다.
- **수정 주체:** `30d9b585-a5fc-4f23-a901-15496c99c926` (사용자 지정). 제품 파일은 수정하지 않았다.

교정자는 Review.tsx, 선택적 `dedupe`/`decision` API 타입, 관련 테스트를 소유한다. 결함 1–4의 정상 기대값 교정과 다음 페이지 실패/재시도 반례 보강은 이양된 작업이며, 교정 보고 후 별도 독립 재검증을 기다린다. 이 문서는 그 결과를 선취해 완료 처리하지 않는다.

Review/Overview가 소비하는 `/review`, `/items/{id}`, `/summary` 응답에는 mission `triage.precise_eval`이 없으므로 해당 컴포넌트에서 모르는 것은 맞다. 다만 문구는 전체 API가 아니라 각 화면이 읽은 응답 범위의 미제공임을 분명히 해야 한다. mission별 pending을 합산해 global Review/Overview 숫자로 전용하는 것은 근거가 없다.

## 범위 밖 값·실패 경계

- **검색/필터 로딩 범위:** 명시적으로 현재 로드 항목에 한정된다고 표시한다. 실제 기본 페이지는 20/2309였으므로 전체 큐 검색으로 오해할 수 있는 문구는 보이지 않았다.
- **정책 차단 가드:** 로컬 테스트는 `store_not_permitted` + `can_reprocess=true`에서 버튼 숨김을 확인했다. 운영 변경 요청으로 우회 테스트하지 않았다. 클라이언트 사유 문자열 정규식이 서버 정책의 authoritative 계약이라는 점은 확인되지 않았다.
- **0/미제공 값:** 실제 item detail의 여섯 quality score는 모두 null이었다. 정밀 판정의 경우 Review/Overview가 소비하는 summary·review 계약에는 해당 필드가 없지만 mission 계약에는 `triage.precise_eval` 값이 제공된다. 별도 model 이름·run-state 식별자는 미제공이다. `teacher_enabled`를 운영 엔진의 근거로 쓰지 않는 문구는 그대로 유지된다.
- **중복/불확실성 과장:** 목록 `signals`를 자동 점수나 불확실성으로 읽지 않는다. 다만 실제 `dedupe` 근거가 기술 상세에서 누락되는 결함 2가 있다.
- **다음 페이지 실패:** 코드에는 보유 페이지가 있을 때 별도 오류를 표시하고 재시도 버튼을 유지하지만, 이 감사에서 실패 응답 mock은 새로 만들지 않아 **unverified**다.
- **경계 입력:** 빈 첫 페이지/전체 0, 잘못된 offset/중복 페이지 응답의 새 반례는 만들지 않았다. 기존 테스트를 반복하지 않았다.
- **실제 mutation 검증:** review/import/reprocess/train/runtime/pilot mutation은 mock 근거만 인용했다. 이 감사에서 운영 API 호출은 전혀 하지 않았다.
- **브라우저·화면·반응형·시각 품질:** **미실행** — 지정된 브라우저는 다른 검증자가 단독 소유 중이고, 이 감사 범위는 브라우저를 사용하지 않는다.

## 실행 증거와 미실행

- `ttk --help` — `ttk get|post|patch|delete <경로> [JSON본문]` 확인.
- `ttk get /api/assistant/collect/summary` — 제한 출력으로 응답 키와 집계를 확인.
- `ttk get '/api/assistant/collect/review?offset=0'` — 제한 출력으로 total/limit/offset/개수/상태 개수를 확인.
- `ttk get '/api/assistant/collect/review/audit?per_group=2'` — 제한 출력으로 날짜·그룹·표본 집계를 확인.
- `ttk get /api/assistant/collect/missions` 및 선택 임무의 `/api/assistant/collect/missions/{id}` — 20개 임무 첫 페이지 및 detail에서 `triage.precise_eval` 필드 확인.
- 당시 `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/ReviewIndependentAudit.test.tsx --reporter=dot` — 1 file, 3 tests passed. 모두 버그를 기대한 재현 테스트로 제품 통과가 아니다. 교정자 이양 후 기획의 직접 실행은 2 tests passed였으며 같은 의미로 해석한다.
- 당시 재현 테스트 첫 시도는 helper가 `ResearchPanel` 대신 `Review`를 렌더해 실패, 두 번째는 예상 문구 불일치로 실패했다. helper/matcher 수정 후 3개 재현 테스트가 통과했다. 현 소유 테스트 파일은 편집·재실행하지 않는다.
- `git diff --check e2d89e6..HEAD -- src/features/collector/Review.tsx src/features/collector/Overview.tsx src/features/collector/ResearchPanel.tsx src/api/collector.ts src/features/kb/Quality.tsx` — 오류 출력 없음.
- 하지 않음: 이전 16개 테스트 재실행 — 이번 반례와 별도인 과거 실행 로그가 `review-implementation.md`에 있고 지시에서 불필요한 반복을 금했다.
- 하지 않음: 다음 페이지 실패/재시도와 빈 페이지·잘못된 offset·중복 페이지 등 경계 입력 재검증 — 교정자 소유의 다음 작업으로 이양됐으며 독립 재검증을 기다린다.
- 하지 않음: 실제 review/import/reprocess/train/runtime/pilot 쓰기 API — 운영 데이터 변경 금지.
- 하지 않음: 브라우저·반응형·시각 감사 — 지정 브라우저 단독 소유자 `a78459aa`의 범위.

## 2026-11-07 01:30 KST — 교정 커밋 독립 재검증

### 대상·판정

- 검증 대상 HEAD: `3b3e76476c612fee14c989ac1b4f1aa9ea3b08f6`; 제품 교정: `4450dac805bc3557bc57bd8093abdd50e8dec06a`; 문서 커밋 `3b3e764`는 `4450dac`의 직계 자식이다. `4450dac`은 수집 API 타입, Review/Missions/ResearchPanel/Overview 및 전용 테스트/CSS 총 11파일(193 insertions, 39 deletions)을 바꾸고, `3b3e764`는 통합 교정 기록 1파일(34행)을 추가했다.
- 새로 확인한 결함 2건 때문에 전체 R1–R10의 완료·게시 가능 판정은 보류다. 제품 코드/기존 테스트는 고치지 않았다. 변경한 것은 본 감사 문서와 전용 경계 검증 테스트 및 읽기 전용 GET 검증 스크립트뿐이다.
- 실제 증거와 mock 증거는 분리했다. GET은 owner-authenticated `ttk get`만 사용했고 GET 외 요청은 보내지 않았다. 테스트는 mock 응답만 사용했다. 브라우저, 운영 쓰기, push, merge, 배포는 실행하지 않았다.

### 실제 GET·계약 대조

- Owner `runtime_report` 응답 시각 `2026-11-06T16:25:46.635907Z`에 active generation의 serving revision은 `5f5cbd997addcb4ea084ab908790f8f6eec54122`로 관측됐다. `ttk get` 관측은 `2026-11-06T16:30:59.517648Z`(01:30:59.517 KST)다. 이전 baseline 시각의 revision으로 소급하지 않는다.
- `python3 docs/collect-workspace/evidence/verify_live_contract.py` (exit 0): 실제 review 첫 페이지에서 20행, accepted+can_reprocess 4, held+can_reprocess 16. 현재 mission 첫 페이지 20/20에 `triage.precise_eval`이 있었고 engine 값은 모두 `unavailable`; pending 0은 13, processing 0과 unresolved 0은 각각 20이었다. 선택 detail도 `unavailable, 0, 0, 0`을 제공했다. summary 키는 `budget,funnel,jobs,outbox,runtime,waiting`으로 정밀 집계 키가 없다. 응답 사이의 동시 변동 때문에 이 수치를 한 DB snapshot으로 간주하지 않는다.
- 기존 비식별 `evidence/replay-fixture.json`의 구형 mission 21건은 모두 `counts.precise_waiting` 및 `counts.precise_unresolved`를 제공하고 `triage.precise_eval`은 없다. waiting은 14건 0, 7건 양수(최대 1,353); unresolved는 21건 모두 0이다. 현재 `Missions.tsx`의 `preciseQueue`와 `ResearchPanel.tsx`는 triage만 읽으므로 제공된 구형 값은 화면에서 모두 `미확인`으로 떨어진다. 전용 재현 테스트도 이를 보였다. **결함 A — 낮음~중간:** 저장된 구형 임무에서 정밀 대기/미해결 수가 숨겨지고 0과 미제공이 같아 보인다. 다만 triage가 값 0을 명시하면 `providedCount`와 `PreciseNotice`가 `0건`으로 표시하며, 값 누락은 `미확인`/행 미표시로 구분한다.
- 실제 Review GET의 accepted+can_reprocess 4건과 held+can_reprocess 16건은 필터·버튼 공통 `canReprocessItem` 조건(held, flag true, 정책 사유 없음)과 일치한다. 정책 차단 사유가 있는 mock 행에서는 버튼이 숨겨지는 기존 테스트가 있다. 이번 GET 첫 페이지에는 policy+can 조합이 없으므로 그 경계의 운영 데이터 확인은 미실행이다.
- 실제 detail `dedupe`의 다섯 필드는 `exact_of:string`, `cluster_id:null`, `canonical_candidate:string`, `canonical_status:string`, `algorithm_version:string` 모양이었다. 지정 백엔드 source `5f5cbd9`의 `collector/pipeline.py`에서 `exact_of`는 exact match의 item id, `cluster_id`는 중복 묶음 id, `canonical_candidate`는 근접 후보(없으면 exact)의 envelope/item id, `canonical_status`는 후보 상태(`unreviewed`로 생성), `algorithm_version`은 dedupe 구현 버전임을 확인했다. Review 행은 `exact_of`를 관계 대상으로 보이고, 펼친 기술 상세는 다섯 필드 모두 JSON으로 출력한다.
- **결함 B — 낮음, 계약 정확성:** `src/api/collector.ts`의 `CollectDedupe.canonical_candidate`는 `boolean | null`로 선언되어 있으나 실제 GET 및 백엔드 구현은 식별자 문자열 또는 null이다. 교정자가 새로 추가한 `ReviewWorkspace.test.tsx` fixture도 `false`를 사용해 계약 반례를 놓친다. 현재 기술 상세 JSON은 런타임 string을 그대로 보여 기능상 소실은 없지만, 타입을 소비하는 코드는 boolean으로 오인할 수 있다. 이번 수정 범위 제한으로 제품 타입과 기존 테스트는 바꾸지 않았다.
- decision 누락 시 최상위 `status/reason_codes` fallback을 적용한 코드를 확인했고, 새 mock 테스트는 이 입력을 재현한다. 제공 시 우선순위도 상충 fixture(`decision=reject`, top-level `status=accepted`)로 확인해 상세 화면이 decision을 표시했다. 실제 현재 GET detail은 decision/status/reason_codes를 모두 제공했으므로 누락/상충은 mock 전용 경계다.
- `unavailable`은 화면에서 “사용 불가” 가용 상태로 번역되고, 실제 엔진명·모델명과 분리된다. 현재 GET에도 모델명 필드는 없었다. 새 mock 테스트는 `unavailable` 문자열이 사용자 문구에 노출되지 않고 모델명/실행 상태가 미확인임을 확인했다. 알려진 실제 엔진명은 이번 응답에서 관측하지 않았다.

### 페이지 오류·기존 기능·검증 증거

- 다음 페이지 실패 → 기존 목록과 출처 필터 보존 → 재시도 버튼 → 다음 페이지 추가 흐름은 `ReviewWorkspace.test.tsx`의 전용 테스트가 다룬다. 교정자의 동일 revision 명령 결과(아래)는 6 files / 38 tests passed였으므로 재실행하지 않았다.
- 기존 pause 요청, `ItemReview`의 이유 필수·검토 후 적재 요청, 표본 감사의 그룹/표본 모수는 수정 전후 diff와 `Collector.test.tsx`·`ReviewWorkspace.test.tsx` 테스트로 보존을 확인했다. 이들 mock mutation은 브라우저·운영 변경 증거가 아니다. 해당 테스트도 유효한 38-test 결과에 포함된다.
- 자체 독립 명령 `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx --reporter=dot` — exit 0, 1 file / 3 tests passed. 테스트는 (1) counts-only legacy 값이 무시되는 결함 재현, (2) triage zero/unavailable 상태 구분, (3) 실제 string `canonical_candidate` 출력 및 decision 우선순위를 확인한다. 첫 실행은 detail lazy query가 준비되기 전 잘못된 기술 상세 selector로 1개 실패했고, detail 판정 문구를 기다리도록 검증 파일만 고친 뒤 재실행했다.
- 새 검증 파일 ESLint: `pnpm exec eslint src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx` — exit 0, 출력 없음. `node scripts/ui-lint.mjs` — exit 0, `ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음)`.
- 전체 build `TTAKKARI_NO_ENV_FILE=1 pnpm build` — exit 0; `tsc -b && vite build`, 3,104 modules transformed, PWA 95 entries generated. Vite는 500KB 초과 chunk 경고(최대 main JS 857.65 kB)를 출력했으나 build는 성공했다.
- 교정자 기존 결과 재사용: `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/features/collector/Missions.test.tsx src/features/collector/missionProjects.test.ts src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx --reporter=dot` — 6 files passed, 38 tests passed. 변경 TS/TSX 10개 ESLint exit 0; ui-lint 위반 138/기준선 138; `git diff --check` 출력 없음, exit 0. 동일 revision의 유효 결과라 재실행하지 않았다.
- 하지 않음: 기존 38개 테스트·교정 파일 ESLint 재실행 — 같은 revision의 유효한 결과를 재사용했고 변경 파일이 없다. 이번 전용 테스트만 새 lint를 실행했다.
- 하지 않음: 운영 POST/PUT/PATCH/DELETE, DB·queue 조작 — 금지 조건. GET 외 운영 변경은 0건.
- 하지 않음: 브라우저 — 단독 소유자 `b91696c3`가 진행 중이었다. 화면·반응형 확인은 그 결과에 남긴다.

### 게시 절차 및 선행 조건

- 저장소 안에서 `AGENTS.md`, `CLAUDE.md`, `.github/workflows/*` 및 별도 deploy script는 발견되지 않았다. `README.md`의 프론트 검증 명령은 `TTAKKARI_NO_ENV_FILE=1 pnpm build`; `vercel.json`은 Vite, `pnpm install --frozen-lockfile`, `pnpm build`, 산출 디렉터리 `dist`를 지정한다. 기존 Vercel Git 연동 기록에 따르면 GitHub `main` push가 production 배포를 자동 시작한다. 이 worktree의 remote는 `winterholic/winterholic-ttakkari-front`; 현재 브랜치는 main이 아니므로 교정 브랜치 직접 push는 게시 절차가 아니다.
- 게시 전 조건: R1–R10 결정을 완료 상태로 바꾸지 않은 채 사용자의 전체 완료 기준을 다시 대조하고, 결함 A/B를 별도 승인된 수정으로 해소·재검증하며, `b91696c3` 실화면 감사 결과를 통합한다. production Vercel `VITE_API_BASE` 설정 여부는 이 감사에서 확인하지 않았다. 정식 게시 경로는 검토된 변경만 main에 통합한 뒤 main push → Vercel production build/deploy 확인이다. 이번 작업은 main 통합/push·Vercel 호출·배포를 하지 않았다.

### 유지할 미완료 요구

- 전체 R1–R10은 여전히 review/pending이며 이 독립 감사만으로 전면 리팩터링 완료가 아니다.
- 실화면 desktop/mobile 조작·반응형·시각 검증은 `b91696c3` 소유라 미실행이다.
- 운영 mutation, 기존 기능의 실운영 전후 상태 보존, backend·queue·정책 통합 검증은 금지 범위라 미실행이다.
- 실제 GET decision 생략 및 충돌 우선순위, policy+can_reprocess 운영 조합은 관측하지 못해 mock 경계로만 확인했다.
- 게시 자체, Production Vercel env 확인, remote deployment 결과는 미실행이다.
