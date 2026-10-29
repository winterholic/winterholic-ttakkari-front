# 지식도서관 v3 UI 미통합 복구

현재 main `c72ed11`에는 구 검색·문서·등록·수집 페이지가 남아 있었다. v3 구현 `000c2556`은 main의 조상이 아니었으며 별도 작업 브랜치에만 있었다. 사용자의 전체 미완료 작업 재개 지시에 따라 해당 구현을 최신 main에 병합했다. 기존 dirty main 작업트리는 변경하지 않았다.

자료 추가(파일·URL·텍스트), 처리 타임라인, 지식 탐색, 정본·근거, 개념 그래프, 충돌·품질을 복원했다. collector의 기존 lint 교정 `db5f64fa` 중 제품 2파일을 재사용했다. 390px 실제 화면에서 개념 상세가 목록 아래 y=2050에 밀린 것을 관측해 좁은 화면에서 상세를 먼저 배치했다. 정적 프로덕션 미리보기에서 동일 상세 y=295, 폭 358px을 확인했다. 이웃 목록은 유지한다.

검증은 이 작업트리에서 실행했다.

- `TTAKKARI_NO_ENV_FILE=1 node_modules/.bin/vitest run`: 161 passed / 2 skipped 파일, 1579 passed / 10 skipped 테스트. 이 실행은 마지막 CSS 순서 변경 전이며 행동 코드는 이후 변경하지 않았다.
- `TTAKKARI_NO_ENV_FILE=1 npm run lint`: `ui-lint ok`, 기존 baseline 138 이하.
- `TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:8799 npm run build`: exit 0. API 주소는 시험 dist에만 적용하며 배포 환경값은 변경하지 않았다.
- configured browser: 현재 통합 백엔드와 Run 전용 DB(port 53763, Run marker/role/database 검증), L2 disabled/hash embedding 환경. 공개 시험 자료 10단계 등록 HTTP 200/201. 1280x720 홈, 390x844 홈·개념 선택·상세·자료 추가 창을 실제 클릭했다. 프로덕션 미리보기 콘솔 errors 0/warnings 0.
- Vite dev의 SW MIME 오류는 정적 production preview에서 재현되지 않았다. 파일 변경을 dev watcher가 반영하지 않아 재빌드 후 정적 preview로 최종 확인했다.

스크린샷은 Run `00a16cf0-bd48-4321-8de7-7ccd0b40bde8` outbox/browser의 `22-04-30-168Z`(desktop), `22-04-44-716Z`(mobile home), `22-06-23-258Z`(mobile detail)이다. quick/sweep 측정 스크립트는 실행하지 않았으며 위 좌표는 browser snapshot의 실제 bounding box다. 전 화면 UI audit, iOS/PWA, 실 E5 품질 및 실 L2 검증으로 확대하지 않는다.

백엔드 v3는 별도 `back-kb-recovery-20261030`에서 최신 Research P2 경계와 통합 중이다. 관련 실제 PG/API·세대/스키마·검증 operation·unit 회귀 190 passed를 확인했지만 ontology/backfill 맥락 제외 전파와 operation 세대 수명 보호가 남아 있다. 프론트 게시가 전체 제품 연결·백엔드 배포 완료를 뜻하지 않는다. 구 백엔드에서는 v3 미지원 안내와 기존 문서·검색의 호환 경로를 사용한다.
