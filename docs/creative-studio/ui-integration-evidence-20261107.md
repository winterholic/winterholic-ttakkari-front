# Creative Studio UI 통합 증거 및 인계 (2026-11-07)

## 결과 요약

기존 화면의 계획·제작 영역을 현재 실제 서버 계약으로 이어 붙였다. 실제 생성한 Kafka brief 계획은 제작 gate가 닫혀 있어 제작/검수를 실행하지 않았다. 데스크톱·모바일 콘텐츠 화면은 승인된 브라우저로 API fixture에 연결해 검수했으며, fixture 화면과 실 API 결과를 분리했다. 따라서 계획→제작→수정의 서버 성공 여정은 미완료다.

## 변경과 보존

- 시작 기준 HEAD: `31de7817313636331f9e414cb5400a2afa5baeb4` (기존 작업 카드 시작 시 관측). 이번 작업은 commit하지 않았다.
- 기존 UI WIP 파일 `src/App.tsx`, `src/api/creativeV2.ts`, `src/pages/creative/CreativePlanPage.tsx`, `src/pages/creative/CreativePlanPage.test.tsx`, `src/pages/creative/creativePlan.css`를 보존하면서 필요한 화면/타입/API 연결과 regression test를 추가했다. 이 작업에서는 로컬 개발의 same-origin `/api` proxy 설정을 `vite.config.ts`에 추가했다. `.env`를 읽지 않고 `TTAKKARI_NO_ENV_FILE=1`로 로컬 fixture 실행을 격리했다.
- 직전 인계의 27개 통과 회귀와 build 366ms 근거를 덮어쓰거나 삭제하지 않았다. 아래 fresh run은 기존 범위 2개 test file 합계 29개로 확인했다.
- 품질 UI는 `quality_report` 원본 판정을 각각 표시하고 의미/시청 검수 unknown을 unknown으로 남긴다. 부분 수정은 캡션 필드 변경만 보내며 기존 문구 그대로인 요청은 막는다. revision 전후 장면/수정 기록·SHA를 읽고 result-link로 final/segment별 임시 영상을 연다. 과거 caption은 현재 같은 target에 서버 proposal이 있을 때에만 입력 초안으로 재적용할 수 있으며, 새 revision 승인·동일 caption mode dispatch·render가 필요하다. 범용 rollback은 없다.
- Stage 2 `caption_mode`는 repair proposal/현재 production view에서 읽고 sessionStorage에 보존한다. 신규 revision을 사용자 승인한 뒤 `/production?caption_mode=<same>`에 전달하고 기존 `/production/render`로 이어진다. repair 응답은 `applied_needs_approval`로 보여 주고 승인/렌더를 자동 실행하지 않는다.
- 검수 요청은 `{revision}`만 보낸다. evaluator/receipt/independent 입력을 보내지 않고, 서버의 기본 `not_connected/unknown`을 검수 성공으로 표시하지 않는다. fixed producer, 음성 자산 있는 narration, 모션/캐릭터·비캡션 제안은 편집을 막거나 서버 blocked를 표시한다.
- scene timeline에는 계획 타이밍, shots 및 전략/근거를 보이고 preview URL이 없으면 미지원 안내를 보인다. arbitrary brief attachment, arbitrary user QA objective, natural-language plan edit는 지원 API를 찾지 못해 호출·가짜 입력을 추가하지 않았다.
- Core 최소 확장안은 [ui-core-compatibility-20261107.md](ui-core-compatibility-20261107.md)에 있다. backend 소스/API 변경, commit, push, deploy는 하지 않았다.

## 검증 증거

실행 기준: `/Users/winterholic/development/projects/winterholic-ttakkari/front-creative-production-20261107`

```text
pnpm exec vitest --run src/pages/creative/CreativePlanPage.test.tsx src/pages/CreativePage.test.tsx --reporter=dot
Test Files  2 passed (2)
Tests      33 passed (33)
```

```text
pnpm exec tsc --noEmit
exit 0 (no diagnostics)
```

```text
pnpm build
✓ built in 338ms
warning: chunks > 500 kB (existing main bundle/pdf worker sizes)
```

초기 UI 작업 전 보존한 기존 27 tests/build 366ms 근거는 원 handoff `../back-creative-production-20261107/docs/creative-studio/ui-handoff-20261107.md`에 있다. 새 Stage 2 보완의 브라우저 계측/캡처는 본 문서 아래에 별도로 갱신한다. fixture 기반 검수는 실제 API 성공이 아니며, fixture 데이터 화면은 `UI FIXTURE — 실제 제작 아님`을 명시한다.

## 실제 API와 승인 brief

