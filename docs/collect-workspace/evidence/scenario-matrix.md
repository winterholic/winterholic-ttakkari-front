# 운영 시나리오 매트릭스

관측: `ttk get` owner-authenticated GET; timestamp와 request summary는 `live-aggregate.json`. Evidence는 개인정보·제목·요청문·본문·URL·출처 키를 익명화했다. Mission list `limit=50, offset=0, has_more=false`; trace 21/21 성공. 계약은 작업 카드 지정 SHA `5f5cbd997addcb4ea084ab908790f8f6eec54122`에서 읽었으나, 최종 확인 시 로컬 `origin/main`은 `529022861120e86f80400ffaec53dd3f3f7f81c6`로 이동해 있었다. 지정 SHA의 deploy reservation은 `testing`, 직전 `efe07c4b`는 `succeeded`; serving generation은 미확인.

| 시나리오 | 판정 | 실제 근거 |
|---|---|---|
| 동일 제목 | 있음 | 21건 중 제목 fingerprint 추가 중복 17행(고유 fingerprint 4종). 제목 원문은 저장하지 않음. |
| 적재 0 | 있음 | `counts.imported=0` 및 trace documents=0인 임무 14건: running 12, cancelled 1, failed 1. failed ID `anon-65389518f233a4117bb2`; 다른 ID/시각은 `live-aggregate.json`. |
| 장기 대량 | 있음 | discovered 69,851: `anon-21eee7a431745b22e649` (run_seq 3, cancelled); 25,756: `anon-ae9aa200cca10ae849b7` (seq 1, cancelled); 38,468: `anon-45c75a1a81b464aabf54` (seq 1, cancelled). |
| 종료 후 요구 부족 | 실데이터 확인 불가 | 21 mission 중 succeeded/partial 없음. 취소/실패는 완료 후 부족 시나리오를 대신하지 않음. |
| 정책·실패·대기 | 있음 | 전역 job counts: policy_blocked 55, queued 142, running 1, failed 33. Summary 최근 waiting 10행은 policy_blocked. Mission trace에서도 실패 job 존재. |
| 대량 검토 | 있음 | `/review` total 2,310; 한 페이지 최대 50행. `/review/audit?per_group=2` 전체 sample_count 468, first-reason 종류 11개. 비식별 fixture는 audit item 10행과 reason별 aggregate만 보존. |
| 여러 회차 | 있음 | run_seq 3 `anon-21eee7a431745b22e649`; seq 3 `anon-5b48f9352f43548b87ee`; seq 6 `anon-65389518f233a4117bb2`. |
| 보충·재시도 후 보존 | 실데이터 확인 불가 | 사용자 상태 변경 금지로 보충·retry 호출을 하지 않음. run history는 보이지만 이 실행으로 만든 전후 인과를 확인하지 못함. |

## 기능 접근·호출·보존 확인표

| 기능 | 읽기 확인 | 상태 변경 호출 | 보존 기준/미검증 |
|---|---|---|---|
| 수집 내역 | `/missions?limit=50&offset=0`, 각 `/missions/{id}` | create 미실행 | mission ID/title/goal/status/plan/counts/run history 및 job 연결 유지 |
| 계획 | mission detail의 plan/coverage 및 `/missions/plan` 계약 | 운영 POST 미실행; 계획 화면은 local replay sample | plan, budget, requirements, schedule; preview 응답은 production 실행 근거 아님 |
| 자동 수집·보충 | `/sources`, `/jobs`, trace stages/results | run/supplement 미실행 | collector job/item/delivery 원장 재사용; 변경 전후 연결 미검증 |
| 출처·권리 | `/sources`, trace targets/rules, item rights | source 등록/policy 변경 미실행 | URL/source identity는 fixture에서 제거; rights permission/purposes는 item schema로 확인 |
| 검토 | `/review` 50행, `/review/audit`, `/items/{id}` | accept/reject/hold/reprocess 미실행 | review history, status, reason codes, audit strata 유지 |
| 품질 | `/quality`, `/budgets` | train 미실행 | quality/training gate counts와 budget 모델 유지 |
| 재시도 | detail runs, trace jobs | retry/rerun 미실행 | 새 run_seq와 기존 run/item/delivery의 lineage 보존 검증은 불가 |
| 일시정지 | `/runtime`, mission status | pause/resume 미실행 | paused/reason/since 및 사용자 stop 상태 보호 |
| 주기 | mission `plan.schedule` | schedule 변경 미실행 | 수동/주기 값과 schedule-trigger history 보존 |
| 온톨로지 | trace ontology documents/states | ontology stage mutation 미실행 | document ID distinct count와 KB stage/status 행 단위를 분리 보존 |

정확한 응답/집계와 ID는 `live-aggregate.json`, 로컬 replay용 비식별 응답은 `replay-fixture.json` 참조. 이 표의 “실데이터 확인 불가”는 기능 부재가 아니라 관측 범위에서 증거를 얻지 못했다는 뜻이다.
