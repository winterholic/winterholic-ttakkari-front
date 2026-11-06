# 수집 프로젝트 대시보드 구현 기록

## 현재 기능·문제·구현 방향

기존 수집 미션은 자연어 지시문 등록·계획 미리보기, 미션 상세/회차, 자동·보충·출처별 수집, 품질 검토, 재시도·일시정지·재개·취소·이어서/재실행, 주기, 온톨로지 처리 및 운영 제어를 제공했다. 진입 화면은 제목·상태·적재 건수만 있는 단순 목록이었고, 상세 첫 화면에는 조사 목적·확보 결과·문제 원인·실제 도서관 적재가 한데 묶여 있지 않았다.

이번 변경은 **각 mission ID를 수집 프로젝트 하나로 보여 주고**, 최근 활동순 목록에서 검색·상태 필터를 거쳐 상세 대시보드나 신규 계획으로 이동하게 한다. 기존 API와 권한 정책은 바꾸지 않았다. 같은 제목의 다른 mission ID는 합치지 않으며 같은 ID의 여러 수집 회차는 기존 상세에서 이어 본다.

## 구현 내용

- 프로젝트 표에 제목·계획 분야 또는 세부 주제, 상태, 활동 시각, 미션 누적 적재, 최근 결과, 문제와 다음 행동을 배치했다. 이름/지시문/조사 분야 검색과 진행·확인 필요·종료 상태 필터를 제공한다.
- 목록 누적 적재는 API `counts.imported`를 사용한다. 최신 회차 `runs[].imported`를 전체 누계에 더하지 않는다.
- 상세는 조사 목적과 상태 설명, 목표량 상태, 부족 범위/보충 버튼, 도서관에 실제 적재된 대표 자료, 실패·해결 안내, 품질 판정 한계를 먼저 보여 준다. 대상별·자료·품질·과정·긴 지시문/계획은 기존 탭에서 계속 연다.
- 신규 연구 계획은 긴 지시문과 참고 텍스트를 유지하고 계획 미리보기에서 전략, 단계, 출처/접근 근거, 검색어, 예산, 조사 종료 조건, 분야별 현재 상태, 제공된 논문 권리 메모를 확인한다. 지시문을 고치면 미리보기가 초기화되어 다시 요청할 수 있다.
- 미리보기 API는 일반 URL의 사용 허가 전용 필드를 제공하지 않는다. 이 한계를 계획 화면에 표시한다. 출처의 `provenance`와 논문 권리 필드만 API가 준 범위에서 표시한다.
- 오류 코드는 기본 안내에 노출하지 않고 무엇이 실패했는지, 영향, 다음 행동을 설명한다. 원 코드와 상세는 기술 진단 disclosure 안에 둔다. 403/권리·정책 차단은 대체로 허용된 출처를 고르도록 안내하고 재시도·우회를 권하지 않는다.
- 요구 충족 비율은 조사 목적과 모든 요구의 양의 목표량이 확인될 때만 계산한다. `met`는 계획 목표량 상태이며 사실 검증이나 지식의 충분성을 의미하지 않는다.
- 탐색·확보·품질 판정·도서관 적재·온톨로지 단계의 값은 서로 다른 집계 단위와 누적 범위일 수 있음을 안내하고 전환율을 만들지 않는다. 적재 수는 미션 문서 목록, 목록 누계는 `counts.imported`에서 읽는다.
- URL의 `mission`, `tab`, `view`, `new` 매개변수를 유지했다. 기존 상세 탭 ID와 운영 화면 ID도 보존했다.
- 변경은 `CollectPage.tsx`, `Missions.tsx`, `MissionTrace.tsx`, `collector.css`와 신규 오류/목록 helper 및 전용 테스트에 한정했다. API 타입/함수, backend, DB, lockfile은 수정하지 않았다.

## Carbon·Linear에서 적용한 원칙

