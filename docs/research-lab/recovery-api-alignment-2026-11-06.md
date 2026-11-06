# Research Lab 복구·원자료 API 대조

점검일: 2026-11-06 (KST)

## 기준 revision

- Frontend worktree: `front-lab-practical-20261106`, branch `fix/lab-practical-20261106`, 변경 전 HEAD `378239d37670f24f8da78d3b25930d11045eb2ca`
- Backend API 기준: `back-lab-practical-20261106`, `origin/main`과 일치하는 `521f469aeb27a28a897bcac55fa969b1a5c2323e`
- 수정 범위: frontend만. 백엔드 worktree의 기존 미추적 파일은 건드리지 않았다.

## API 계약에서 확인한 복구 조건

- `GET /studies/{study_id}/resume`는 연구의 기록·맥락 snapshot을 읽는다. 실행 작업을 중단 지점에서 이어 실행하는 API는 아니다. 경로는 `back-lab-practical-20261106/src/ttakkari/api/research.py`의 `resume`이다.
- 실행 재시도는 `POST /runs/{run_id}/retry`다. 원본 Run이 `succeeded`, `failed`, `cancelled` 중 하나이고 실행 출처가 `local_measured` 또는 `migrated_v1`이어야 한다. 외부 보고와 진행 중 Run은 재실행 대상이 아니다.
- 재시도는 원본의 configuration, repeat index, seed를 유지해 새 queued Run을 만든다. `environment_snapshot.research_retry.retry_of_run_id`로 원본을 연결한다. 이어달리기/체크포인트 복원은 아니다.
- 배치 후속 Run의 `batch_cancelled`는 시작 전 대기 중 정리된 상태다. `budget_exceeded`는 시간 예산 만료로 현재 Run이 멈추고 뒤 대기 Run도 시작하지 않은 경우다. API 상태값 자체는 모두 `cancelled`여서 화면이 오류 코드의 사유를 함께 설명해야 한다.

## 입력·출력·원자료 연결

- LLM 설정의 입력 `prompt`는 실험 configuration의 `parameters`에 있다.
- `GET /runs/{run_id}`는 `raw_output`, 측정값과 해당 Run에 연결된 `ResearchArtifact`를 반환한다.
- Host GPU 벤치마크 `raw_output.runs[].output_preview`에는 각 응답 앞부분 최대 200자가 저장된다. 전체 생성 응답을 보존하는 필드는 이 경로에서 확인되지 않았다. 화면은 API가 보존한 입력과 미리보기만 표시한다.
- 결과물은 기존 `ArtifactList`로 연결된다. API 계약에 없는 full trajectory 저장 기능은 이번 frontend 작업에서 만들지 않았다.
- REGNA 제안의 가중 종합 점수는 독립 검증 전이므로 화면에 추가하지 않았다.

## Frontend 변경

- Run 상세에서 configuration의 저장 프롬프트와 `raw_output.runs[].output_preview` 응답을 한 섹션에 나란히 읽을 수 있게 연결했다. 원문 미리보기가 없는 경우 빈 데이터를 성공처럼 꾸미지 않고 미저장 상태를 표시한다.
- `batch_cancelled`, `budget_exceeded`, `budget_invalid`를 구분해 설명한다. 배치에서 시작되지 않은 Run과 실행 오류를 같은 실패로 읽지 않도록 한다.
- 관련 변경: `src/pages/research/components/RunDetailDialog.tsx`, `src/pages/research/views/ExperimentMonitorView.tsx`, `src/pages/research/labels.ts`, `src/pages/research/research.test.tsx`.

## 검증과 미검증

- RED: 새 모델 입출력 테스트는 구현 전 `모델 입력과 응답` heading이 없어 실패했다.
- GREEN: `pnpm exec vitest run src/pages/research` → 9 files, 102 tests passed.
- Build/typecheck: `pnpm build` → `tsc -b`와 Vite build 성공. 500KB 초과 chunk 경고가 남았다.
- Backend test 미실행 완료: `uv run pytest tests/test_research_runner_lifecycle.py tests/test_research_v2_api_contract.py -q`가 uv cache 초기화에서 `Operation not permitted`로 종료했다(`/Users/winterholic/.cache/uv`). 같은 체크를 우회하지 않았다.
- 운영 브라우저 미검증: 직전 configured browser 기록에서 `/research`가 로그인으로 이동했고 `/api/auth/refresh`가 401이었다. 로그인 전용 스크린샷은 Research Lab 화면 실측으로 세지 않는다. 이번 변경의 실제 운영 UI 동작도 확인하지 않았다.
