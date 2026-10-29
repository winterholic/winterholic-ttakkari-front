# 지식 도서관 v3 프론트: 계약 대조 기록

기준: 백엔드 `back-kb-v3-api` 브랜치 `kb-v3/api-20261025` @ `27ea2f44`(통합 `c11182b` 포함)의 `api/kb_library.py`, `kb_v3_views.py`, `kb_v3_ontology_views.py`, `kb_ingest.py`, `kb_jobs.py` 소스와,
같은 코드를 이 Run 전용 임시 PostgreSQL 위에서 띄운 **실서버 응답**(`liveFixtures/recorded.json`, 49건, 기록 방법은 `scripts/kb-live/README.md`).
설계 문서 §2.6 을 읽고 가정했던 첫 구현(089c8dc)을 이 둘과 대조해 고쳤다. 아래는 첫 구현의 가정이 실제와 달랐던 곳이다.

## 1. 가정이 틀렸거나 비어 있던 곳(고침)

| 영역 | 첫 구현의 가정 | 실제 | 고친 곳 |
|---|---|---|---|
| 미지원 서버 판별 | 라우트가 없으면 `code` 가 `http_404` | 백엔드 오류 핸들러가 FastAPI 기본 404 도 `{code:"not_found", message:"Not Found"}` 로 감싼다. `http_` 접두사는 JSON 아닌 응답에서만 생긴다 | `kb.ts isKbUnsupported`: `Not Found`·`Method Not Allowed`·`Not Implemented` 문구 또는 `http_` 접두사. 앱 404(`kb_*_not_found`)·409·422 는 미지원이 아니다 |
| ingest 항목 | id 는 항상 string, 상태는 등록·중복 | `failed` 항목은 `document_id/revision_id/job_id` 가 모두 `null`, `held` 항목이 있고(`hold_reason`, `hold_message`), 중복도 기존 id 를 돌려준다 | `IngestModal`: 상태 4종을 구분해 표시. 보류·실패를 성공처럼 보이지 않게 하고, 등록된 것이 없으면 "접수했어요"라고 쓰지 않는다. 실패 항목만 입력에 남긴다 |
| ingest 제약 | 제목 필수(글만 올릴 때) | 서버가 본문 첫 줄로 제목을 만든다. 한 번에 20건, 파일 100MiB. 20개 초과 파일은 앱 오류 모양이 아닌 `{detail}` 400 | 제목 필수 제거, 20건·100MiB 사전 차단, 해당 영문 메시지 문장화 |
| 작업 목록 | 클라이언트에서 "진행 중" 걸러냄, `{items}` 만 | `total/limit/offset` 과 서버 `status=active|attention|<상태>` 필터 | `kbJobs` 에 status·offset, 드로어 서버 필터와 "작업 더 보기" |
| 재시도 응답 | 쓰지 않음 | 갱신된 작업 + `retry{requeued, from_stage, reason, reset_stages}`. 실행 중 409 `job_running`, `requeued=false` 가 있을 수 있다 | `requeued=false` 는 "다시 넣지 않았어요: 사유". 필터된 목록에서는 재시도한 작업이 카드째 사라지므로 결과를 드로어 위쪽에도 남긴다(실서버 E2E 에서 발견) |
| 부분 완료 사유 | 사유 코드 없음 | `degraded` 작업의 `hold_reason` 과 단계 `error_message` 에 `l2_disabled` 같은 코드가 그대로 온다 | `codeText`/`stageNote` 로 문장화. 부분 완료는 오류 목록·헤더 "주의"에서 뺐다(L2 가 꺼진 서버에서는 모든 문서의 정상 결과) |
| 보류 재시도 | 모든 보류에 재시도 | 영구 사유(`ocr_required`, `unsupported_*`, `stt_runtime_unavailable`)는 재시도해도 같은 사유로 다시 보류(실서버 확인: requeued=true → held, 패시지 0) | 영구 사유는 재시도 버튼 대신 안내 |
| 문서 상세 | 개념·주장·충돌·요약 정도 | `relations[]`(확정·후보, 근거 인용), `history[]`(처리 이력), `summary_source`, `domain_source`, `source`, `pipeline_status`, 리비전별 `pipeline_status`·`published_at`. `conflicts[]` 는 해결된 것도 오고 `resolved_by` 는 없다 | 관계·근거, 처리 이력, 요약 출처("AI 요약 아님"), 자동 분류 표시, 보류 문서 안내, 충돌 상태 라벨 |
| 요약 | 모델 요약일 수 있음 | 정본 정의 또는 본문 첫 문단 앞부분(extractive) | "AI 가 쓴 요약이 아니에요" + 출처 라벨 |
| 충돌 상태 | `open` 만 다룸 | 상태 6종, `resolved_by`(`system:revision_supersession` 등), `kept_separate` 는 상충 주장에서 "어느 쪽도 채택하지 않고 종결"(시스템이 새 버전으로 양쪽을 대체한 경우 포함) | `conflictStatusText`: kept_separate+시스템 종결을 "양쪽 모두 옳음"으로 읽히지 않게 표시, 자동 종결 배지, 열린 것만/해결된 것 포함 전환, 더 보기 |
| 충돌 종류 | 3종 | `version_divergence` 추가. 모호 개념은 병합/분리, 상충 주장은 A/B/둘 다 유효만 허용(그 밖은 422 `kb_resolution_not_applicable`) | 종류 필터·라벨, 종류별 해결 선택지 |
| 그래프 | 이웃은 한 번에 30개 | `offset`/`has_more`/`total_neighbors` 로 페이지, `hops>1` 은 1로 응답, 후보 관계는 `include_candidates=true` 일 때만(`candidate`, 낮은 가중치) | 이웃 더 불러오기, 후보 관계 토글(점선·후보 배지, 주소 `cand=1`) |
| 개념 상세 | 관계 근거 없음 | 관계에는 근거 개수만 있고 인용은 1-hop 그래프 에지의 대표 근거에 있다 | 같은 개념의 1-hop 그래프(limit 100)에서 근거 인용을 가져와 관계마다 표시, 원문 위치·문서 이동 |
| 별칭 추가 | `{alias, relinked_count}` | `{alias{alias,lang,source}, relinked_count, created}`(이미 있으면 `created:false`, 201), 다른 개념의 표기는 409 `kb_alias_belongs_to_other_entity`, 짧으면 422 `alias_too_short` | 이미 있음·재연결 수·오류를 서버 응답대로 안내 |
| summary | `counts` 만 | `pipeline{…}`, `v3{relations_candidate, single_passage_documents, documents_without_pipeline_job, embedding_coverage}`, `access.view="unified"`, `retrieval.enabled` | 현황 칩, 후보 관계 수, 품질 진단 실제 값, 의미 검색이 꺼진 서버 안내 |
| 문서 목록 | 클라이언트 정렬, 주제 slug 4개 | 서버가 `updated_at` 내림차순, `pipeline_status` 서버 필터(`active|attention|none|<상태>`), 주제 5개(`science` 추가), `domain_source` | 정렬 제거, 상태 필터 확장, 주제별 개수는 `domain` 필터 `total` 로 센 서버 값 |
| 주제·개념 domain | 주제 slug 만 | 개념 자체 domain 은 `dev·infra·ai…` 로 slug 와 다르다 | `domainLabel` 이 둘 다 변환 |
| 검색 | 항상 정본·coverage 있음 | `mode=lexical`(다른 조건 없음)은 단어 검색 결과만 주고 `matched_entities`·`coverage` 가 없다. 엉뚱한 질의도 결과를 주고 coverage=`weak`. 항목에 `canonical_facts`, `conflict_warning` | 없을 때 깨지지 않게 처리, 정본 핵심 사실 표시 |