1. [Carbon Data table](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines)의 표 제목·짧은 열·도구 모음 원칙을 적용해 검색/필터를 목록 위에 두고, 넓은 화면은 표로 스캔하게 했다.
2. [Carbon Tag](https://www.carbondesignsystem.com/building-blocks/core/components/tag/guidelines)의 상태/분류 구분을 참고해 상태는 색만 쓰지 않고 읽을 수 있는 문구를 함께 보여 주며, 상호작용은 실제 버튼·입력으로 구현했다.
3. [Linear Projects](https://linear.app/docs/projects)와 [Project status](https://linear.app/docs/project-status)처럼 목록에서 상태·최근 활동을 훑고 프로젝트 개요에서 목적·진행·다음 행동을 이어 보도록 구성했다. 비율은 모수가 확인되는 항목에만 표시한다.

공통 UI와 `src/vendor/ttakkari/tokens.css`의 간격·타입·색·포커스 토큰을 재사용했다. 지정 문서 `docs/19-design-system.md`는 이 checkout에서 찾지 못해 해당 문서는 미확인이다. UI lint는 새 토큰이나 고정 간격을 추가하지 않았는지 별도로 확인했다.

## API 계약과 증거 한계

- 로컬 프론트 타입은 `src/api/collectionMissions.ts`에서 읽었다. 계획에는 `mode`, `steps`, `sources`, `queries`, `coverage`, `budget`, `stop_conditions`, 선택적 논문 라이선스가 있고, 미션에는 `counts`, `runs`, `jobs`, `gaps`, `results`, `triage`가 있다. trace에는 요구 항목·단계·작업 요약·이벤트·도서관 문서 목록이 있다.
- 실제 API payload 및 운영 데이터와 대조한 `docs/collect-workspace/baseline-contract.md`는 현재 checkout에 없었다. 별도 작업 기록 `review-implementation.md`에도 이 baseline이 없으며 `get_worker(a78459aa-1ff8-410f-acdd-555e743d6ed8)`가 `404 not_found: 이 작업 세션의 하위 세션이 아닙니다`를 반환해 검증하지 못했다고 적혀 있다. 따라서 표시 의미는 로컬 프론트 타입과 기존 UI에서 확인한 범위다.
- trace의 단계별 단위·범위는 API `detail` 문자열을 함께 보여 주되, 운영 payload에서 각 단계의 실제 의미를 독립 확인하지 못했다. 브라우저 baseline과 실제 사용자 데이터 역시 검증하지 않았다.

## 브라우저 확인 재현 경로

이 단계에서는 브라우저 도구가 baseline 작업자 소유이므로 직접 실행하지 않았다. 통합 검증 시 configured Ttakkari browser 도구에서 다음 상태를 연다.

1. `/collect` — 최근 활동순 프로젝트 목록, 검색·상태 필터, 긴 프로젝트/주제명, 빈 상태를 확인한다.
2. `/collect?mission=<실제 mission ID>&tab=overview` — 목적, 상태 안내, 확보/부족 항목, 실제 적재 문서, 문제·품질 설명을 확인한다.
3. 같은 URL에서 `tab=targets`, `docs`, `log`, `prompt` — 기존 탭 호환, 대상별 보충, 자료/품질, 긴 지시문 전체, 계획 미리보기를 확인한다.
4. `/collect?new=1` — 긴 자연어 지시문 입력, 참고 텍스트 추가, 미리보기 → 수정 → 재미리보기 동선을 확인한다.
5. `/collect?view=overview`, `sources`, `runs`, `review`, `quality` — 기존 운영·출처·실행/전달·검토·한도 화면의 URL 진입을 확인한다.
6. 데스크톱과 390px 폭에서 키보드 Tab/Enter, 긴 제목 줄바꿈, 로딩/오류/빈 상태 및 상단 주요 행동을 캡처한다. 실제 수집 쓰기는 하지 않는다.

## 검증 결과

- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Missions.test.tsx src/features/collector/missionProjects.test.ts` — **2 files, 6 tests passed**. URL `new`/`mission` 흐름, 최근순·검색·상태 필터, 같은 제목 ID 분리, 누계 출처, 정책 차단 메시지, 목표량 비율 조건을 검증했다.
- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/features/collector/Missions.test.tsx src/features/collector/missionProjects.test.ts` — **3 files, 15 tests: 11 passed, 4 failed**. 실패는 기존 `Collector.test.tsx`의 운영/검토 문구 기대와 병합된 별도 Review/Overview 작업의 문구가 달라 발생했다. 해당 파일과 타 작업 소유 화면은 수정하지 않았다.
- `TTAKKARI_NO_ENV_FILE=1 pnpm build` — **통과** (`tsc -b`, 3,104 modules transformed, PWA 산출물 생성). 기존 500 kB 초과 chunk 경고는 남아 있다.
- `pnpm exec eslint src/pages/CollectPage.tsx src/features/collector/Missions.tsx src/features/collector/MissionTrace.tsx src/features/collector/CollectionErrorNotice.tsx src/features/collector/missionProjects.ts src/features/collector/missionProjects.test.ts src/features/collector/Missions.test.tsx` — **통과**, lint 출력 없음.
- `node scripts/ui-lint.mjs` — **전체 비교 실패**. 이 변경의 `collector.css` 신규 위반은 제거했다. 현재 실패는 별도 소유 `src/features/collector/review-workspace.css`의 `px-literal 1건`, `undefined-token 1건`이며 이 파일은 건드리지 않았다. 기준선 파일은 변경하지 않았다.
- `git diff --check` — 통과.
- 브라우저/UI 실사 — **미실행**: baseline 작업자 단독 소유 규칙.
