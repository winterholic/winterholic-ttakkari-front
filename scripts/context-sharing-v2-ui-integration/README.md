# Context Sharing v2 UI integration verification

This run uses the front Vite application and the backend's authorized synthetic
fixture. The fixture calls the actual Private context-sharing API and actual
Gateway control/public ASGI apps. Only the browser auth/session shell endpoints
(`/api/auth/refresh`, `/api/auth/me`, `/api/health`) are synthetic.

## Isolation

- Use only `test_cg_v2_ui_verify_20261119` on PostgreSQL at `127.0.0.1:5432`.
- Do not point the fixture at another database. The Gateway test fixture is
  aliased to the same prefixed DB; it does not create a second DB.
- All documents, identities and credentials are synthetic. Do not use a
  production API or real user documents.

## Acceptance test

From `back-context-sharing-v2-20261119`, set `TTAKKARI_TEST_DB` to
`postgresql+asyncpg://winterholic@127.0.0.1:5432/test_cg_v2_ui_verify_20261119`
and run:

```sh
uv run --project . pytest scripts/context_sharing_v2_ui_fixture.py -q
```

The test issues a default three-day reusable key and share link, checks
metadata-only list responses and repeated REST calls, then verifies revocation
rejects an existing credential and an already-issued session.

## Browser route

1. Run the backend fixture with `--serve` using the same DB and set
   `TTAKKARI_CONTEXT_GATEWAY_CONTROL_URL=http://127.0.0.1:8791`, a synthetic
   `TTAKKARI_CONTEXT_GATEWAY_CONTROL_TOKEN`, and
   `TTAKKARI_CONTEXT_GATEWAY_PUBLIC_URL=https://share.example.test`.
2. In the front repo run Vite with
   `TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:8791 pnpm exec vite --port 5173 --strictPort --host 127.0.0.1`.
3. Use the configured `ttakkari_browser` at
   `http://localhost:5173/context-sharing?project=<printed synthetic entity id>`.
   Inspect at 390px and 1280px; exercise issue, copy, and revoke for both
   credential types; inspect network and console; then close the browser and
   stop both local servers.

Do not launch a shell browser as a fallback. This fixture does not exercise the
public Reader UI.
