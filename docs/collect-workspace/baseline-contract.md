# 수집 작업공간 기준 계약 (2026-11-07)

## 기준과 안전 경계

- 프론트 기준: `/Users/winterholic/development/projects/winterholic-ttakkari/front-collect-workspace-20261107`, 요청된 기준 커밋 `e2d89e6`를 별도 detached checkout으로 분리함. 현재 구현 worktree는 다른 작업자의 dirty 변경이 있어 보존함.
- 백엔드 계약 기준: 작업 카드에서 지정한 commit `5f5cbd997addcb4ea084ab908790f8f6eec54122`의 object를 `git show <SHA>:<path>`로 읽음. 최종 확인 시 로컬 `back`의 `origin/main` ref는 `529022861120e86f80400ffaec53dd3f3f7f81c6`로 움직여 있었고, 작업 카드의 ref/SHA가 현재 checkout에서 일치하지 않음. ref·checkout·DB는 변경하지 않음.
- 운영 API 읽기 시각: `2026-11-06 15:45:30.683 UTC` (2026-11-07 00:45:30.683 KST), `ttk get` owner-authenticated 호출에서 200 응답. 지정 commit `5f5cbd997addcb4ea084ab908790f8f6eec54122`의 deploy reservation은 `testing`, 이전 revision `efe07c4b` reservation은 `succeeded`였다. 이 정보만으로 운영 API의 실제 serving generation을 단정할 수 없어 runtime revision은 미확인.
- 생산 데이터 호출은 `ttk get`만 사용. pause, retry, schedule, import, review, supplement 등 상태 변경 API는 호출하지 않음. 모든 재현 파일은 제목·목표·문맥·본문·URL을 제거하거나 대체함.

## 화면/호출 구조

`CollectPage`는 임무(`Missions`)를 1차 영역으로 놓고 운영/고급 설정을 접어 둔다. 상단 고급 탭은 현황, 출처, 실행, 검토, 품질·한도다. 공통 새로 읽기는 `kb-collect*`와 `collection-mission*` 쿼리를 무효화한다. 화면의 상세 링크/탭은 URL의 `mission`, `tab`, `view`를 사용한다.

| 화면/컴포넌트 | 읽기 호출 및 표시 | 쓰기 액션(계약만 확인, 이번 감사에서 미실행) |
|---|---|---|
| 임무 내역·계획·상세 — `Missions` | `GET /api/assistant/collect/missions`; 선택 시 `GET /missions/{id}`; 요약/대상/자료/과정/지시문은 trace 사용. 계획 미리보기는 별도 `/missions/plan` | create, extend(+1000 pages), rerun, pause/resume/cancel, schedule(15–43200분 또는 수동), supplement(미달 key 또는 전체), unhold |
| 진행 추적 — `MissionTrace` | `GET /missions/{id}/trace`를 5초마다 갱신. 요약, 부족 요구, 단계, 실패, 준수 규칙, 온톨로지, 대상별 자료, 등급/텍스트 필터, 이벤트 필터, discard 표본 | 부족한 요구만 보충; 처리 행위는 이 작업에서 실행 안 함 |
| 자동 조사 — `ResearchPanel` | detail의 plan/research: 범위, 조사 회차·검색 히스토리, paper 메타/라이선스, claim-context 관계·검증 표기 | 임무 생성/보충에 포함됨 |
| 현황 — `Overview` | `/summary`, `/runtime`; summary 10초 폴링. 집계 funnel, jobs/outbox, 대기 사유, 일시중지, 한도/예산 | runtime pause/resume, pilot source 등록(미실행) |
| 출처·자동·보충·주기 | `src/api/collector.ts`: `/sources`, `/jobs`, `/jobs/{id}/items`, `/deliveries`; mission schedule 및 supplement는 `collectionMissions.ts` | run/retry/cancel/import/reconcile 등은 미실행 |
| 검토 — `Review` | `/review` 페이지(50개까지, 무한 페이지), `/review/audit?per_group=2`, 펼친 항목의 `/items/{id}` | accept/reject/hold·reprocess는 API 계약만 확인, 미실행 |
| 품질·한도 | `/quality`, `/budgets`; 모델 성능/검토 수와 호출·토큰·비용 한도 | `/quality/train` 미실행 |
| 스타일 — `collector.css` | 화면 셸, 임무 목록/상세, 상세 탭, 진행/coverage/문서 목록, 필터 및 반응형 상태 규칙. 이 파일은 기준 checkout만 열람. | 제품 CSS 변경 없음 |

## 보존 체크리스트: 기존 기능 → 데이터 원장/읽기·쓰기 경로

