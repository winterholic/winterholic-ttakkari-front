# Winterholic Ttakkari Front

Mac Studio 의 AI 에이전트를 원격으로 지시하는 개인용 PWA. 지금은 데이터·통신 계층과 최소 라우팅만 있다.

## 실행

```sh
pnpm install
cp .env.example .env.local   # VITE_API_BASE 를 백엔드 주소로
pnpm dev
```

- `pnpm build` 타입 검사 + 번들, `pnpm test --run`, `pnpm lint`
- 백엔드 통합 테스트: `TTAKKARI_IT_BASE=http://127.0.0.1:8799 TTAKKARI_IT_PASSWORD=... pnpm test --run integration`
- API 계약은 백엔드 레포 `docs/api-contract.md`, 타입은 `src/api/types.ts`.

## 개발 시 주의

- refresh 쿠키는 같은 사이트일 때만 실린다. 프론트와 API 호스트를 맞춘다: `VITE_API_BASE=http://127.0.0.1:8787 pnpm dev --host 127.0.0.1` 후 `http://127.0.0.1:5173` 으로 연다(`localhost` 와 섞으면 새로고침 때 로그아웃된다).
- 디자인 시스템을 갱신했으면 `./scripts/sync-design-system.sh` 를 다시 돌리고 산출물을 커밋한다.

회의 전사는 로컬 Whisper를 사용한다. 외부 서비스 연결·로그인·가져오기 탭은 제거했다. 기존에 가져온 회의록은 같은 목록에서 열람·검색·분석한다.
로컬 전사와 검색용 E5는 요청별 자식 프로세스에서 처리 후 종료한다. STT는 backend `.stt-runtime/`에 준비한 Python·가중치를 기본으로 찾아 `.env` 편집 없이 실행한다. 상세 경로·마이그레이션·운영 스모크는 backend ADR 0027과 `docs/stt/remove-clovanote-2026-10-15.md`를 따른다.

환경 파일 내용 없이 검사하려면 `TTAKKARI_NO_ENV_FILE=1 pnpm test --run`, `TTAKKARI_NO_ENV_FILE=1 pnpm build`를 사용한다. 이 플래그는 Vite의 환경 파일 자동 로드를 끄며, 일반 개발·Vercel 설정은 유지한다.

부가 기능 > 디자인시스템(`/design-systems`)은 `winterholic-design-system`의 프로젝트별 토큰·라이트/다크·참조·문서·컴포넌트 CSS·예제 원문을 조회한다. 백엔드 ADR 0034의 `/api/design-systems` API가 필요하다. 첫 화면은 각 프로젝트의 `preview.html` 시각 미리보기다. 라이트·다크, 구간 이동, 크게 보기, 예제 화면/원문 전환과 토큰의 색상 견본을 지원한다. 목록·상세·미리보기는 같은 커밋에 고정한다. 예제는 서버에서 실행하지 않으며, 브라우저의 격리 iframe에서만 동작한다. 편집 기능은 제공하지 않는다.