- brief: **Kafka 메시지 흐름**, 희망 16초, 16:9. 실제 plan create/read API 결과 ID `3bf9f754-0039-4fe3-a771-e137b9235068`; 4 scenes, 480 frames, 30fps.
- 실제 응답은 `render_gate=false` 및 필수 능력 미충족/의도 미확인 blockers를 반환했다. `research.fact_check` 실행 이력이 필요하고 `research.map_data` 능력이 미충족인 상태다. 막힌 승인 gate를 바꾸거나 실제 render endpoint를 호출하지 않았다.
- 실 API: 이전 실행에서 create/read 및 gate 상태까지 검증. 이 보충에서는 Stage 2 API 호출이나 실제 제작/검수를 반복하지 않았다. 기존 API의 applied repair/approval/render end-to-end는 운영 계획의 gate 상태 및 승인 검증 때문에 미검증이다.
- fixture UI: Stage 2 서버 응답 모양으로 caption mode 유지, 명시 승인 전 무자동 동작, `not_connected/unknown`, 이전 scene/repair diff, revision/result-link SHA 검증 UI를 unit fixture로 검수한다. fixture video URL이나 synthetic result는 실제 API 결과 증거가 아니다.
- 개발 proxy 경로: Vite `/api` → `http://127.0.0.1:8789` fixture로 브라우저 상세 화면이 응답하는 것을 확인했다. 정상 테스트 사용자 인증으로 실제 backend에 로그인하는 검증은 하지 않았다. 이전 런의 격리된 브라우저 세션에서는 로그인/CORS 때문에 실 backend 브라우저 접근이 실패한 기록이 있다. 이번 Run 브라우저는 isolated profile이므로 로그인 상태를 재사용할 수 없었으며, fixture 자격증명으로만 화면 동작을 확인했다. 실제 서비스 인증 기반 브라우저 여정은 미검증이다.

## 캡처

현재 Run outbox 내 승인 브라우저 캡처(모두 labeled fixture page):

- Desktop production/QA panel 1280×800: `/Volumes/Backup/ttakkari-data/outbox/d9cb9886-2ab6-4027-b3ce-070bad67f9c0/browser/page-2026-11-06T17-19-02-886Z.png`
- Mobile production panel 390×844: `/Volumes/Backup/ttakkari-data/outbox/d9cb9886-2ab6-4027-b3ce-070bad67f9c0/browser/page-2026-11-06T17-20-15-244Z.png`
- Mobile QA panel 390×844: `/Volumes/Backup/ttakkari-data/outbox/d9cb9886-2ab6-4027-b3ce-070bad67f9c0/browser/page-2026-11-06T17-20-01-556Z.png`

둘 다 화면 제목 `UI FIXTURE — 실제 제작 아님`과 fixture 전용 생산 차단 문구가 보인다. 모바일 bounding box에서 main content는 x=0..390, 본문 panel은 x=16..374로 화면 너비 안에 들어온다. 브라우저 console의 2개 error는 dev `sw.js`가 HTML을 반환한 unsupported-MIME/ServiceWorker registration 실패이며, 본문 API mock은 로드됐다. 캡처 timestamp는 브라우저 호스트 시간(UTC)이다.

## 남은 일 / 선택 계정

- 실 production/QA/retry/repair 비교 여정: render gate blockers가 해소된 뒤 승인된 정상 backend 테스트 계정으로 이어서 검증한다.
- Core는 compatibility 문서의 첨부, 사용자 품질 목표, scene preview, 자연어 수정, scene retry 계약을 검토하고 필요 필드/정확한 payload를 합의해야 한다. 수동 caption 재적용은 server proposal과 현재 지원 필드에서만 가능하며 범용 rollback은 미지원이다.
- actual authenticated production page remains unverified: isolated browser session이므로 정상 실서비스 로그인 상태를 공유하지 않고, 이번 브라우저 검수는 same-origin Vite proxy → local fixture만 사용했다. Stage 2 run의 로컬 source/docs를 운영 배포 계약으로 검증하지 않았다.
- 개발자 계정 선택: 기존 UI 인계에서 유지 중으로 기록된 임시 우선순위 `ai2@hyperez.io`는 보존했다. 이번 Run은 Codex 실행 환경이며 이 Run에서 Creative Studio API 요청에 사용된 실제 계정 식별자는 응답에 포함되지 않아 `ai2@hyperez.io`가 선택됐는지 독립 확인하지 못했다. 임시 우선순위 종료 예정 2026-11-07 04:24 KST 전까지 변경하지 않았다. 계정 미확인은 코드/API 검증과 별도로 남긴다.
- 현재 base HEAD: `31de7817313636331f9e414cb5400a2afa5baeb4`. 작업 트리는 전용 UI 변경과 `docs/creative-studio/` 문서 2개 때문에 dirty 상태이며, `git diff --check` 통과. commit/push/deploy는 하지 않고 통합 책임자에게 미커밋 상태로 넘긴다.

## Stage 2 후속 보충 — 과거 문구·결과 영상·상호작용 증거

