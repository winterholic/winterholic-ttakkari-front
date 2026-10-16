# 2026-10-17 디자인 시스템 1.2.0 동기화와 UI 계약 검사

## 한 줄
디자인 시스템을 1.2.0(`winterholic-design-system` e7ed576)으로 동기화하고, 실제 앱 25개 경로를 320·390·1440 + 가로 모드 × 긴 글자 주입으로 여는 검사(`pnpm check:layout`)와 앱 CSS 기준선 lint(`ui-lint`)를 넣었다.

## 변경
- 동기화: `src/vendor/ttakkari/*`, 일러스트 WebP `public/art/`(19컷 × 480·960). `scripts/sync-design-system.sh` 가 art 도 복사한다. 앱 화면에는 아직 연결하지 않았다.
- 검사: `scripts/ui-sweep/`(stub.mjs 합성 API, run.sh, fixtures), `scripts/ui-lint.mjs` + `ui-lint.baseline.json`(새 위반이 늘면 `pnpm lint` 실패. 줄이면 `--update`). `pnpm lint` = eslint + ui-lint. `eslint.config.js` 에 scripts/*.mjs node 전역.
- 고침: 헤더 제목·메타 `title`(PageHeader), Badge·Button 문자열 라벨 span, 맥락 도서관(접기 줄·링크 터치 44, 히스토그램 글자 12, 간격 이중 적용, 노드·축 자리 `data-layout-ok`), 서버 리소스 기간 버튼 터치 44, 캘린더 월 제목 말줄임, 비서 소제목 간격, 날씨 날짜 입력 최소 폭, `50vh` → `50dvh`.

## 검증(2026-10-17)
- vitest 507 passed, 1 skipped · eslint + ui-lint ok(위반 141건, 기준선 이하) · tsc -b exit 0 · build 성공.
- `scripts/ui-sweep/run.sh --widths=320,390,1440`: 25개 경로 × 평소/긴 글자 × (390 라이트·다크) + 가로 모드 844×390 → 위반 0(마지막 수정 후 문제 경로 재검사 포함).
- 합성 데이터와 Chrome 에뮬레이션(safe-area 포함)이다. 실제 iOS Safari·IME·실제 계정 데이터는 검증하지 못했다.

## 남은 일
- 일러스트를 앱 화면(빈 상태·오류·온보딩)에 연결하는 것은 별도 작업. 앱 아이콘 마스코트 교체는 사용자 결정 대기.
- ui-lint 기준선에 남은 것: 엔진 배지의 브랜드 hex 15건(의도된 외부 브랜드 색), px 직접값 76건, 자식 margin-top 28건, nowrap 15건. 줄이면 `--update`.
- 배포: main 에 커밋·푸시까지. Vercel 배포 여부는 별도 확인.
