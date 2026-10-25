# KB v3 프론트 실제 API 연동 후속 (2026-10-25)

- 위치: `projects/winterholic-ttakkari/front-kb-v3`, 브랜치 `kb-v3/frontend-20261025`. 시작 HEAD `089c8dc33f41ae1f59f4198b8858d6ae25cd1ed8`(clean 확인).
- 이 작업은 원요구(자료추가→자동처리→지식탐색 통합 제품) 중 **프론트의 실제 API 연동·UI 누락 보완 단계**다. 원요구 E2E 10개는 별도 후속이고, 이 작업으로 전체 목표를 마쳤다고 말하지 않는다.
- main merge·push·배포·PMS done 은 하지 않았다. 백엔드 파일은 읽기만 했다(발견은 아래 "백엔드에 넘길 발견").
- 지시문의 백엔드 SHA `353d2d8` 은 실제 worktree HEAD 가 아니었다. 읽고 띄운 기준은 `back-kb-v3-api` @ `27ea2f44`(통합 `c11182b`·`ca23a42` 포함, untracked 리뷰 파일만 있음)다.

## 한 일

1. **계약 대조**: 백엔드 `api/kb_library.py`, `kb_v3_views.py`, `kb_v3_ontology_views.py`, `kb_ingest.py`, `kb_jobs.py`, 테스트를 읽고, 첫 구현의 가정을 실제 응답과 맞췄다. 차이 표는 `src/features/kb/KB_V3_CONTRACT_NOTES.md`.
2. **실연동 환경을 저장소에 준비**(`scripts/kb-live/`): 이 Run 전용 임시 PostgreSQL + 실제 FastAPI 앱 + 시드(실제 ingest·register API) + 응답 기록(`capture.mjs`) + 브라우저 E2E(`e2e_flows.mjs`). 사용법은 `scripts/kb-live/README.md`.
3. **실서버 응답 49건을 기록**(`src/features/kb/liveFixtures/recorded.json`, 308KB)하고 진짜 `kb.ts` 클라이언트와 화면을 그 기록으로 돌리는 시험을 추가했다(`kbLive.test.tsx`). 목업(`kbFixtures.ts`)과 구분해 두었다.
4. **고친 것**(상세는 계약 노트 표): 미지원 판별(`not_found` 문구), ingest 4상태(보류·실패·중복, id null), 처리 현황 서버 필터·페이지·재시도 결과, 부분 완료 사유 문장화, 보류 영구 사유, 문서 상세의 관계·근거·처리 이력·요약 출처·보류 안내, 충돌 상태 6종과 해결 결과(kept_separate+시스템 대체 종결을 "양쪽 모두 옳음"으로 읽히지 않게), 열린 것만/해결된 것 포함 전환, 그래프 이웃 페이지와 후보 관계, 개념 상세의 관계 근거와 문서 이동, 별칭 결과, 메인(처리 오류·보류 목록, 주제별 서버 개수), 품질 진단 실제 값, 의미 검색 꺼짐 안내.
5. **브라우저 E2E 가 찾아 고친 UI 결함**: 지표·필터 그리드가 `container-sm`(640px)을 최소 폭으로 써서 모바일 가로 넘침·데스크톱에서 한 줄씩 쌓임 → 토큰 기반 작은 최소 폭. 별칭이 `tk-badge--mono` 의 대문자 변환으로 값이 바뀌어 보임 → 값 그대로 보이는 태그. 재시도 성공 메시지가 필터된 목록에서 카드째 사라짐 → 드로어에 남김. 모바일 머리글에서 제목이 "지식 도…"로 잘림 → 좁은 폭에서 버튼 글자 축약(접근성 이름 유지). 부분 완료가 "주의"로 세어져 L2 꺼진 서버에서 모든 문서가 경고로 보임 → 실패·보류만 주의.