| 사용 흐름 | 기존 호출/행위 | 리팩터링에서 보존할 데이터·계약 | 이번 감사의 접근/실행 |
|---|---|---|---|
| 수집 내역·상세·계획 미리보기 | `GET /missions`, `/missions/{id}`, `/missions/{id}/trace`, 계획 `POST /missions/plan` | mission ID, 제목/목표, status, plan, run_seq/history, counts, coverage, gaps, 결과 연결; 미리보기는 읽기성 계산이나 POST 계약 | 실제 mission/detail/trace GET 읽음; 계획 미리보기는 로컬 replay에서만 확인 |
| 자동 수집·실행 | `/sources`, `/jobs`, `/jobs/{id}/items`, `/deliveries`; 실행 시작은 기존 collector job | source key/권리·policy, job ID/status/cursor, item 상태, delivery outcome, 기존 collector 원장 | sources/jobs 응답 읽음; 실행·재시도·취소는 미실행 |
| 보충·재시도 | mission supplement, rerun/extend; `collection_mission_jobs.run_seq` 및 기존 job/item 연결 | 요구별 미달 coverage를 대상으로 새 run 추가, 이전 run 및 item/delivery 연결 유지, mission 전체 count의 의미 유지 | 상태/이력만 읽음; 보충·재시도 쓰기 미실행, 전후 보존은 검증 불가 |
| 검토·품질 | `/review`(50개 페이지), `/review/audit`, `/items/{id}`, `/quality`; review accept/reject/hold/reprocess, quality train | pending/held item, review decision/history, source policy, audit strata, 학습 승인·라벨 게이트 | review/audit/item/quality GET 읽음; 결정·재처리·학습 미실행 |
| 일시정지·주기 | `/runtime`; runtime pause/resume, mission schedule(15–43,200분 또는 manual) | paused state/reason/time, `plan.schedule`, schedule-trigger run history, 사용자 중지의 불변 조건 | runtime/mission schedule 읽음; pause/resume/schedule write 미실행 |
| 출처·권리 | `/sources`, source/policy/robots in trace; 파일럿 등록 | URL/source identity, access/robots/license/purpose policy, provenance, affected job status | 실제 응답은 읽고 replay fixture에서 source 식별자/URL 제거; 파일럿·정책 변경 미실행 |
| 온톨로지·문서화 | trace ontology; collector import 뒤 `kb_pipeline_jobs/stages` | 기존 KB document ID와 stage/status row, canonicalization, 재시도 다중 stage 및 mission/job/item/delivery lineage | 실제 trace와 집계 읽음; 온톨로지 쓰기 미실행 |

검토 때는 목록 건수, 상세 결과 상한, run 범위, delivery의 distinct-item 단위, audit 표본 단위를 별도로 비교한다. UI 화면 재구성만으로 위 원장이나 쓰기 계약을 대체하지 않는다.

## 데이터 관계와 집계 단위

- `collection_missions`는 durable intent/plan/status/gaps를 가진다. `collection_mission_jobs`가 기존 `collector_jobs`와 mission을 연결하고 run sequence를 보유한다. 실행 산출은 기존 `collector_items`와 `collector_deliveries`를 재사용한다. KB 전달 뒤 `kb_pipeline_jobs/stages`가 문서의 온톨로지/의미 처리를 담당한다. 신규 별도 문서 원장은 계약상 없다.
- mission `counts.discovered`: 연결된 job의 cursor별 discovery 누계. acquired/accepted/held/failed/blocked/duplicate/review_needed/triage는 연결 item의 해당 상태·신호 수. `imported`는 연결 job 아래 `CollectorItem.id`를 distinct count하고 `CollectorDelivery.outcome='imported'`인 항목 수다. pending delivery도 item distinct 기준. 전체 결과 목록은 상세 응답에서 최대 100개다.
- run `collected/imported`는 run_seq별 item/delivery 집계다. mission 전체 수치와 다른 기간/범위다. “수집”의 한 가지 총계로 합쳐 읽지 않는다.
- trace `requirements[].documents/sources/need`는 연구 coverage 저장/계산값이다. 충족 비율은 문서 수 합계가 아니라 `status=met`인 요구 항목 수 ÷ 요구 항목 수다. target과 topic이 각각 별도 요구 단위이며 `need`는 target/topic 상수다. topic 요구는 여러 대상 자료에서 계산한다.
- trace `stages`: 탐색=계획 source 수, 획득=item 수, 판별=accepted item 수, 적재=imported distinct item 수, 온톨로지=문서별 canonicalizing 성공/degraded 단계 수. 단계마다 분모가 다르므로 단계 수를 전환율로 나누지 않는다.
- trace `documents`: 연구 evidence에서 document_id가 있는 자료를 최대 3,000행 읽고 document_id 중복 제거한 뒤 표시한다. UI의 문서 총량과 mission의 `counts.imported`가 항상 같다고 가정할 수 없다. 관측에서 한 mission은 imported 2,939 vs trace documents 1,652였다.
- trace `events` 최대 300건, `discarded` 최대 150건. 목표·사용자 문맥을 포함할 수 있으므로 원 응답을 재현 데이터로 보관하지 않는다.
- trace ontology `documents`는 추적한 고유 KB 문서 ID 수. 각 stage의 `states`는 그 문서들에 연결된 `KbPipelineStage` 행을 stage/status별로 count한 값이며, stage별 재시도/복수 job이 있어 문서 수와 동일 단위가 아니다.
- 전역 collector `/summary`는 library scope의 `collector_items/jobs/outbox` 전체 기간 집계다(임무별이 아님). fetched=raw hash 존재, extracted=text hash 존재, delivered=imported delivery outcome 개수, awaiting_review=pending review 후보 개수. `/review`는 대기 총계와 limit≤50 페이지, `/review/audit`는 held document strata `(source, 첫 reason)`별 일일 결정 표본 최대 `per_group=10`이다. 품질 모델 숫자도 mission count와 분리된다.

