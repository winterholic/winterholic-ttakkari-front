# 수집 워크스페이스 교정 A/B 독립 최종 검증

검증 일시: 2026-11-07 01:56 KST
저장소: /Users/winterholic/development/projects/winterholic-ttakkari/front-collect-workspace-20261107
검증 대상 HEAD: e070bc080a2036e07930ca7856c2dfa7b76213c3
교정 코드: 78635d328b983b1dbda8dab41450c5ace5607996
검토 전용 문서 커밋: 이 기록을 추가하는 별도 커밋

## 판정

- 교정 A/B의 코드 경계와 관련 fixture 테스트는 현 HEAD에서 확인했다. 요청된 위험군 테스트 79건, build, ui-lint, 커밋 diff whitespace 검사가 통과했다.
- 이 판정은 로컬 mock/fixture와 현재 checkout의 정적 코드에 한정한다. 브라우저 감사, 운영 GET, 운영 mutation, 게시/deploy 상태는 이 작업에서 검증하지 않았다. 따라서 게시 전체의 승인이나 UI 감사자 b916의 결론으로 해석하지 않는다.
- 제품 파일은 수정하지 않았다. 기존 미추적 baseline/evidence 자료는 stage, 수정, 삭제하지 않았다.

## revision 구분 및 diff 검토

| revision | 확인 내용 |
|---|---|
| 794d0e902dac50d4582ca9ed9582df3de0c49672 | 최상위 검토 진입, 검토 행 밀도/페이지 조작, trace/load 수치 단위 교정. 67481ee보다 앞선 코드 변경이며 현 HEAD에도 포함됨. |
| 78635d328b983b1dbda8dab41450c5ace5607996 | A/B 제품 교정 7파일: precise-eval 공통 요약, Missions/ResearchPanel 사용, 구형 aggregate 보존 테스트, canonical_candidate 타입 교정. |
| ba437109c29fe12cafad8a0f3520a3a58f6e6f09 | usability-corrections.md에 API 감사 후속 및 A/B 근거 추가. 제품 코드는 바꾸지 않음. |
| 4e93e33155c8338c3f57c7d9df90fd9729e15ed9 | 같은 문서의 backend source와 serving revision 구분을 명확히 함. 제품 코드는 바꾸지 않음. |
| e070bc080a2036e07930ca7856c2dfa7b76213c3 | 실제 HEAD. 앞 문서 커밋 뒤 completion replay용 evidence adapter 자료를 추가. A/B 제품 diff에는 추가 변경이 없음. |

78635d3는 67481ee 이후 A/B 수정이다. 실제 HEAD는 78635d3를 포함하며 이후 두 문서 정정과 completion adapter 자료를 포함한다. git diff 67481ee..HEAD의 제품 파일 변경은 78635d3의 7개 파일에 한정됨을 대조했다. HEAD가 운영 serving revision이라는 주장은 하지 않는다. 검토한 usability-corrections.md는 source checkout d74300c의 계약 코드와 serving revision 5f5cbd9의 과거 GET 관측을 별도 출처로 적고, 둘이 같은 revision이라고 가정하지 않는다.

저장소와 확인한 상위 디렉터리에는 이 작업의 AGENTS.md가 없었다. 미추적 baseline은 처음부터 끝까지 Git status에 그대로 남겼다.

## A — 구형 precise waiting과 triage 경계

- preciseEvalSummary는 triage.precise_eval.pending이 있으면 그 제공값(0 포함)을 우선한다. pending이 없고 counts.precise_waiting이 있으면 이를 “대기·처리 합계”로 표시하며, 개별 수를 만들지 않는다. processing이 명시적으로 없으면 개별 대기/처리를 미확인으로 둔다.
- unresolved는 triage 값(0 포함)을 우선하고, 없을 때만 구형 counts.precise_unresolved를 쓴다. triage와 구형 값이 모두 없으면 미확인으로 표시한다.
- Missions 상세는 구형 aggregate를 “정밀평가 대기·처리 합계”로 따로 안내하고, 개별 pending은 미확인이라고 표시한다. 요약/ResearchPanel은 동일 formatter를 사용한다.
- fixture 검증은 구형 waiting 7/unresolved 0, triage pending/processing/unresolved의 0, pending 누락 및 일부 triage 제공의 조합을 확인한다. 출력에서 legacy aggregate 7을 pending 7로 바꾸지 않고, triage zero를 누락으로 취급하지 않는다.
- 의미의 원 출처는 교정 기록이 참조하는 backend source checkout이다. 그 checkout의 serving 여부는 확인하지 않았다. 이번 검증은 운영 GET 없이 checkout 코드와 local mocks만 사용했다.

