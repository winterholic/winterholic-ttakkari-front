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
