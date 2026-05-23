import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const originalEnv = { ...process.env };

async function startApp() {
  const { app } = await import(`../src/app.js?ts=${Date.now()}`);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`
  };
}

async function startTokenServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405);
      return res.end();
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  return {
    server,
    tokenBase: `http://127.0.0.1:${server.address().port}/token`
  };
}

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test('callback returns 400 when code/state missing', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/callback`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('callback returns oauth_error when provider returns error params', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(
      `${baseUrl}/api/canva/oauth/dev/callback?error=invalid_scope&error_description=requested_scope_not_allowed`
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'oauth_error');
    assert.equal(body.oauth_error, 'invalid_scope');
    assert.equal(Object.hasOwn(body, 'oauth_error_description'), false);
  } finally {
    server.close();
  }
});

test('callback returns 403 when state invalid', async () => {
  process.env.CANVA_OAUTH_STATE_DEV = 'expected-state';

  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/callback?code=x&state=wrong`);
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('callback returns 500 when state config is missing', async () => {
  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/callback?code=x&state=any`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'oauth_misconfigured');
  } finally {
    server.close();
  }
});

test('callback returns 200 and persists refresh token via command', async () => {
  process.env.CANVA_OAUTH_STATE_DEV = 'ok-state';
  process.env.CANVA_CODE_VERIFIER_DEV = 'verifier';
  process.env.CANVA_CLIENT_ID_DEV = 'client-id';
  process.env.CANVA_CLIENT_SECRET_DEV = 'client-secret';
  process.env.CANVA_REFRESH_TOKEN_STORE_CMD = 'cat >/dev/null';

  const tokenMock = await startTokenServer();
  process.env.CANVA_TOKEN_BASE = tokenMock.tokenBase;

  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/callback?code=x&state=ok-state`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.refresh_token_persisted, true);
    assert.equal(body.secret_name, 'CANVA_OAUTH_REFRESH_TOKEN_DEV');
  } finally {
    server.close();
    tokenMock.server.close();
  }
});

test('callback returns generic 502 without internal reason on persistence failure', async () => {
  process.env.CANVA_OAUTH_STATE_DEV = 'ok-state';
  process.env.CANVA_CODE_VERIFIER_DEV = 'verifier';
  process.env.CANVA_CLIENT_ID_DEV = 'client-id';
  process.env.CANVA_CLIENT_SECRET_DEV = 'client-secret';
  process.env.CANVA_REFRESH_TOKEN_STORE_CMD = 'sh -c "echo fail 1>&2; exit 7"';

  const tokenMock = await startTokenServer();
  process.env.CANVA_TOKEN_BASE = tokenMock.tokenBase;

  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/callback?code=x&state=ok-state`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'oauth_callback_failed');
    assert.equal(Object.hasOwn(body, 'reason'), false);
  } finally {
    server.close();
    tokenMock.server.close();
  }
});

test('authorize returns URL with state and PKCE challenge derived from verifier', async () => {
  process.env.CANVA_CLIENT_ID_DEV = 'client-id';
  process.env.CANVA_OAUTH_STATE_DEV = 'state-dev';
  process.env.CANVA_CODE_VERIFIER_DEV = 'test-verifier';
  process.env.PUBLIC_BASE_URL = 'https://panel.pontoenterprise.com.br';

  const { server, baseUrl } = await startApp();
  try {
    const res = await fetch(`${baseUrl}/api/canva/oauth/dev/authorize`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'DEV');
    assert.equal(body.redirect_uri, 'https://panel.pontoenterprise.com.br/api/canva/oauth/dev/callback');
    const authUrl = new URL(body.authorization_url);
    assert.equal(authUrl.searchParams.get('state'), 'state-dev');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authUrl.searchParams.get('code_challenge'));
    assert.equal(authUrl.searchParams.get('scope'), 'profile:read');
  } finally {
    server.close();
  }
});
