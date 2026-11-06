# Review / Research / Overview 구현 기록

## 범위

이번 변경은 `Review.tsx`, `ResearchPanel.tsx`, `Overview.tsx`, `researchLabels.ts`, `ResearchPanel.test.tsx`, 신규 `ReviewWorkspace.test.tsx`, 신규 `review-workspace.css`에 한정했다. API·backend·공통 품질 판정 컴포넌트와 다른 작업자 소유 파일은 수정하지 않았다. 새 CSS는 Review, ResearchPanel, Overview에서 import한다.

## 기능별 변경과 확인

### 검토 큐

- 서버의 검토 대기 총량과 현재 가져온 행 수를 분리해 표시한다. 검색·사유·출처·재처리 가능 필터는 지금까지 로드한 행에만 적용하고 그 범위를 화면에 알린다.
- 큰 큐는 기존 무한 쿼리를 보존하면서 페이지 단위 `다음 N건 불러오기` 동선을 제공한다. 필터 선택지는 로드된 행의 사유·출처에 한정된다.
- 우선 확인 표시는 보류 사유를 바탕으로 한 UI 제안이다. 서버 순서나 자동 점수를 뜻하지 않는다고 표시한다.
- 미리보기, 출처, 상태, 읽을 수 있는 사유, 가능한 재처리, 유용성 검토·적재 동작을 한 항목에서 확인한다. 목록 API에 자동 평가 값이 없으므로 점수·불확실성을 미확인으로 표시한다.
- 중복 사유가 있어도 중복 대상은 만들어 내지 않는다. 대상·관계 근거는 API 응답에 포함되지 않는다고 알리고 원 코드 등 기술 상세를 별도로 연다.
- 권리·정책·robots 관련 사유가 있으면 `can_reprocess`가 참이어도 재처리 버튼을 감춘다. 기존 재처리 API mutation 성공·실패·요청 중 상태와 ItemReview의 실제 review/import API 동작은 유지한다.

### 보류 표본 감사

- 검토 화면의 주요 동선으로 올렸다. API의 날짜와 출처×사유 그룹별 보류 총량·표본 수, 그룹별 표본 상한을 표시한다.
- 표본 검토는 전체 품질 승인이나 자동 통과·일괄 승인으로 처리하지 않는다. 사유 코드는 기술 상세에 유지한다.

### 운영 현황

- 과다한 전체 funnel 카드 대신 자동 수집 실행 상태, 서버 검토 대기 총량, 운영 단계별 차단·실패·전달 대기, 예산 및 예시 출처 등록을 유지한다.
- `awaiting_review`는 서버의 검토 대기 총량으로만 표시한다. 사용자 조치 필요 총량, 자동 평가 대기 및 정책 차단 세부 총량은 API가 분리 제공하지 않으므로 미확인이라고 분명히 한다. 단계별 집계는 서로 합산하지 않는다.
- 대기 사유를 사람이 읽는 문장으로 바꾸고 알 수 없는 값은 코드를 그대로 보여 주지 않는다. 운영 설정 오류에는 별도 재조회 동작을 제공한다.

### ResearchPanel

- 조사한 하위 주제 중 출처 수 기준 충족 범위를 표시하면서, 자료 수·출처 수 기준이 사실 정확성 또는 품질 승인을 보장하지 않는다는 제한을 접지 않은 상태로 알린다.
- 기존 검색 실패와 정상적인 결과 없음 구분, 하위 주제 상태, 라운드·검색어, 논문 권리, 사용자 맥락 관계를 유지한다.

## 데이터 계약과 남은 제품/API 질문

프론트 계약(`src/api/collector.ts`)에서 확인한 응답은 다음과 같다.

- 검토 목록: `items`, `total`, `limit`, `offset`; 행은 `id`, `url`, `source_key`, `status`, `reason_codes`, `language`, `text_chars`, `preview`, 미정형 `signals`, `can_reprocess`를 제공한다.
- 항목 상세: 판정 사유·품질 점수/상태(품질별 `score`/`status`), 권리, 해시, 검토 이력, 전달 내역을 제공한다. 상세 API도 중복 대상 관계를 명시적으로 표현하지 않는다.
- 표본 감사: 날짜, 그룹별 `source_key`·`reason`·`held`·`sampled`, 표본 행을 제공한다.
- summary: funnel 단계 건수와 기다리는 작업을 제공하지만 사용자 조치 필요/자동 평가 대기/정책 차단 총량을 분해하지 않는다.

정확한 대량 운영을 위해 제품 기획에서 검토할 최소 API 추가 항목:

