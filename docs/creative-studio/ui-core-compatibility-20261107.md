# Creative Studio UI ↔ Core 최소 호환 계약 (2026-11-07)

이 문서는 UI에서 관측한 실제 계약과 core에 필요한 최소 확장을 분리한다. backend 소스와 실제 API를 읽기만 했으며 이 저장소에서는 수정하지 않았다. `지원`은 backend 소스에 존재하는 API를 뜻하고, 실제 실행 여부는 별도 표기한다.

## 현재 UI 연결

- 계획 생성·상세·장면/길이 수정·승인, 제작 자산 생성/업로드, 제작 dispatch/render, 실패 구간 재시도는 기존 클라이언트 경로에 연결했다.
- 제작 상세의 `quality_report`, `review_execution`, `repair_plan`, `history`를 읽는다. review, repair-plan, repair를 실제 서버 API에 연결한다. 수리 응답 `applied_needs_approval`은 신규 승인 안내로 연결하며 승인/렌더를 자동화하지 않는다.
- 계획 장면의 `shots`, 전략, 이유와 구간별 시간을 타임라인/스토리보드로 보여준다. 서버가 제공한 최종 영상 링크는 revision 비교에 사용한다.
- UI는 서버가 응답하지 않은 데이터나 fixture QA를 실제 성공으로 대체하지 않는다. 장면별 이미지 미리보기 링크가 없으면 지원되지 않는다고 표시한다.

## UI 관측 기준 지원 계약

| 여정 | 소스에서 확인한 API/필드 | 범위와 한계 |
|---|---|---|
| 제작 및 QA | `GET /plans/{id}/production`의 상태, 구간, `quality_report` | machine/semantic/viewing 판정은 별도 표시한다. 성공 상태만으로 시청·내용 QA PASS라 하지 않는다. |
| 검수 요청 | `POST /production/review` body `{revision}`만 허용 | 기본 상태 `not_connected/unknown`. 독립 evaluator/receipt/independent 입력을 보내지 않고, semantic/viewing은 unknown 유지. |
| 재시도 | `POST /production/render` 및 failed segment 상태 | 전체 실패/실패 구간 재시도는 노출한다. 특정 장면만 재생성하는 전용 API는 확인되지 않았다. |
| 부분 수정 | `POST /production/repair-plan`, `POST /production/repair` | caption `title`/`narration`을 적용하면 `applied_needs_approval`과 새 revision을 받는다. 고정 producer caption, 음성 자산이 있는 narration, 모션/캐릭터 편집은 blocked. 새 revision을 명시 승인한 뒤 기존 `/production?caption_mode=...` dispatch와 `/production/render`를 호출한다. source dispatch의 caption mode를 유지한다. |
| revision 전후/과거 문구 | `GET /production/revisions/{revision}` scenes/repairs | snapshot·changes.before/after·결과/구간 SHA·run key를 읽는다. 비교 대상 revision의 scene snapshot 또는 `repairs[].changes[].before`에서 같은 target의 caption 이전 문구를 골라 초안으로 불러올 수 있다. 과거 텍스트 재적용도 새 revision 수리→명시 승인→dispatch/render이며, 전체 rollback은 없다. |
| 결과 미디어 링크 | `POST /production/result-link` body `{revision,result_id}` | final 또는 기록된 segment에 대해 revision/result id/SHA에 묶인 임시 URL을 받고 영상으로 연다. scope/meta mismatch는 거부한다. 기존 `/production/media-link` 경로는 유지한다. |
| 엔진 근거/스토리보드 | scene `strategy`, rationale, `shots`, segment timing | 값이 있는 범위에서 계획 타임라인으로 표시한다. 실행 기록/엔진 결과를 계획 근거처럼 꾸미지 않는다. |
| 장면/최종 영상 링크 | final/segment 결과 링크 지원; scene 이미지 preview link 미확인 | 영상 결과 링크와 scene asset preview 계약은 서로 다르다. scene preview는 현재 숨기고 미지원 안내한다. |
| 업로드/요구조건 | scene/music 자산 업로드 지원; 임의 brief 첨부·사용자 지정 QA 목표 필드 미확인 | 자유 첨부 업로드 또는 임의 quality objective를 보내는 호출을 만들지 않았다. 생성된 rubric을 서버 근거로 보여준다. |
| 자연어 수정 | plan patch로 구조화 scene 필드·duration 수정 가능 | 자연어 instruction을 해석해 plan/결함을 갱신하는 API는 확인되지 않았다. |

