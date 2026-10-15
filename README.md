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

회의 전사는 로컬 Whisper를 기본 선택한다. 모델이 준비되지 않으면 사유를 표시하고 외부 엔진으로 자동 전환하지 않는다. 클로바노트 상태 조회·로그인 안내는 해당 탭이나 엔진을 선택할 때만 실행한다. 로컬 전사와 검색용 E5는 백엔드의 요청별 자식 프로세스에서 처리 후 종료한다. 운영 설정·설치 안내는 backend `docs/stt/README.md`와 ADR 0026을 따른다.
