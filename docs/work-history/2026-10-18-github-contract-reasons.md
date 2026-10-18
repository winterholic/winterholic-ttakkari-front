# GitHub 탐색 프론트: 신규 오류 reason 두 개 반영 (2026-10-18)

브랜치 `feat/github-explorer-20261018`, 기준 HEAD 832cf62. 백엔드 `back-github` HEAD b61057f, `docs/adr/0042-github-explorer.md` §13(프론트 영향 ①②)의 후속이다. 응답 필드는 바뀌지 않았고 reason 값만 새로 생긴다.

## 변경
- `no_account` + `reason: gh_status_failed`(HTTP 503): "연결된 GitHub 계정이 없어요"가 틀린 안내였다. 이제 "GitHub 계정 상태를 확인하지 못했어요"로, 로그아웃이 아니라 gh 상태 조회의 일시 실패임을 알리고 재시도 버튼을 준다. 계속되면 `gh auth status` 확인을 권한다(`gh auth login`은 권하지 않는다). reason이 없거나 모르는 값이면 기존 로그인 안내를 그대로 쓴다.
- `gh_unprocessable` + `reason: ref_resolution_limit`(HTTP 422, resolve 한정): "내용이 너무 크거나"가 틀린 안내였다. 이제 같은 이름으로 시작하는 브랜치·태그가 많아 주소의 ref를 확인하지 못했고(없다는 뜻이 아님), `owner/repo`만 넣어 저장소를 연 뒤 브랜치·태그 목록에서 직접 고르라고 안내한다. 같은 입력은 다시 보내도 같으므로 재시도 버튼은 없고, resolve에는 GitHub URL이 없어 "GitHub에서 열기"도 끈다. reason이 없는 `gh_unprocessable`은 기존 문구와 GitHub에서 열기를 유지한다.
- 수정 파일: `src/features/github/state/errors.ts`(분기), `src/api/githubTypes.ts`(reason 타입 주석). `githubClient.toGhError`는 이미 `detail.reason`을 보존하므로 코드 변경 없이 테스트로 고정했다. `StateView`·`GithubShell`·`TargetInput`은 `describeGhError` 결과만 쓰므로 수정하지 않았다.

## 근거와 불변조건
- 근거: ADR 0042 §13 6번·프론트 영향 문단, `docs/api-contract.md` GitHub 절, `tests/fixtures/github/README.md` 오류 표(back-github b61057f).
- 앱 세션 401 처리(상류 코드는 로그아웃·refresh 안 함), 계정별 쿼리 키 격리, GET 전용 호출은 건드리지 않았다. 기존 테스트가 그대로 통과한다.

## 테스트
- `errors.test.ts`: 두 reason 분기, reason 없음·모르는 값의 기존 문구 유지, reason 없는 `gh_unprocessable` 유지 (4건 추가).
- `githubClient.test.ts`: 두 reason이 status·code·reason 그대로 오류에 담기고 앱 로그아웃이 발생하지 않음.
- `GithubPage.test.tsx`: 계정 목록이 `gh_status_failed`로 실패하면 재시도 안내가 나오고 "계정이 없어요"·`gh auth login`이 없으며 다시 시도하면 선택 화면으로 복구됨. resolve가 `ref_resolution_limit`이면 입력 아래에 직접 고르라는 안내가 나오고 이동하지 않음.
- RED 확인: 수정 전 4건 실패, 수정 후 통과.

## 미완료·미검증
- 실제 백엔드와 실기기 확인은 하지 않았다(전부 mock 응답). 백엔드 §13이 운영에 배포됐는지는 확인하지 못했다.
- `ref_resolution_limit` 때 저장소 화면의 브랜치 목록이 해당 ref를 실제로 보여 주는지(목록 페이지 수)는 확인하지 않았다. 문구는 목록에서 고르라고만 안내한다.
- front main의 미커밋 변경과 검증 브랜치 `verify/github-frontend-20261018`(3102d67)의 검증 테스트 2파일은 이번에 합치지 않았다. main 통합·배포도 하지 않았다.
