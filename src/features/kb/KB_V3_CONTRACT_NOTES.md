# 지식 도서관 v3 프론트: 계약 가정과 차이 기록

기준: 백엔드 설계 `back-kb-refactor-design` @ `0c9067b`, `docs/design/kb-v3/knowledge-library-refactor.md` §2.6(API 계약), §5(화면).
상태: **백엔드 v3 미구현. 이 프론트는 계약 문서만 보고 만든 것이고 실제 백엔드와 연결해 검증하지 않았다.** 연결되면 아래 표를 기준으로 `src/api/kb.ts`, `src/api/kbTypes.ts` 를 교정한다.
계약에 모양이 적혀 있지 않아 가정한 필드는 타입에서 optional 이거나 주석에 "계약에 없음" 이라고 적었다. `as any` 로 덮은 곳은 없다.

## 1. 모양을 정하지 못해 가정한 곳

| 엔드포인트 | 계약이 말한 것 | 프론트가 가정한 것 | 틀리면 |
|---|---|---|---|
| `GET /summary` | 기존 counts + `entities, assertions, relations, open_conflicts, pipeline_running, pipeline_failed` | 신규 숫자는 `counts` 안에 온다. `counts.entities` 가 숫자면 v3 서버로 본다(`isKbV3Summary`) | 위치가 top-level 이면 v3 감지·현황 칩·처리 배지가 모두 꺼진다. 개인 범위 경고가 계속 뜬다 |
| `GET /jobs` | 작업 목록, `current_stage`, `stages[]`, 메트릭, 실패/보류 사유 | `{items: KbPipelineJob[]}`. 작업 필드는 §2.3 DDL 컬럼명(`status, current_stage, hold_reason, error_code, error_detail, metrics, attempt_count, max_attempts`). `stages[]` 는 `{stage, status, duration_ms, error_message}` | `items` 가 아니면 `KbContractError` 로 화면에 오류가 난다(빈 성공 아님) |
| `GET /jobs` 제목 | 없음 | `document_title` 이 있으면 제목, 없으면 `문서 <id 앞 8자>` | 제목 필드가 필요하다 |
| `GET /jobs` 정렬·필터 | `status, document_id, limit` | 최신순으로 온다고 가정. 처리 현황 드로어의 "진행 중" 필터는 불러온 50건 안에서만 거른다 | 서버 정렬·`active` 필터가 필요하다 |
| `POST /jobs/{id}/retry` | `{from_stage}` → 재큐잉된 작업 | 응답은 쓰지 않고 목록을 다시 읽는다 | 없음 |
| `POST /ingest` | 응답 `items[]` 는 성공 항목(`document_id, revision_id, job_id, status`) | 항목별 실패는 `error`, 표시 이름은 `name` 으로 올 수 있다고 optional 처리. 중복은 `status: "duplicate"` | 항목별 실패·중복 표현이 계약에 필요하다 |
| `GET /search` | `matched_entities[]`, item 별 `section_path, page_no, slide_no, time_start_ms, assertions[], has_conflict`, coverage(§2.5) | `matched_entities`·`coverage` 는 top-level. `section_path` 는 배열과 `"A > B"` 문자열 둘 다 받는다 | 위치가 다르면 정본 카드·약한 근거 안내가 안 나온다 |
| `GET /search` 매칭 경로 | §5.2 는 배지(어휘·의미벡터·정본근거·1-hop)를 말하지만 응답 필드가 없다 | `match_paths: ("lexical"\|"vector"\|"canonical"\|"hop1")[]` 가 있으면 배지로 보여 준다. 없으면 배지를 그리지 않는다 | 필드명 확정이 필요하다 |
| `GET /search` 페이지 | `limit` 만 있다 | 기존처럼 `offset`, `has_more` 를 쓴다. `has_more` 가 없으면 `items.length >= limit` 로 판단 | 커서 방식이면 "결과 더 보기"가 틀린다 |
| `GET /search` 모드 | `mode=hybrid` | `hybrid`(기본)·`lexical`·`vector` 를 보낸다. 설계 §5.2 의 3가지 | v3 이전 서버에 `vector` 를 보내면 422 일 수 있다 |
| `GET /documents` | `q, domain, pipeline_status, limit, offset`, 행에 `pipeline_status, entity_count, assertion_count` | 행에 `domain`, `source_kind` 도 온다고 optional 로 읽는다. 정렬 파라미터가 없어 "최근 자료"는 불러온 30건 안에서 `updated_at` 내림차순 | 서버 정렬(`sort=-updated_at`) 필요 |
| `GET /documents/{id}` | 문서 상세 + 패시지 + 엔터티·주장·충돌 + 리비전 이력 | 필드명 `entities, assertions, conflicts, pipeline, summary, domain` 가정. 패시지에 `section_path, page_no, slide_no, time_start_ms, chunk_kind`. 없으면 "서버가 아직 주지 않아요"로 표시(빈 목록과 구분) | "요약"·"원본 다운로드"는 계약에 없다. 원본은 `source.locator` 링크만 보여 준다 |
| `GET /ontology/graph` | `{nodes, edges, center_entity_id, total_entities}` | 노드 `{id, name, entity_kind, document_count, assertion_count, has_open_conflict}`, 에지 `{source, target, predicate, weight?}`(`id` 없으면 `source｜predicate｜target`). 초기 30개, 허브 메인은 12개 | 필드명 확정 필요. `has_open_conflict` 는 설계 §5.2 의 이름 |
| `GET /ontology/entities/{id}` | 메타, 별칭, `canonical`, 주장+근거, 1-hop 관계, 문서, 열린 충돌 | `{aliases:[{alias,lang}], canonical:{summary,key_facts}, assertions:[{…evidence:[{passage_id, quote}]}], relations:[{predicate,direction,entity_id,name}], documents:[{id,title}], conflicts:[]}` | 필드명 확정 필요 |
| `POST …/aliases` | 응답 "추가된 별칭 및 재연결 결과" | `{alias, relinked_count?}` | 재연결 결과 표현 확정 필요 |
| `GET /conflicts` | "상충 주장 쌍(각 주장의 원문 인용·문서·리비전·발행일)과 모호 엔터티 쌍" | 항목 `{id, kind, status, entity_id, entity_name, claim_a, claim_b}` 또는 `{entity_a, entity_b}`. 주장 `{assertion_id, text, quote, document_id, document_title, revision_id, rev_no, published_at}` | 두 쪽 중 하나라도 없으면 해결 버튼 없이 오류로 표시 |
| `POST …/resolve` | `{resolution, note}` → "갱신된 정본 요약 및 충돌 상태" | `{status, canonical?:{summary}}`. 응답은 안내 문구에만 쓴다 | 없음 |
| 주제(`domain`) 값 | 허용 목록 없음 | 설계 §5.2 분류명을 임시 slug 로 썼다: `dev-infra, ai, security, business` (`labelsV3.ts DOMAINS`) | 실제 값으로 교체 |
| 서버 필터 밖 | 계약에 `source_kind`/기간/출처 필터 없음 | 유형·출처 주소·기간은 **불러온 결과 안에서만** 거르고 화면에 "불러온 N건 중"으로 밝힌다 | 서버 파라미터가 생기면 `kbState.ts matchDocument/matchHit` 을 서버 쪽으로 옮긴다 |
| 품질 진단 | §5.2 는 통짜 패시지, 임베딩 커버리지, 해시 무결성, E0/v3 평가를 말하지만 API 가 없다 | 임베딩 색인 범위만 기존 `summary.retrieval(indexed/total)` 로 계산. 나머지 3개는 "서버 미지원" 배지 | 진단 API 필요 |

