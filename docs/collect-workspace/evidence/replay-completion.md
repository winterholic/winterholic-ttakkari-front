# 재생 표본 보완 — 실제 GET 대조

관측 시각은 **2026-11-06 16:40:45.920458 UTC (2026-11-07 01:40:45.920458 KST)**다. `ttk get` owner-authenticated GET만 사용했다. 백엔드 계약 기준은 `5f5cbd997addcb4ea084ab908790f8f6eec54122`, 프론트 검증 대상은 `3d2b30ea5e44f4181170492f614eed91277e52e3`다. 응답 원문은 프로세스 메모리에서만 읽고 allowlist 값만 fixture로 썼다.

## 기존 표본과 실제 consumer 대조

기존 maker의 누락은 세 가지 모두 전처리 단계에서 생겼다.

| 확인점 | 기존 maker | 실제 API / consumer | 판정 |
|---|---|---|---|
| 동일 제목 임무 | 임무 행 번호를 사용해 매 행에 `수집 과제 NN` 부여 | missions GET에서 제목 동치관계 확인 가능. `Missions` 목록은 `id`, `title`, 회차·시각·counts를 사용 | 실제 제목 동치관계가 소실되는 전처리 누락 |
| 출처 | 실제 GET 응답 대신 `sources: {items: []}`를 하드코딩 | GET `/sources` 응답은 `items`, `runtime_enabled`, `ml_spending_enabled`; `SourcesPanel`은 `items`와 `runtime_enabled`, 각 출처의 `id/title/seeds/request/policy/enabled/...` 소비 | 실제 200행이 있는데 maker가 버림. 데이터 부재가 아님 |
| 실행 | 실제 GET은 `/jobs`의 `{jobs, next_cursor}`인데 maker가 `raw_jobs.get('items', [])`만 읽음 | `RunsPanel`은 `jobs`, `next_cursor`; `JobRow`는 `job_id/source_key/status/stage/created_at/last_error`, 상세는 `/jobs/{id}/items`의 `{items,total,limit,offset}` 소비 | 실제 jobs 20행이 있는데 필드명을 잘못 읽어 버림. 데이터 부재가 아님 |

`read_live.py`가 `sources` 응답의 필드명을 바꾸지는 않지만, 기존 replay maker는 sources를 빈 목록으로 교체한다. 기존 maker의 `/jobs` 키 오류와 행별 제목 alias도 실제 응답 계약과 맞지 않는다. 반면 최근 job 8개의 `/items?offset=0`가 전부 0행인 것은 성공 응답의 실제 빈 표본이다. 서로 다른 원인이다.

## 보존한 실제 표본

새 파일 [replay-completion-fixture.json](replay-completion-fixture.json)은 다음을 포함한다.

- missions 21행: 같은 실제 제목에는 같은 익명 제목을 부여했다. 4개 제목 동치 그룹의 크기는 12·3·3·3이다. mission ID는 안정 익명 ID로 서로 구분되고, `run_seq`, 실제 run별 `started_at`·예산·수집/적재 카운트, mission `counts`와 생성/수정 시각을 보존했다. 연결되지 않은 프로젝트 ID나 프로젝트 관계는 만들지 않았다.
- sources 200행: 실제 필드명과 consumer 요구 필드를 보존했다. URL은 호스트·경로 관계가 결정적으로 유지되는 `*.example.test/resource/*` 별칭으로 바꿨다. 제목, source ID/key는 안정 익명화했고 요청/정책의 본문성 필드는 제거 또는 익명화했다. permissions와 수치형 요청 제한 등 화면에서 읽는 값은 유지했다.
- jobs 20행: 실제 `{jobs,next_cursor}` 응답에서 `jobs`를 보존했다. `job_id`와 `source_key`는 sources와 같은 방식으로 변환해 관계를 유지했다. consumer가 읽는 상태·시각·시도·오류·cursor 카운트를 allowlist로 보존했다.
- item detail 10건: review GET의 실제 ID로 `/items/{id}`를 읽었다. 최종 fixture 관측에서는 10건 모두 `dedupe` 객체가 있었지만 `exact_of`와 `cluster_id` 관계값은 없었다. canonical 후보/상태와 algorithm version은 실제 존재한 그대로 보존했다. 첫 생성 관측(16:37 UTC)에서는 10건 중 1건의 `exact_of`가 있었고 후속 갱신(16:40 UTC) 표본에서는 사라졌다. 운영 표본이 시각에 따라 달라질 수 있어 최종 fixture에는 후속 GET 결과만 담았고, 현재 실제 관계값 표본은 미확인으로 기록한다. 없는 관계값은 만들지 않았다.
- jobs의 item 하위 경로 8개: 각 응답은 HTTP 성공(exit 0)이고 `items,total,limit,offset` 필드를 반환했지만 모두 `items=0,total=0`이었다. 이는 해당 8개 작업의 표본 시각 데이터 부재다. review에서 가져온 item detail 표본과 혼동하지 않는다.

