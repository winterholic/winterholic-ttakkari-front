# KB v3 프론트 최신 main 통합 (2026-10-27)

- 위치: `projects/winterholic-ttakkari/front-kb-v3-current-20261027`, 브랜치 `kb-v3/frontend-current-20261027`.
- 부모: KB `14d09f5a2ca35b816490792bfcf4a573a8b689f4` + `origin/main` `b2b36009b6e42124efd552dcd5e33db78d51cf8f`(fetch 기준). merge-base `da9d98d`(KB +3, main +46).
- 원본 `front-kb-v3`(14d09f5, clean)는 건드리지 않았다. backend 폴더 수정·공유 DB 시험 없음(backend 통합은 별도 worker 소유). main push·배포 없음(리드 소유).

## 충돌 해소 1건

- `src/pages/KnowledgeLibraryPage.tsx`만 충돌. 해소는 KB 측(HEAD) 전문 채택.
- 근거: 양쪽이 같은 방향(scope 선택 UI 제거·단일 도서관)으로 수렴했고, KB v3가 그 상위 집합(탐색·그래프·문서·충돌 탭, IngestModal, 처리 현황 드로어)이다. main 측의 단일화 실체는 `Collection.tsx`·`CollectPage.tsx`·`collector.ts`(scope 선택 제거)로, 겹치지 않아 그대로 병합됐다. main 측 페이지 잔재(옛 검색·수집·등록 탭, 삭제된 `Register` 참조)를 살리면 빌드가 깨진다.
- 그 밖 교정 없음. 디자인 재작성·기능 삭제 없음. 구독 CLI·회사자료 정책 변경 없음.

## 검증(이 worktree에서 실제 실행)

| 항목 | 명령 | 결과 |
|---|---|---|
| 타입 | `pnpm exec tsc -b` | 오류 없음(exit 0) |
| eslint | `pnpm run lint` 중 `eslint .` | 오류 없음(ui-lint까지 진행됨) |
| ui-lint | `pnpm run lint` 중 `node scripts/ui-lint.mjs` | 실패. `collector/Missions.tsx` inline-px 1건, `collector/collector.css` undefined-token 2건·child-margin-top 1건. 해당 2개 파일이 `origin/main`과 바이트 동일(해시 대조)이라 main 선행 위반이며, 범위 밖이라 고치지 않았다 |
| 전체 시험 | `pnpm exec vitest run` | `Test Files 160 passed \| 2 skipped`, `Tests 1572 passed \| 10 skipped`. KB 계약 시험 포함(kbLive 16·GraphConflicts 14·kbV3Flows 10·KnowledgeLibraryPage 30·kb 6·kbRules 6·kbV3 6·Collection 3) |
| 빌드 | `pnpm run build` | `✓ built in 488ms`, PWA precache 95 entries |

- 원문 로그: 이 Run outbox `front-kb-current-20261027-logs/01-tsc.log`·`02-lint.log`·`03-vitest.log`·`04-build.log`.
- 기존 14d UI 시험·이전 브라우저 보고는 원 범위에서만 유효하다. 목업 시험 통과를 실브라우저 성공이라고 하지 않는다.

## 미검증·후속(리드 소유)

- 실서버 최신 백엔드 E2E(브라우저): 리드 후속. 이 Run에 브라우저 도구가 없어 실행하지 않았다.
- `npm run check:layout`(ui-sweep) 미실행. `/knowledge-library`가 경로 목록에 없다는 점은 10-25 기록과 동일.
- ui-lint main 선행 위반 4건: main 측 수정 필요.
- 10-25 기록의 미실행 항목 계승: L2 켜진 환경, 운영 e5 의미 검색 품질, `kept_separate`+시스템 대체 종결 실응답, 회사 범위 혼합 데이터, 대용량, 실제 iOS Safari·홈 화면 PWA.
- 중첩 Codex EPERM(L2 문제)은 이 단계 대상이 아니다.