- 이번 후속은 d9cb9886의 기존 UI 보충을 이어 수행했다. `src/pages/creative/CreativePlanPage.tsx`의 revision compare 복원 버튼이 과거 scene snapshot뿐 아니라 `repairs[].changes[].before`의 caption title/narration도 초안으로 불러오도록 연결했다. 동일 scene/shot/field의 기존 repair 값만 선택 가능하고, 즉시 저장하거나 렌더하지 않는다. 새 repair-plan → 명시적 문구 업데이트 → `applied_needs_approval` 새 revision → 별도 승인 → 같은 `caption_mode` dispatch → render 순서를 유지한다. 이번 보충은 UI의 유효 여정 29개 테스트 및 기존 fixture 계측을 반복하지 않았다.
- 좁은 검증: 테스트를 먼저 추가했을 때 해당 테스트가 버튼을 찾지 못해 실패했고, 구현 뒤 같은 테스트가 통과했다. 이어 타입 검사를 실행했다.

```text
pnpm exec vitest --run src/pages/creative/CreativePlanPage.test.tsx -t 'revision comparison requests bound temporary links and can load an old caption as a draft' --reporter=dot
Test Files 1 passed (1) · Tests 1 passed, 28 skipped
pnpm exec tsc --noEmit
exit 0 (no diagnostics)
```

- 승인 브라우저에서 실제 클릭 가능한 데스크톱 UI를 확인했다. **현재 상호작용 증거는 브라우저 안에서 합성한 API fixture**이며 실제 backend 요청/성공이 아니다. 브라우저 요청 목록과 UI 상태에서 다음을 확인했다.
  - 성공 segment `seg-03` 열기: `POST /production/result-link` body `{revision:2,result_id:"seg-03"}` → fixture `200`; video tag는 로컬 정적 fixture 동영상 `206`을 받았다. 이는 임시 링크 UI가 segment 식별자로 연결되는 검증이며 실제 서버 서명 URL 성공 검증이 아니다. scene 이미지 preview는 별도 미지원으로 계속 안내한다.
  - 검수: `POST /production/review` body `{revision:2}` → UI `not_connected/unknown`; PASS로 바꾸지 않았다.
  - stale: `POST /production/repair-plan` body `{revision:2,defects:[...]}` → fixture `409`, UI에 `fixture: revision 2 is stale` 표시.
  - blocked: 같은 repair-plan 요청 → fixture `200`의 blocked proposal 및 사유 `fixture: fixed producer 수리는 지원되지 않음`; 수정 적용 버튼 disabled.
  - 동일 문구: 현재 값과 같으면 적용 버튼이 disabled이며 `/production/repair` 요청은 발생하지 않았다.
  - 과거 문구: 비교 화면에서 `repairs[].changes[].before`의 `Kafka 원문 제목`을 선택해 초안 `Kafka 원문 제목`으로 로드했다.
  - 재적용: `/production/repair` body `{revision:2,proposal_sha256:"cccc...",updates:[{scene_id:"s1",shot_id:"s1a",layer:"captions",field:"title",text:"Kafka 원문 제목"}]}` → fixture `200`, `applied_needs_approval` r3.
  - 명시 승인/렌더: 별도 `POST /approve {revision:3}` 후 `POST /production?caption_mode=title_only {revision:3}`, 이어 `POST /production/render {revision:3}`를 fixture 요청 로그에서 확인했다. 이 응답들은 synthetic fixture라 실제 승인/제작 완료가 아니다.
  - 전후 비교: r2/r3의 SHA를 구분해 표시하고 `GET /production/revisions/2` 및 각 revision에 묶인 final result-link 요청을 fixture에서 확인했다.
- 본 Run의 정상 상세 화면 접속은 한 번 시도했으나 `/login?next=...`로 이동했고, 브라우저 console/network에서 `POST http://127.0.0.1:8787/api/auth/refresh`와 `GET /api/health`가 CORS 차단(허용 `Access-Control-Allow-Origin` 없음)됐다. 같은 인증을 재시도하지 않았다. 로컬 Vite fixture 경로에서는 Vite `/api` proxy를 fixture 서버 `127.0.0.1:8789`로 연결해 상호작용을 검증했다. dev `sw.js`의 HTML/ServiceWorker MIME 오류는 개발 환경 관측으로만 기록하며 수정하지 않았다.
- 배포 상태 조회에서 예약 revision `40e88581cc1010287ef2b82e13188e2d6c6e8df9`는 `requested`로 관측됐다. runtime이 어느 SHA를 제공하는지는 확인되지 않았으므로 배포된 backend의 Stage 2 구현 여부와 실제 review/repair/result-link/render 성공은 미검증이다. 브라우저는 사용 후 닫았다.
- fixture 상호작용 캡처: `browser/page-2026-11-06T17-36-19-034Z.png`(happy: 승인 후 렌더와 r2/r3 비교), `browser/page-2026-11-06T17-37-54-771Z.png`(blocked proposal). 둘 다 현재 Run outbox에 저장됐으며 `UI FIXTURE — 실제 제작 아님` 표시가 있다. 이전 Run의 데스크톱·모바일 캡처는 보존하고 재계측하지 않았다.