## 검증(이 Run 에서 실제 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 타입 | `npx tsc -b` | 오류 없음 |
| lint | `npm run lint` | eslint 오류 없음, `ui-lint ok · 위반 138건(기준선 138건 이하, 새로 늘지 않음)` |
| 전체 시험 | `npx vitest run` | `Test Files 152 passed \| 2 skipped`, `Tests 1450 passed \| 10 skipped` |
| 빌드 | `npm run build` | `✓ built in 303ms`, PWA precache 생성 |
| 실서버 E2E (Chrome 154, 헤드리스) | `node scripts/kb-live/e2e_flows.mjs` | 26/26 통과(데스크톱 1280 + 모바일 390, 콘솔 오류 없음, 가로 넘침 없음) |
| 실서버 E2E (WebKit) | `… --engine webkit` | 26/26 통과 |

- 실연동 응답 기준 시험은 `kbLive.test.tsx` 16개(기록된 실제 응답이 모두 계약 검사를 통과하고 화면이 값 그대로 보여 준다). 목업 기준 시험은 `kbV3Flows.test.tsx`(10), `kbRules.test.ts`(6)와 기존 파일 갱신분이다. **목업 응답과 실제 응답을 파일 이름으로 구분한다.**
- E2E 가 거친 플로우(각 크기·엔진): 로그인 → 메인 패널 5개와 개인/회사 선택 UI 없음 → 통합검색(정본 카드·정본 근거 배지·원문 위치 해시 일치) → 자료 추가(파일 2개+URL, 보류·실패·처리 대기 구분) → 문서 상세 4탭 → 보류 문서 → 처리 현황 드로어(보류 필터에 재시도 없음, 부분 완료 재시도 결과) → 그래프(허브→이웃→상세→별칭 추가→문서 이동) → 후보 관계 → 충돌 해결(확인 단계, 결과) → 없는 문서 오류 → 가로 넘침.
- 스크린샷은 이 Run outbox(`kb-e2e-last-chrome/`, `kb-e2e-last-webkit/`)에 있다. 저장소에는 넣지 않았다.

## 미실행·한계 (확정하지 않은 것)

- **ttakkari_browser MCP 는 이 Run 에 노출되지 않았다.** 대신 webapp-testing 스킬이 정한 방식(Playwright)으로 `playwright-core` 를 직접 써서 한 번에 실행했다. 브라우저 launch 실패는 없었고 재시도 루프도 쓰지 않았다. `frontend-design`·`ui-refine-loop` 스킬은 Skill 도구 목록에 없어 호출하지 못했다. 기존 디자인 시스템 토큰·컴포넌트를 따랐고, 렌더 계측은 `ui-lint` 와 E2E 의 가로 넘침 검사, 스크린샷 육안 확인이다.
- `npm run check:layout`(ui-sweep, 5개 폭, stub 서버)은 실행하지 않았다. 이 경로 목록에 `/knowledge-library` 가 없다.
- 실제 iOS Safari·홈 화면 PWA 는 확인하지 못했다(번들 WebKit 만).
- **L2(AI 심층 추출)가 꺼진 환경만 돌렸다.** `ready`·`failed` 작업 실서버 응답, 값 충돌·반대 주장 자동 탐지, 의미 검색 품질(운영 e5)은 확인하지 못했다. 이 환경의 의미 검색은 해시 임베딩이라 엉뚱한 질의에도 결과가 나온다(coverage=`weak`).
- `kept_separate`+`system:revision_supersession` 의 **실제 응답은 만들지 못했다**(리비전 대체로 양쪽 주장이 모두 대체되는 데이터가 필요). 표시 규칙은 목업 시험(`kbRules.test.ts`, `kbV3Flows.test.tsx`)으로만 확인했다.
- 회사(work_only) 자료가 섞인 데이터, 대용량(수백 문서·수천 패시지), 파일 드래그앤드롭의 실제 브라우저 드롭은 확인하지 않았다(드롭은 jsdom 이벤트, 업로드는 file input).
- 백엔드가 `27ea2f44` 이후 달라지면 `capture.mjs` 로 기록을 다시 만들어야 한다. `client.ts` 의 예전 `kbSummary/kbSearch/…`(scope 인자 포함)는 남아 있고 `kbRegister` 만 쓴다. 정리는 후속.