## Core 요청: 최소 확장안

1. **Brief attachment**: plan create/update에 `attachments[]` (`id`, `kind`, `name`, `mime_type`, `size`, 서버 관리 `asset_id`)를 수용하고, 목록/다운로드는 권한 검증된 link API로 제공한다. 원시 파일을 plan JSON에 넣지 않는다.
2. **사용자 품질 목표**: plan create/update에 `quality_objectives[]`를 저장하고 production `quality_report.rubric`에서 요청 목표와 실제 검사 결과/미지원 사유를 연결한다. 목표를 검사하지 않았으면 `unknown`으로 둔다.
3. **장면 미리보기**: scene/shot별 `preview_link`를 서명/권한 검증된 media-link API로 요청할 수 있게 한다. 미리보기 없음은 명시적 `unavailable` 사유를 제공한다.
4. **자연어 수정**: `POST /plans/{id}/revision-intent`에 `{revision, instruction}`을 받고, 변경 전후 diff, 영향 scene/segment, 차단 이유, proposal hash를 반환한다. 별도 사용자 적용 전에는 저장/렌더하지 않는다.
5. **복원**: `POST /plans/{id}/restore`에 `{current_revision, source_revision}`을 받고 optimistic revision 확인 후 새 revision을 만든다. 과거 revision을 덮어쓰지 않는다.
6. **장면 재생성**: `POST /production/scenes/{scene_id}/retry`에 revision, 원인 defect IDs, proposal hash를 받고 영향 장면/구간과 보존 범위를 응답한다. 기존 render gate와 비용/승인 조건을 그대로 적용한다.

기존 서버는 `shots`/전략/이유, revision별 scene/changes snapshot, final/segment 결과 링크를 제공하므로 UI의 현재 스토리보드·결과 비교에는 추가 backend 확장이 필요하지 않다. Core가 다른 API 이름이나 payload를 선택하면 UI와 OpenAPI 계약을 맞춰야 한다.

## 실 API 계획 관측

승인된 `Kafka 메시지 흐름`, 16초, 16:9 brief로 실제 plan `3bf9f754-0039-4fe3-a771-e137b9235068` 생성 및 조회를 했다. API는 4 scene, 480 frames를 만들었지만 `render_gate=false`였다. 응답에 `필수 능력이 없어 지금은 제작할 수 없습니다`, `의도가 확인되지 않았습니다(단어 힌트 초안)` blockers가 있었고, 요구 능력 `research.fact_check`, `research.map_data`가 충족되지 않았다. 이 gate를 우회하거나 성공 렌더로 표현하지 않았다. 실제 production/review/repair는 실행하지 않았다.

## core 인계 채널

이 런에서는 형제 worker 직접 메시지 경로가 404였다는 기존 기록이 있어 본 계약 문서로 공유한다. 현재 consumer 메시지 수신 여부는 확인되지 않았다. backend 소유자(core `d93c9153-076c-4479-9a65-3b61de244221`)가 계약과 우선순위를 검토할 수 있도록 저장소 문서로 남긴다.

## Stage 2 UI 후속 관측 (2026-11-07)

- 과거 caption 문구 선택 UI는 revision scenes snapshot뿐 아니라 `repairs[].changes[].before`도 소스로 표시한다. 선택은 draft 입력만 바꾸며 새로운 repair-plan과 명시적 `updates`가 필요하고, 응답 후 새 revision 승인과 render도 별도다. 이는 기존 Stage 2 API 필드 사용으로, 범용 restore/rollback 계약 추가를 뜻하지 않는다.
- final/segment result-link로 기록된 성공 구간 MP4를 열 수 있다. 이는 scene image/thumbnail preview API가 있다는 뜻이 아니며 이미지 미리보기는 계속 미지원이다.
- 승인 브라우저의 새 클릭 검증은 synthetic fixture에 한정된다. runtime deploy revision은 확인되지 않았고 정상 backend 세션은 개발 origin에서 `/api/auth/refresh` 및 `/api/health` CORS 오류가 있어 미검증이다. 세부 요청·응답은 `ui-integration-evidence-20261107.md`의 Stage 2 후속 섹션을 참조한다.
