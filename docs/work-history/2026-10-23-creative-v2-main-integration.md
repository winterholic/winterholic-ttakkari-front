# Creative Studio v2 프론트 main 통합 (2026-10-23)

- 사용자 명시 지시('프론트도 반영을 좀 다해줘')로 `feat/creative-intent-duration`(f4287ac)을 main에 반영한다. 반영 직전 `origin/main`은 aa9049c(제작 기록 UI)였고, feature는 이 SHA에서 갈라진 7커밋이라 fast-forward로 통합했다.
- 통합 전 운영 번들은 `index-DlY_yt3w.js`/`CreativePage-CPgHAZzJ.js`였고 `/creative/plan` route가 없었다. 원인은 feature 브랜치 미병합이었다. 운영 배포는 Vercel main 자동 배포다(Production deployment aa9049c 확인).
- 의존 API: `/api/creative/v2/*`는 backend main 710f184에 병합했다. 통합 전 live backend(7626a91)는 해당 route가 404였다. 배포 예약 6c75778a는 front push 시점에 status `testing`이었다.
- 검증: `tsc --noEmit` 통과, `pnpm lint` 통과(ui-lint 기준선 138 유지), `vitest run` → `1310 passed | 10 skipped`, `pnpm build` 성공(`CreativePlanPage-*.js` chunk 생성). `/creative` 화면의 '새 계획' 링크가 `/creative/plan`으로 연결되고 `/creative/records`는 유지된다.
- 미검증 유지: 실제 managed Qwen 응답, 인증된 운영 UI 동작, 렌더러(미연결, 실제 영상 0편). 로그인 필요 화면은 인증 우회 없이 확인 가능한 범위만 본다.