## B — canonical candidate 타입과 표시

- CollectDedupe.canonical_candidate는 선택 필드 string | null이다.
- Review의 기술 상세 JSON에서 문자열 값을 다른 dedupe 근거와 함께 원문으로 보존한다. fixture assertion은 "candidate-8" 및 별도 "canonical_status": "accepted" 값이 그대로 나타나는 것을 확인하며 대상 링크가 생성되지 않는 것을 검사한다.
- canonical_candidate 자체를 링크, 확정 canonical 관계 또는 승인 의미로 해석하는 동작은 코드/검토 fixture에서 확인되지 않았다. nullable/누락 값은 링크로 변환하지 않는다.

## 관련 테스트 범위

한 번의 Vitest 실행에 다음 9개 파일을 포함했다: Collector.test.tsx, CollectPage.test.tsx, Missions.test.tsx, ResearchPanel.test.tsx, ReviewWorkspace.test.tsx, ReviewIndependentAudit.test.tsx, CollectWorkspaceBoundaryAudit.test.tsx, missionProjects.test.ts, collectionMissions.test.ts.

이 묶음에는 다음 회귀가 포함된다.

- accepted + can_reprocess=true가 “재처리 가능” 필터에서 빠지고, 실제 재처리 버튼도 나타나지 않음.
- 정책 차단 사유가 있는 항목은 재처리 동작에서 제외됨.
- decision이 생략된 상세에서 top-level status/reason_codes fallback 표시.
- 다음 검토 페이지 요청 실패 후 첫 페이지 항목과 필터를 보존하고 재시도 버튼으로 다음 페이지를 이어 붙임.
- 최상위 프로젝트/검토/운영 화면 전환, view=review 직접 URL, 브라우저 history 복구.
- A/B 타입·요약 렌더 경계와 기존 Collector/missionProjects 관련 회귀.

모든 실행은 TTAKKARI_NO_ENV_FILE=1 환경의 Vitest local mock에서 이뤄졌다. 운영 API 요청을 수행하는 테스트는 실행하지 않았다.

## 실행 receipt

### 위험군 테스트

    $ TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/pages/CollectPage.test.tsx src/features/collector/Missions.test.tsx src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx src/features/collector/missionProjects.test.ts src/api/collectionMissions.test.ts --reporter=dot
    Test Files  9 passed (9)
    Tests       79 passed (79)
    Duration    1.69s
    exit code   0

### 게시 전 build, ui-lint, diff 검사

    $ TTAKKARI_NO_ENV_FILE=1 pnpm build
    ✓ 3105 modules transformed.
    ✓ built in 346ms
    exit code 0

Vite는 minification 후 500 kB보다 큰 chunk 경고를 출력했다. build는 성공했지만 chunk 크기 경고는 남아 있으며, 이 검증은 번들 성능 측정이 아니다.

    $ node scripts/ui-lint.mjs
    ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음).
    exit code 0

    $ git diff --check 67481ee..HEAD
    [출력 없음]
    exit code 0

pnpm build와 ui-lint는 실제 HEAD e070bc080a2036e07930ca7856c2dfa7b76213c3에서 실행했다. git diff --check는 기준 사용성 교정 67481ee부터 해당 HEAD까지의 tracked commit diff를 검사했다. 별도 staged diff 확인은 이 문서만 stage한 다음 수행했다.

## 미실행과 한계

- 브라우저/시각 검증: 하지 않음 — 지정 브라우저는 b916 감사자가 소유 중이며 카드에서 사용을 금지했다.
- 운영 GET 및 모든 운영 mutation: 하지 않음 — 카드에서 금지했다. 현재 serving revision과 runtime 계약을 새로 조회하지 않았다.
- completion adapter의 독립 검증: 하지 않음 — HEAD에 추가된 별도 evidence 작업이며 이 A/B 최종 계약 검증 범위가 아니다.
- 배포, merge, push: 하지 않음 — 이번 완료 기준은 독립 검증 기록 커밋까지이며 게시 승인/수행 요청이 아니다.
- 프로젝트 AGENTS.md: 없음 — 작업 경로와 상위 폴더를 확인했으며 해당 파일을 찾지 못했다.

## 커밋 범위

이 독립 검증 문서만 별도 커밋으로 기록한다. 제품 소스, 다른 작업자의 파일, 기존 미추적 baseline/evidence 파일은 포함하지 않는다.
