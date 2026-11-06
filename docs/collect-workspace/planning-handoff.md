# 수집 워크스페이스 리팩토링 — 기획 인계

현재 상태: **active, 미배포**. 다음 컨텍스트는 먼저 `manage_work(operation=get)`으로 원래 R1~R10과 최신 소유자를 복원한다. 이 문서는 2026-11-07 01:00 KST 전후의 실행 인계이며 완료 보고가 아니다.

## Living Brief

### 목표와 완료 기준

사용자의 원래 지시는 프로젝트 중심 수집 목록·상세·계획·검토·운영을 구현하고, 기존 기능·엔진을 보존하며 실제 데이터의 데스크톱·모바일 조작과 비참여 감사를 거쳐 게시하는 것이다. 최종 보고에는 전후 화면, 실사용 시나리오, 기능별 검증, 미완료를 포함한다. 전체 요구의 정본은 `manage_work` R1~R10이다. 모두 review 또는 pending이며 전체 완료로 바꾸지 않는다.

### 환경과 기존 변경

- 작업 위치: `/Users/winterholic/development/projects/winterholic-ttakkari/front-collect-workspace-20261107`, 브랜치 `refactor/collect-workspace-20261107`.
- 기준 e2d89e6 위에 Research Lab 커밋 378239d/31de781이 이미 들어 있다. 다른 작업의 변경으로 그대로 보존한다.
- 수집 구현 커밋은 4a62ca0/4020828(검토), 8bd151cf(프로젝트 IA), 9e71bd1(정밀 표시), 0b28512(문구 점검 기록)다. 마지막 확인 HEAD는 0b28512이며 이후 상태는 다시 읽는다.
- 기본 front/back checkout은 다른 작업의 dirty 변경이 있어 수정하지 않는다. 격리 작업 트리만 사용한다.
- 당시 미추적 파일: 이 문서, baseline-contract.md, evidence/, review-independent-audit.md, ReviewIndependentAudit.test.tsx. 최종 통합 때 실제 소유·비식별 상태를 확인하고 필요한 증거만 명시적으로 커밋한다.

### 현재 소유자와 다음 할 일

- [관측] 교정자 `30d9b585-a5fc-4f23-a901-15496c99c926`: **통합 Run `226b1268-12b9-42e7-8c62-a5b76f449714` queued**. 이전 3145959d/e8d19f8c/743b88c8/76d7bb6a는 모두 미시작 queued임을 확인해 취소하고 유효 지시를 하나로 합쳤다. 새 지시에는 아래 네 결함과 기존 테스트/CSS 교정이 전부 들어 있다.
- [관측] UI 감사자 `b91696c3-40bf-420c-af53-1be93809b656`, Run `8b7e4566-de8e-434d-96ff-68cca2b1a14d`: 비참여 데스크톱·모바일 실화면 감사 및 후보 8장 담당. **브라우저 단독 소유자**다. 제품은 수정하지 않는다. 인계 직전 owner API로 running 및 실제 회사 Codex ai2 profile을 확인했다.
- [관측] API 감사자 `5ec74625-34a5-43dd-9c0f-282c7a935e36`: 문서 후속까지 종료했고 컨텍스트 57%였다. 교정 결과가 오면 이 감사자를 `fresh_context=true`의 자립적인 지시로 재사용해 독립 재검증한다. 제품과 이양된 테스트는 수정하지 않는다.
- [관측] baseline a78459aa, 구현자 317f8473/23f3b54a는 커밋·기록·유효 지시를 보존한 뒤 중단했다. 뒤늦은 부분/취소 보고를 새 실패로 해석해 재실행하지 않는다.
- [사용자] 교정과 독립 화면 감사를 통합하고 최종 검사·게시·전후 증거 공유를 이어간다. 새 결함이 없으면 동일 revision·입력·환경의 유효한 검증은 반복하지 않는다.

### 확정된 미해결 결함과 검증