1. 큐 row의 `review_action_required` 또는 동등한 판정 상태와 서버 전체 사용자 조치 필요 건수. 미로딩 페이지와 구별 가능한 집계 시각/범위 포함.
2. 자동 평가의 실행 상태, 평가 결과 및 불확실성 값을 별도 필드로 제공(미실행·실패·미지원·미확인 구분).
3. 중복 사유의 관계 종류, 확인된 대상 식별자/주소와 근거 상태. 응답에 없으면 UI는 계속 미제공으로 표기.
4. 정책·권리·robots 차단의 분리된 전체 집계와 재처리 가능 사유(서버 authoritative field). 클라이언트 사유 코드 추정은 현재의 우회 방지용 가드일 뿐 계약을 대신하지 않는다.

API 실제 응답의 종합 baseline 문서 `docs/collect-workspace/baseline-contract.md`는 이번 checkout에서 발견하지 못했다. Ttakkari `get_worker(a78459aa-1ff8-410f-acdd-555e743d6ed8)` 호출은 `404 not_found: 이 작업 세션의 하위 세션이 아닙니다`를 반환했다. 따라서 위 계약은 로컬 프론트 타입 및 기존 컴포넌트에서 확인한 내용이며, 실제 서버 payload 및 운영 데이터와의 대조는 검증되지 않았다.

## 통합 브라우저 감사 재현

브라우저 도구는 이 단계에서 baseline 검증자 소유이므로 사용하지 않았다. 후속 통합 감사자는 configured Ttakkari browser 도구로 아래 페이지를 실제 데이터 세션에서 열고 데스크톱·모바일 화면을 저장한다.

1. `/collect?view=overview` — 자동 수집 상태, 서버 검토 대기, 운영 단계별 상태, budget 및 예시 출처 동작 확인.
2. `/collect?view=review` — 큐 총량과 불러온 양 분리, 검색/사유/출처/가능 조치 필터, 더 불러오기, 기본 사유 문장/미리보기 확인.
3. 검토 행의 `근거와 처리 이력` — 상세 로딩·오류, 품질 값 미제공/제공 여부, 권리와 이력의 기본 문장 및 기술 상세 확인.
4. `보류 표본 감사` — 실제 날짜·출처×사유 총량·표본 수와 표본 내용 비교. 승인 일괄 처리 없이 표본을 개별 확인.
5. 정책·권리·robots 차단 행과 재처리 가능한 일반 보류 행을 각각 열어 재처리 노출 여부를 비교한다. 실제 재처리/ItemReview 쓰기 작업은 승인 가능한 통합 테스트 데이터에서만 수행하고 성공·실패·대기 피드백을 확인한다.
6. `/collect` 너비 1440px와 390px에서 화면을 캡처한다. 키보드 Tab/Enter로 필터, 상세 disclosure, 표본 감사와 동작 버튼에 도달할 수 있는지 확인한다.

현재 화면 검증은 DOM 단위 테스트만 수행했다. 실제 데이터·통합 API·데스크톱/모바일 브라우저 스크린샷과 독립 감사는 미실행이다.

## 검증 로그

- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx --reporter=dot` — 2 test files, 16 tests passed. 큐 필터/모수, 정책 재처리 숨김, 표본 그룹, ItemReview·적재 mutation, 재처리 대기·성공·실패 상태, ResearchPanel 품질 한계를 확인.
- `pnpm exec eslint src/features/collector/Review.tsx src/features/collector/ResearchPanel.tsx src/features/collector/Overview.tsx src/features/collector/researchLabels.ts src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx` — exit 0, lint findings 없음.
- `TTAKKARI_NO_ENV_FILE=1 pnpm exec vite build` — exit 0, 3,104 modules transformed, production assets generated. 기존 500 kB chunk size warning은 남음.
- `TTAKKARI_NO_ENV_FILE=1 pnpm build` — 최종 실행 exit 0 (`tsc -b && vite build`, PWA 산출물 생성). 초기 실행은 병행 작업자의 파일이 편집 중인 시점에 다른 소유 파일의 TypeScript 오류 3건으로 실패했으나, 최종 실행에서는 통과했다. 범위 밖 파일은 수정하지 않았다.
- UI 검토: 기존 `--tk-*` 디자인 토큰과 공통 Button/Badge를 사용한다. 레이블 연결된 입력, 기본 버튼 이름, live 상태, 오류 alert, native details/summary, touch-target 최소 높이 적용.
- Git diff 공백 검사는 `git diff --check` 통과. 브라우저 도구는 사용하지 않았다.