## 2. 계약에 없어서 프론트가 하지 않는 것

- 원본 파일 다운로드(서버 응답에 `source.locator` 뿐). 웹 문서는 원래 주소 링크만 보여 준다.
- 품질 진단 중 해시 무결성 일괄 검증과 E0/v3 평가 요약(API 없음): "서버 미지원" 배지로 둔다. 개별 근거의 해시 일치는 원문 위치 보기에서 확인한다.
- `GET /conflicts` 에 개념 필터가 없어서 개념별 충돌 보기는 불러온 목록 안에서만 거른다(그렇다고 화면에 밝힌다).
- 문서 상세 `conflicts[]` 에는 `resolved_by` 가 없어서, 문서 안에서는 시스템 종결과 사람 종결을 구분하지 못한다. 중립 문구("양쪽이 옳다는 뜻은 아니에요")만 쓴다.

## 3. scope(개인/회사) 처리

- 화면에서 개인/회사 전환 UI 를 없앴고 `scope` 쿼리를 보내지 않는다. 접근은 서버 `kb_access` 가 정한다(웹 세션은 개인 세션 기준 global 가시성). `summary.access.view` 는 `unified`.
- 예전 주소 호환: `?scope=` 는 읽지 않고 이후 주소 갱신 때 지운다. `view=search|add` 는 지식 탐색으로, `view=collect` 는 `/collect` 로 이동한다.
- v3 숫자가 없는 서버(`counts.entities` 없음)는 "개인 범위만일 수 있다"고 알린다.
- Collector 고급 관리는 `/collect` 로 이동해 있고, 문서·처리 탭에 "외부 자동 수집기 관리 →" 링크가 있다. `Collection.tsx`, `Quality.tsx`, `scope.ts` 는 `CollectPage` 가 쓰고 있어 건드리지 않았다.

## 4. 검증 범위

- 실서버(전용 임시 PG, 해시 임베딩, L2 꺼짐) 위에서 Chrome 과 WebKit, 데스크톱 1280·모바일 390, 핵심 플로우 13단계 × 2크기 × 2엔진 통과. 상세와 미실행은 `docs/work-history/2026-10-25-kb-v3-live-contract.md`.
- **검증 못함**: L2 가 켜진 환경(`ready`·`failed` 작업, 값 충돌 자동 탐지 품질), 의미 검색 품질(운영 e5 모델), 시스템 대체 종결(`kept_separate`+`system:revision_supersession`)의 실제 응답(목업으로만 확인), 실제 회사 범위(work_only) 자료가 섞인 데이터, 대용량·다수 페이지.