1. `Collector.test.tsx` 4개 실패/5개 통과 및 `review-workspace.css` px-literal 1건/undefined-token 1건을 기획이 재현했다. 통합 교정자가 정상 기능을 보존하며 고친다.
2. Review의 재처리 가능 필터는 accepted + can_reprocess=true를 포함하지만 버튼은 held만 허용한다. 같은 실행 조건으로 통일한다.
3. 실제 item detail의 dedupe 근거가 타입과 UI에서 빠진다. 기존 서버의 선택적 필드만 타입에 보존하고 실제 근거를 표시한다.
4. decision 생략 시 top-level status/reason_codes가 있어도 판정 정보 없음으로 나온다. 제공된 근거로 fallback한다.
5. ResearchPanel은 mission.triage.precise_eval 값을 가리고 응답에 없다고 고정 표시한다. 실제 첫 페이지 20/20에 객체가 있었고 상세 pending=176을 관측했다. `engine=unavailable`은 가용 상태이며 실제 모델명으로 해석하지 않는다. 미제공 모델명은 미확인이다.

교정자가 위 파일과 ResearchPanel 및 관련 테스트를 소유한다. Overview는 응답 범위 문구만, src/api/collector.ts는 기존 서버가 주는 optional dedupe/decision 타입만 보완할 수 있다. 다음 페이지 실패·재시도 검사도 남았다.

`ReviewIndependentAudit.test.tsx`의 2 passed 및 이후 3 passed는 **버그 존재를 기대하는 재현**이다. 제품 정상 통과가 아니다. 교정자는 정상 기대값으로 바꾸어 red/green을 확인한다. 기획이 직접 실행한 2-test 재현은 00:48:58 KST 2 passed였고, 세 번째 ResearchPanel 재현은 독립 감사자의 실행·문서 및 현재 테스트 소스로 확인했다.

교정 검증 명령은 `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run`에 Collector/Missions/missionProjects/ResearchPanel/ReviewWorkspace/ReviewIndependentAudit 테스트를 지정하고, 변경 파일 ESLint·`node scripts/ui-lint.mjs`·`git diff --check`를 실행하는 것이다. 전체 build는 최종 통합에서 한 번 실행한다. mock 조작·운영 API 읽기·브라우저 시각 검증을 구분한다.

### 근거와 데이터의 의미

- 분석·구현의 상세는 implementation.md, review-implementation.md, baseline-contract.md, review-independent-audit.md 및 evidence/scenario-matrix.md를 읽는다. 원문을 별도 복제하지 않는다.
- 기준 화면 8장은 evidence/screenshots/에 있다. e2d89e6 local replay로 목록·상세·검토는 비식별 실제 GET, 계획은 synthetic이다. 운영 직접 로그인 화면이 아니다. 당시 검토 수 2306과 후속 2309/2310, 감사 표본 464/468은 시점별 관측이다.
- imported distinct item 2939와 trace evidence 문서 1652는 다른 집계다. 단계별 모수, ontology stage 행, 검토 전체·로드된 페이지·감사 표본을 같은 전환율이나 총량으로 합치지 않는다.
- 정상 완료 후 요구 부족은 실제 21개 mission 표본에 없다. synthetic 경계 검사로 구분한다. 운영 mutation은 baseline/API 감사에서 실행하지 않았다.
- 공식 runtime_report 2026-11-07 00:51 KST의 active revision은 efe07c4bf9332473c60743bf31bb73111be00c4a다. 제한된 관측은 evidence/runtime-revision-20261107.json에 있다. 계약 source 5f5cbd9는 testing이었고, 과거 baseline GET 시점의 serving revision은 미확인이다.

### 사용자 결정과 경계

- 사용자 임시 계정 순서는 04:24 KST까지 회사 Codex ai2 우선이다. worker 카드의 모델명만 보지 말고 `ttk get /api/runs/<id>`의 실제 profile을 확인한다. API 감사 최초 Run e05693f5의 ai2 profile은 기획이 직접 확인했다. 새 교정/UI Run은 시작 전 계정 미확인이다.
- 로컬 Qwen 제거 후 정밀 판정 backend 전환은 타 기획 2fb118d0 / worker 1eaed429 소유다. 이 프로젝트는 backend나 로보틱스 pending 39건을 중복 수정·재생성하지 않는다. 운영 전환 완료로 말하지 않는다.
- `message_worker`로 형제/타 기획 작업자에게 보내면 소유권 404가 난다. 기획에서 자기 하위 작업자에게만 전달한다. 같은 대상을 다른 경로로 우회하지 않는다.
- 각 Run은 현재 outbox만 사용하며 다른 Run의 보호된 outbox를 읽지 않는다. 최종 공유 증거는 저장소의 허용 복사본에서 현재 outbox로 만든다.