## 수집 시나리오 관측

세부 ID·시각·숫자는 [운영 aggregate](evidence/live-aggregate.json), 판정 근거/없는 경우 분류는 [시나리오 표](evidence/scenario-matrix.md). 본문 및 URL 값은 보존하지 않았다.

- 같은 제목: 21 mission 목록에서 정규화 제목 fingerprint 기준 17개의 추가 중복 행 확인(제목 원문은 미보존).
- 적재 0: 14 mission에서 `counts.imported=0`, trace documents=0. 12 running, 1 cancelled, 1 failed.
- 장기 대량: 발견 69,851/25,756/38,468건 mission이 관측되고, 각각 3회차/1회차/1회차. 종료·취소 상태의 과거 기록이다.
- 충분치 않은 종료: `succeeded` 또는 `partial`인 완료 임무는 이번 21건에서 확인되지 않음. 취소/실패 임무의 coverage 부족은 존재하지만 완료 수집 후 부족 시나리오와 같지 않다.
- 정책/실패/대기: 전역 jobs `policy_blocked=55`, `queued=142`, `running=1`; 최근 대기표본에 `policy_blocked`가 포함됨. mission trace에서 실패 job도 관측됨.
- 대량 검토: `/review` total=2,310 (최대 페이지 50), audit `per_group=2`로 468건의 전체 표본이 생성됐고 익명 evidence에는 10개 item만 남김. 표본은 매일 안정적인 source/reason별 held 예시이지 전체 목록이 아니다.
- 여러 회차: mission `run_seq` 3(`anon-21eee7a431745b22e649`), 3(`anon-5b48f9352f43548b87ee`), 6(`anon-65389518f233a4117bb2`) 확인.
- 보충/재시도 이후 보존: 운영 데이터에서 보충/재시도 API를 실행하지 않아 전후 관계는 검증 불가. 대조 대상 history는 존재하지만 이 실행으로 생성됐다고 분류하지 않음.

## UI·데이터 위험을 드러내는 반례

1. 69,851 discovered → 4,903 acquired → 2,939 accepted/imported vs trace `documents=1,652`인 취소 mission. 한 숫자만 대표값으로 사용하면 목록/과정/도서관 수치가 불일치해 보인다.
2. 2,310 review total에서 첫 50개와 audit stratified sample 468개는 서로 다른 데이터 집합이다. 표본을 전체 건수로 표현하지 말 것.
3. 목표 충족 비율은 요구 항목 비율이다. 대상 1개가 많이 수집되어도 다른 topic 요구가 비면 전체 비율은 낮을 수 있다.

## 캡처 범위와 제한

기준 화면은 별도 `e2d89e6` checkout의 `/collect`를 desktop 1440×900 및 mobile 390×844로 캡처했다: 내역, 선택 임무 상세, 검토, 새 수집/계획. 지정 `ttakkari_browser`는 local replay 화면을 열었고, 운영 직접 UI 인증 화면이 아니다. 목록/상세/검토는 redacted `ttk` 응답, 계획 preview는 local synthetic sample을 쓴다. 8장의 캡처 및 source/viewport/mode 기록은 [manifest](evidence/screenshots/manifest.md)와 같은 폴더에 있다.