목표 미달 정상 종료(succeeded/partial)나 `jobs/{id}/items` 비어 있지 않은 페이지는 이 GET 표본에서 확인되지 않았다. 이를 다른 상태나 mock 자료로 대체하지 않았다.

## 실행 및 응답 행수

실행 명령:

```sh
python3 docs/collect-workspace/evidence/make_completion_fixture.py
```

최종 출력 요약: `exit=0`, `missions 21/21`, `sources 200/200`, `jobs 20/20`, `review 10`, `item detail 10`, `dedupe 객체 10 / exact_of 0 / cluster_id 0`, `job item 페이지 8 / 합계 0행`, `동일 제목 그룹 4`. 최종 fixture의 `evidence.calls`에는 각 GET의 익명 경로, exit code, 실제 응답 키가 기록되어 있으며 원 ID는 기록하지 않는다. 마지막 maker 실행의 목록 GET 네 건, item detail 열 건, item 하위 경로 여덟 건은 모두 exit code 0이었다. maker를 표본 갱신 확인에 세 차례 실행해 detail GET은 회당 최대 10건이었다. fixture는 마지막 실행 결과만 담는다.

실제 필드·행수 요약:

| GET | 실제 최상위 키 | 응답 행수 → 보존 행수 |
|---|---|---:|
| `/missions?limit=50&offset=0` | `items,limit,offset,has_more` | 21 → 21 |
| `/sources` | `items,runtime_enabled,ml_spending_enabled` | 200 → 200 |
| `/jobs?limit=20` | `jobs,next_cursor` | 20 → 20 |
| `/review?limit=10&offset=0` | `items,limit,offset,total` | 10 → 10 (detail ID 선택에만 사용) |
| `/jobs/{id}/items?offset=0` | `items,total,limit,offset` | 8페이지, 페이지마다 0 → 0 |
| `/items/{id}` | `decision,dedupe,...,id,...` | 10 GET → 10 익명 detail |

## 재생 검증과 적용 방법

아래 검증은 새 fixture 자체에 대해 실행한다. fixture에 원 URL, 실제 ID, 제목/목표/본문을 남기지 않고, 모든 URL host가 `example.test` 아래인지 확인한다. 실제 missions GET에서 동치 제목을 같은 alias로 매핑한 뒤 회차/시각/count를 보존하는 maker 로직도 확인한다.

브라우저 후속 적용은 기존 replay fixture를 덮어쓰지 않고 fixture loader/mock에서 `replay-completion-fixture.json`의 `missions`, `sources`, `jobs`, `job_item_pages`, `item_details`를 보완 입력으로 병합한다. 화면 확인은 `/collect` 목록에서 같은 제목의 서로 다른 익명 mission ID, `/collect?view=sources`의 실제 출처 행, `/collect?view=runs`의 실제 job 행을 각각 연다. jobs item 하위 표본이 0행인 것은 해당 표본의 실제 빈 상태로 표현한다. 이 작업에서는 브라우저를 열거나 제품 코드를 바꾸지 않았다.

```sh
python3 -m json.tool docs/collect-workspace/evidence/replay-completion-fixture.json >/dev/null
python3 - <<'PY'
import json, re
p='docs/collect-workspace/evidence/replay-completion-fixture.json'
f=json.load(open(p))
assert len(f['missions']['items']) == 21
assert len({x['id'] for x in f['missions']['items']}) == 21
assert len({x['title'] for x in f['missions']['items']}) == 4
assert len(f['sources']['items']) == 200 and len(f['jobs']['jobs']) == 20
assert all(x['id'] and x['title'] and x['seeds'] and x['request'] and x['policy'] for x in f['sources']['items'])
assert all(x['job_id'] and x['source_key'] and x['status'] and x['stage'] and x['created_at'] for x in f['jobs']['jobs'])
assert all(re.fullmatch(r'https://[a-f0-9]+\.example\.test/resource/[a-f0-9]+', u)
           for x in f['sources']['items'] for u in x['seeds'])
assert len(f['item_details']) <= 10
assert all(x['id'] and isinstance(x['dedupe'], dict) for x in f['item_details'])
assert all('exact_of' not in x['dedupe'] and 'cluster_id' not in x['dedupe'] for x in f['item_details'])
assert f['evidence']['row_counts']['job_item_rows_total'] == 0
print('PASS: JSON, consumer fields, anonymized URLs, row counts, title groups, and detail cap')
PY
```

실제 GET은 관측 시점 snapshot이다. 기존 운영 자료가 바뀌면 새 실행의 행수·상태는 달라질 수 있다. 이 산출물에는 GET 외 요청이 없다.