## 세션 로그

### 2026-11-07 01:00 KST 전후 — 컨텍스트 인계

원래 요구는 active다. 교정 대기 지시를 한 Run으로 통합했고 비참여 UI 감사는 별도로 배정돼 있다. 아직 후보 브라우저 감사·독립 재검증·최종 검사·게시·최종 보고가 남았다. 컨텍스트 초기화 전 `manage_work`에 원래 요구와 소유자 및 다음 동작을 체크포인트한다. 새 컨텍스트는 성공/부분 보고의 실행 증거를 먼저 확인하고 이미 끝난 분석·캡처·테스트를 처음부터 반복하지 않는다.

## suggested skills

ui-refine-loop, working-discipline, verification-before-completion은 기존 단계에서 적용했다. handoff는 이 문서 갱신에 적용했다. 새 분석 보고서나 별도 복제 handoff 저장소는 만들지 않는다.

## 기준 계약 전달 기록 — baseline 작성 당시의 기록 보존

관측은 `2026-11-06T15:45:30.683372Z` owner-authenticated 읽기 요청 기준이다. 제품 코드는 수정하지 않았다. 상세는 [baseline-contract.md](baseline-contract.md), 실제 집계/ID는 [live-aggregate.json](evidence/live-aggregate.json), 케이스 판정은 [scenario-matrix.md](evidence/scenario-matrix.md), 캡처는 [manifest](evidence/screenshots/manifest.md)와 각 PNG에 있다.

## 리팩터링 판단에 바로 반영할 점

- 현재 영속 수집 프로젝트에 해당하는 entity는 `collection_missions`; 회차/작업 관계는 `collection_mission_jobs.run_seq`에서 기존 `collector_jobs`로 이어진다. 자료는 기존 `collector_items`/`collector_deliveries`, 문서 지식화는 KB pipeline tables를 재사용한다. 신규 project DB를 먼저 만드는 근거는 확인되지 않았다.
- 운영 mission 21건 중 17행이 제목 fingerprint 중복(고유 fingerprint 4종)이다. 이름이 같다는 이유만으로 여러 mission ID를 합치면 안 된다. UI에서 그룹화하려면 안정적인 연결 근거가 별도로 필요하다.
- `counts.imported`는 delivery outcome이 imported인 distinct `CollectorItem.id`; trace 문서는 evidence 기준 `document_id` distinct 목록(최대 3,000개)이다. 예시 mission은 imported 2,939 vs trace documents 1,652. 같은 총량으로 오해하면 안 된다.
- Pipeline stage 수는 탐색(source 수), 획득(item 수), 판별(accepted item), 적재(distinct imported item), 온톨로지(stage row 수)로 분모가 다르다. 단계 간 전환율을 만들지 않는다. 목표 진척은 문서량이 아니라 fulfilled requirement 항목의 비율이다.
- `/review`는 전체 2,310, 한 페이지 최대 50건. audit은 source×첫 사유별 일일 표본으로 전체 sample 468건(`per_group=2`)이다. 두 값은 별도 모집단이다.
- 이번 관측에는 succeeded/partial mission이 없어 완료 후 부족 시나리오는 실데이터 확인 불가. 보충/retry의 전후 보존도 사용자 상태를 건드리지 않아 미실행이다.
- 기준 UI 캡처는 e2d89e6 local replay다. 목록/상세/검토 fixture는 익명화 운영 GET 응답이고 계획 preview는 synthetic local sample. 운영 직접 UI 캡처로 쓰지 않는다.

Backend source contract는 작업 카드의 지정 SHA `5f5cbd997addcb4ea084ab908790f8f6eec54122`에서 `git show <SHA>:<path>`로 읽었다. 최종 확인 때 로컬 `origin/main`은 `529022861120e86f80400ffaec53dd3f3f7f81c6`로 달라져 있었다. 지정 SHA deploy reservation은 `testing`; 운영 serving revision은 확인되지 않았다.