## 백엔드에 넘길 발견 (백엔드는 고치지 않았다)

1. 문서 상세 `conflicts[]` 에 `resolved_by`·`note` 가 없다. 시스템 대체 종결과 사람 종결을 문서 안에서 구분할 수 없다.
2. `GET /conflicts` 에 `entity_id` 필터가 없다(`conflicts_v3` 함수는 받는다). 개념별 충돌 보기가 불러온 목록 안에서만 걸러진다.
3. 부분 완료 작업의 `hold_reason` 과 단계 `error_message` 에 `l2_disabled` 같은 원시 코드가 들어온다. 보류 사유와 같은 필드라 섞인다. 별도 필드(`degradation_reason`)를 권한다. 프론트는 코드→문장 매핑으로 처리했다.
4. 파일이 20개를 넘으면 Starlette 가 앱 오류 모양이 아닌 `400 {"detail":"Too many files. Maximum number of files is 20."}` 를 준다(`ingest_too_many_items` 422 에 닿지 못한다). 프론트는 20건을 미리 막고 이 문구도 문장화했다.
5. 개념 추출 품질(L2 꺼짐, 시드 한국어·영어 문서): 절 제목이 개념이 된다("동작 방식", "최대 중단 허용", "Service Types"). 모호 개념 후보가 노이즈다("Deployment" vs "디플로이먼트의 maxUnavailable", name 0.86·cosine 0.00; "Ingress" vs "Ingress Policy"). 운영 설정(L2)과 다를 수 있어 확인 필요.
6. 영구 보류(`unsupported_legacy_office` 등) 작업을 재시도하면 `requeued:true` 로 받아 주고 같은 사유로 다시 보류된다(패시지 0, 무해). `requeued:false`+사유로 거절하면 UI 가 단순해진다.
7. `POST …/aliases` 가 이미 있는 별칭에도 201(`created:false`)을 준다.
8. `mode=lexical`(다른 조건 없음)은 `lib.search_passages` 경로라 응답에 `matched_entities`·`coverage` 가 없고 나머지 모드와 필드가 다르다. 문서화가 필요하다.
9. 업로드는 파일당 100MiB 를 메모리에 읽고 항목 20개 상한만 있다(총량 상한 없음). 관찰이고 실측하지 않았다.

## 다음 연동 절차

1. 통합자가 백엔드 브랜치를 갱신하면 `scripts/kb-live/README.md` 순서로 백엔드·프론트를 띄우고 `capture.mjs` 로 기록을 다시 만든 뒤 `npx vitest run src/features/kb/kbLive.test.tsx` 로 계약 변화를 본다.
2. 위 백엔드 발견 1·2·3 이 반영되면 프론트의 보정 코드(문서 상세 충돌 중립 문구, 개념별 충돌 클라이언트 필터, 코드→문장 매핑)를 서버 값으로 바꾼다.
3. L2 가 켜진 환경(또는 `kb_l2_adapter` 를 켠 전용 환경)에서 `ready`·`failed` 작업과 값 충돌 탐지를 실서버로 확인한다. 시스템 대체 종결 데이터를 만들어 `kept_separate` 실제 응답으로 표시 규칙을 확인한다.
4. 원요구 E2E 10개는 별도 후속으로 진행한다. 이 작업의 `e2e_flows.mjs` 는 그 출발점일 뿐 10개를 대체하지 않는다.
5. main 병합·배포는 통합자 승인 뒤에 한다.

## 커밋

- 구현 커밋 SHA: `b3438142e4bd6d8fa7d5c021782cf76f40f5b1b8`(이 기록을 덧붙이는 문서 커밋이 그 위에 하나 있다. 최종 HEAD 는 `git log -1` 로 확인)