## 2. scope(개인/회사) 처리

- 라이브러리 화면의 개인/회사 전환 UI 를 없앴고 `scope` 쿼리 파라미터를 보내지 않는다(계약: 생략 시 통합). 모든 query key 는 scope 없이 단일(`["kb-summary"]`, `["kb-documents", …]` 등).
- 기존 주소 호환: `?scope=` 는 읽지 않고 이후 주소 갱신 때 지운다. `view=search|add` 는 지식 탐색으로, `view=collect` 는 `/collect` 로 이동한다(`scope=work` 는 `/collect` 로 그대로 넘긴다, 수집 쪽이 아직 쓰고 있다).
- **v3 서버가 아니면 목록이 개인 범위만일 수 있다.** summary 에 v3 숫자가 없으면 "회사 범위 자료가 빠졌을 수 있다"는 경고를 띄우고 "통합"이라고 쓰지 않는다. 숫자를 지어내지 않는다(없는 칩은 그리지 않는다).
- 사용자 owner UI 통합과 에이전트 보안 경계(`work_only` 비노출)는 이 작업 범위가 아니며 백엔드 소관이다.

## 3. 설계와 다르게 한 곳

- `src/features/kb/scope.ts`, `Collection.tsx`, `Quality.tsx`, `labels.ts` 는 **지우거나 바꾸지 않았다.** `CollectPage.tsx`(수집 플랫폼 리팩토링 중, 수정 금지)가 `useKbScope`, `SourcesPanel`, `RunsPanel`, `QualityPanel`, `failure` 를 쓴다. 설계 WBS 의 "scope.ts 단일화·CollectPage 스위치 제거"는 수집 리팩토링 쪽에서 맞춰야 한다. `labels.ts` 는 `failure()` 에 미지원·계약 오류 분기만 더했다.
- `src/api/client.ts` 의 예전 `kbSummary/kbSearch/…` 는 남아 있다(독점 편집 범위 밖). 새 화면은 쓰지 않는다. 정리는 후속.
- 설계 §5.2 의 "우측 슬라이드오버"는 디자인 시스템에 없어(`Dialog` drawer 는 모바일 세션 목록 전용) 모달로 열었다.
- 탭 이름: 지식 탐색 / 개념 그래프 / 문서·처리 / 충돌·품질. 새 탭 id 는 `explore, graph, docs, conflicts`(`view` 파라미터). `docs` 는 기존 주소와 같다.
- 설계 `Register.tsx` 는 `IngestModal.tsx` 로 대체했다. 서버가 `/ingest` 를 모를 때(404 `http_404`)에 한해, 글만 올리는 경우 기존 `POST /documents` 저장으로 내려가는 버튼이 있다. 자동 처리는 되지 않는다고 화면에 밝힌다.
- 메인(검색어 없음)에 최근 자료, 주제별 분류, 주요 개념·관계, 처리 현황을 두었다. 설계의 4탭 구성에는 없지만 사용자 원 요구(최근·자동 분류·관계)를 잃지 않으려는 배치다. 주제별 분류 숫자는 불러온 30건 기준이라고 화면에 쓴다.

## 4. 검증 범위

- 검증함: `tsc -b`, `vite build`, `eslint`, `ui-lint`, 전체 vitest(컴포넌트 상호작용, 오류·복구, 미지원 표시, 와이어 형식 fetch 스텁).
- **검증 못함**: 실제 백엔드 연동(백엔드 v3 미구현), 실제 브라우저 화면 확인(데스크톱·모바일 스크린샷). 이 Run 에는 `ttakkari_browser` MCP 가 노출되지 않았다.
