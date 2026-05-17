# ponto-2-integrations-bridge

Backend bridge para integrações externas da Ponto 2 Digital (Canva OAuth).

## Endpoints OAuth Canva

- `GET /api/canva/oauth/dev/callback`
- `GET /api/canva/oauth/stage/callback`
- `GET /api/canva/oauth/callback`

- `GET /api/canva/oauth/dev/authorize`
- `GET /api/canva/oauth/stage/authorize`
- `GET /api/canva/oauth/authorize`

## Variáveis de ambiente

- `PUBLIC_BASE_URL`
- `CANVA_CLIENT_ID_DEV` (ou `CANVA_CLIENT_ID_NONPROD`)
- `CANVA_CLIENT_ID_STAGE` (ou `CANVA_CLIENT_ID_NONPROD`)
- `CANVA_CLIENT_ID_PROD`
- `CANVA_CLIENT_SECRET_DEV` (ou `CANVA_CLIENT_SECRET_NONPROD`)
- `CANVA_CLIENT_SECRET_STAGE` (ou `CANVA_CLIENT_SECRET_NONPROD`)
- `CANVA_CLIENT_SECRET_PROD`
- `CANVA_OAUTH_STATE_DEV`, `CANVA_OAUTH_STATE_STAGE`, `CANVA_OAUTH_STATE_PROD` (obrigatórios para callback/authorize)
- `CANVA_CODE_CHALLENGE_DEV`, `CANVA_CODE_CHALLENGE_STAGE`, `CANVA_CODE_CHALLENGE_PROD` (opcionais; se ausente, derivado do `code_verifier` com S256)
- `CANVA_CODE_VERIFIER_DEV`, `CANVA_CODE_VERIFIER_STAGE`, `CANVA_CODE_VERIFIER_PROD` (obrigatórios para token exchange)
- `CANVA_TOKEN_BASE` (opcional; default `https://api.canva.com/rest/v1/oauth/token`)
- `CANVA_REFRESH_TOKEN_STORE_CMD` (obrigatório no callback):
  - comando executado no servidor para persistir o refresh token via `stdin`;
  - pode usar placeholder `{secret_name}` para receber o nome do segredo por ambiente;
  - exemplo: `paperclip-secrets upsert --name {secret_name} --stdin`.

## Execução

```bash
npm install
npm start
```

## Deploy público (Traefik)

1. Criar `.env.public` a partir de `.env.public.example` e preencher segredos.
2. Publicar o serviço:

```bash
docker compose -f docker-compose.public.yml up -d --build
```

3. Validar roteamento público:

```bash
./scripts/smoke-public-oauth-routes.sh
```

Resultado esperado após deploy: endpoints `/authorize` retornam `200`; endpoints `/callback` sem query retornam `400` (não `404`).

Comandos de validação no host:

```bash
docker compose -f docker-compose.public.yml config
docker compose -f docker-compose.public.yml up -d --build
./scripts/smoke-public-oauth-routes.sh
```

Rollback:

```bash
docker compose -f docker-compose.public.yml down
```

## Troca de token OAuth (callback)

Os callbacks executam token exchange real em `POST /rest/v1/oauth/token` com `authorization_code`, `code_verifier` e `client_secret`; em sucesso, o `refresh_token` é persistido via `CANVA_REFRESH_TOKEN_STORE_CMD`.

Comportamento de segurança:
- Sem `code/state`: `400 missing_required_query_params`.
- `state` de request divergente: `403 invalid_state`.
- `state` por ambiente ausente em config: `500 oauth_misconfigured`.
- Falha de exchange/persistência: `502 oauth_callback_failed` (sem detalhes sensíveis na resposta).
- Logs sanitizam `code`, `authorization`, `access_token`, `refresh_token`, `client_secret`, `code_verifier`.

## Geração de URLs de consentimento

```bash
npm run generate:consent
```

Arquivos gerados:
- `evidence/canva_oauth_consent_runtime.json`
- `evidence/canva_oauth_consent_public.tsv`
