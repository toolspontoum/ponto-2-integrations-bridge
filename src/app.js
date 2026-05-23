import express from 'express';
import { buildAuthorizationUrl, getExpectedState } from './config.js';
import { exchangeCanvaToken, logStructured, persistRefreshToken } from './oauth.js';

const app = express();
app.use(express.json());

function resolveEnvironment(req) {
  if (req.path === '/api/canva/oauth/callback' || req.path === '/api/canva/oauth/authorize') {
    return 'prod';
  }

  const environment = req.params.environment || req.path.split('/').slice(-2, -1)[0];
  if (environment === 'dev' || environment === 'stage') {
    return environment;
  }

  return null;
}

async function oauthCallbackHandler(req, res) {
  const environment = resolveEnvironment(req);
  const requestId = req.headers['x-request-id'] || null;

  if (!environment) {
    return res.status(404).json({ error: 'route_not_found' });
  }

  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
  const oauthErrorDescription = typeof req.query.error_description === 'string'
    ? req.query.error_description
    : '';

  if (oauthError) {
    logStructured('error', 'canva_callback_oauth_error', {
      environment,
      endpoint: req.path,
      status_code: 400,
      request_id: requestId,
      oauth_error: oauthError,
      oauth_error_description: oauthErrorDescription.slice(0, 200)
    });
    return res.status(400).json({
      error: 'oauth_error',
      oauth_error: oauthError
    });
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';

  if (!code || !state) {
    return res.status(400).json({ error: 'missing_required_query_params', required: ['code', 'state'] });
  }

  const expectedState = getExpectedState(environment);
  if (!expectedState) {
    logStructured('error', 'canva_callback_missing_state_config', {
      environment,
      endpoint: req.path,
      status_code: 500,
      request_id: requestId
    });
    return res.status(500).json({ error: 'oauth_misconfigured' });
  }

  if (state !== expectedState) {
    logStructured('error', 'canva_callback_invalid_state', {
      environment,
      endpoint: req.path,
      status_code: 403,
      request_id: requestId
    });
    return res.status(403).json({ error: 'invalid_state' });
  }

  try {
    const tokenData = await exchangeCanvaToken({ environment, code });
    const persisted = await persistRefreshToken({ environment, refreshToken: tokenData.refresh_token });

    logStructured('info', 'canva_callback_completed', {
      environment,
      endpoint: req.path,
      status_code: 200,
      request_id: requestId,
      secret_name: persisted.secretName
    });

    return res.status(200).json({
      ok: true,
      environment,
      callback: req.path,
      state_validated: true,
      refresh_token_persisted: true,
      secret_name: persisted.secretName
    });
  } catch (error) {
    logStructured('error', 'canva_callback_failed', {
      environment,
      endpoint: req.path,
      status_code: 502,
      request_id: requestId,
      reason: error?.message || 'unknown_error'
    });
    return res.status(502).json({ error: 'oauth_callback_failed' });
  }
}

function oauthAuthorizeHandler(req, res) {
  const environment = resolveEnvironment(req);
  if (!environment) {
    return res.status(404).json({ error: 'route_not_found' });
  }

  try {
    const payload = buildAuthorizationUrl(environment);
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({ error: 'authorization_url_generation_failed', reason: error.message });
  }
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get('/api/canva/oauth/dev/callback', oauthCallbackHandler);
app.get('/api/canva/oauth/stage/callback', oauthCallbackHandler);
app.get('/api/canva/oauth/callback', oauthCallbackHandler);

app.get('/api/canva/oauth/dev/authorize', oauthAuthorizeHandler);
app.get('/api/canva/oauth/stage/authorize', oauthAuthorizeHandler);
app.get('/api/canva/oauth/authorize', oauthAuthorizeHandler);

export { app };
