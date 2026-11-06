# 수집 충돌 통합 독립 검증 — 2026-11-07

## 판정

후보 `1fa18fd9ebc42caa4e90c4a03125883e264bb03e`의 collector 통합에서 검토 범위 내 실제 회귀나 근거 없는 기능 제거를 찾지 못했다. 원본 프로젝트 필터와 최신 main의 주제·회차·페이지·history·재사용 요청 흐름이 함께 남아 있다. 이는 좁은 코드 통합 판정이며 게시 승인이나 R1–R10 재감사가 아니다.

## 대상과 기준선

- 당시 owner Run API profile 확인은 `회사 코덱스 ai2`였다. Run ID와 이메일은 비식별 처리했다.
- 검증 대상 후보 snapshot: `1fa18fd9ebc42caa4e90c4a03125883e264bb03e`. 이후 branch tip 이동은 docs-only이며 제품·의존성 diff가 없다.
- 최신 main 기준: `a86544548c006c41bb4a9a49ab0cd0ab8a09713e`.
- 독립 감사 제품 기준: `d1b1719ad2559104acf2905b1da9447d885f4eee`.
- 원본 refactor는 후보 작성 뒤 문서 커밋을 포함해 `8c0a28696a7b985abb479971f80fd1c555b3ba98`까지 이동했다. 원본의 `d1b1719..8c0a286` scoped collector 제품 diff는 없다. 후보는 최신 원본 문서 tip을 조상으로 포함하지 않지만, 검증 대상인 제품 변경 범위는 후보와 비교했다.
- 후보의 integration/build 검증 기준 코드 `6d9fc8aa6a53a8009823c55f5fc968640ea9e185` 이후 `src`, `package.json`, `pnpm-lock.yaml` 변경은 없다. 따라서 아래 통합 검증 결과를 후보에 재사용했다.

## 기능 대조

- **프로젝트 필터:** 프로젝트 화면의 검색과 상태 필터, `filterAndSortMissions` 호출이 유지됐다. `coverage` 누락 시 검색과 프로젝트 상세도 안전하게 빈 주제 목록을 사용한다.
- **주제 그룹:** `missionTopics`는 서버가 준 `topic_key`만으로 그룹을 합치며 없으면 미션 ID로 분리한다. 같은 제목만으로 서로 다른 주제를 합치지 않는다.
- **회차:** `runs` 탭이 회차별 trigger, 적재·수집량과 전체 회차 대비 최근 표시량을 보여준다. 회차 수는 topic/mission을 합치는 기준으로 쓰지 않는다.
- **페이지네이션:** `collectionMissions(offset)`가 `limit=100`과 누적 offset을 요청하고, `has_more`를 우선 사용한다. 응답에 `has_more`가 없으면 100개 페이지 크기를 fallback으로 쓴다. 프로젝트/주제/history에서 다음 페이지를 읽을 수 있다.
- **history 제어:** 과거 주제 시도는 `historical`로 전달해 재실행·일시정지/취소·일정·보충·보류 복구 제어를 숨기거나 비활성화한다. 이 제한은 최신 main 구현과 동일하게 유지됐다.
- **재사용 요청:** 생성은 재시도용 `request_key`를 유지하며 main 계약인 `reuse_existing: true`도 함께 보낸다. 테스트 assertion이 두 필드를 함께 확인한다.

## 실행 증거

요청된 범위의 변경과 whitespace를 확인했다:

```text
$ git diff --stat refactor/collect-workspace-20261107..release/collect-workspace-20261107 -- src/features/collector src/pages/CollectPage.tsx src/pages/CollectPage.test.tsx src/api/collector.ts src/api/collectionMissions.ts
7 files changed, 182 insertions(+), 27 deletions(-)

$ git diff --check refactor/collect-workspace-20261107..release/collect-workspace-20261107 -- src/features/collector src/pages/CollectPage.tsx src/pages/CollectPage.test.tsx src/api/collector.ts src/api/collectionMissions.ts
[출력 없음]

$ git diff --quiet d1b1719ad2559104acf2905b1da9447d885f4eee..8c0a28696a7b985abb479971f80fd1c555b3ba98 -- src/features/collector src/pages/CollectPage.tsx src/pages/CollectPage.test.tsx src/api/collector.ts src/api/collectionMissions.ts
d1_to_current_source_scoped_diff_exit=0

$ git diff --quiet 6d9fc8a..1fa18fd -- src package.json pnpm-lock.yaml
exit 0
```

통합 기록의 재사용 검증은 `6d9fc8a` 코드에서 수행됐다. 위 diff로 후보 `1fa18fd`까지 제품·의존성 동일성을 확인했다. 이 세션에서 테스트나 build를 다시 실행하지 않았다.

```text
TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/pages/CollectPage.test.tsx src/features/collector/Missions.test.tsx src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx src/features/collector/missionProjects.test.ts src/api/collectionMissions.test.ts --reporter=dot
Test Files 9 passed (9); Tests 86 passed (86)

TTAKKARI_NO_ENV_FILE=1 pnpm build
✓ built; 95 PWA entries (index chunk 크기 advisory 경고)
```

## 미검증 범위

- 테스트/build 재실행, 브라우저/UI 키보드 확인: 하지 않음 — 통합 SHA와 후보의 제품 diff가 비어 있어 기록된 86 tests/build를 재사용했고, UI는 b916 감사자 소유다.
- 운영 수집 GET/mutation, backend/DB/policy/queue, push/deploy: 하지 않음 — 작업 카드에서 금지했다.
- 현재 source branch의 이후 문서/evidence 반입 여부: 판정하지 않음 — 이번 검증은 collector 제품 충돌에 한정했다.
