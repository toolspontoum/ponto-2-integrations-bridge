import { createHash } from 'node:crypto';

function readEnv(name) {
  return (process.env[name] || '').trim();
}

const REQUIRED_SCOPES = ['profile:read'];

const ENV_CONFIG = {
  dev: { envName: 'DEV', callbackPath: '/api/canva/oauth/dev/callback' },
  stage: { envName: 'STAGE', callbackPath: '/api/canva/oauth/stage/callback' },
  prod: { envName: 'PROD', callbackPath: '/api/canva/oauth/callback' }
};

function getClientConfig(env) {
  if (env === 'dev') {
    return {
      clientId: readEnv('CANVA_CLIENT_ID_DEV') || readEnv('CANVA_CLIENT_ID_NONPROD'),
      clientSecret: readEnv('CANVA_CLIENT_SECRET_DEV') || readEnv('CANVA_CLIENT_SECRET_NONPROD')
    };
  }

  if (env === 'stage') {
    return {
      clientId: readEnv('CANVA_CLIENT_ID_STAGE') || readEnv('CANVA_CLIENT_ID_NONPROD'),
      clientSecret: readEnv('CANVA_CLIENT_SECRET_STAGE') || readEnv('CANVA_CLIENT_SECRET_NONPROD')
    };
  }

  return {
    clientId: readEnv('CANVA_CLIENT_ID_PROD'),
    clientSecret: readEnv('CANVA_CLIENT_SECRET_PROD')
  };
}

function getCanvaAuthBase() {
  return readEnv('CANVA_AUTH_BASE') || 'https://www.canva.com/api/oauth/authorize';
}

function getCanvaTokenBase() {
  return readEnv('CANVA_TOKEN_BASE') || 'https://api.canva.com/rest/v1/oauth/token';
}

function getPublicBaseUrl() {
  return (readEnv('PUBLIC_BASE_URL') || 'https://panel.pontoenterprise.com.br').replace(/\/$/, '');
}

function getStateKey(env) {
  return `CANVA_OAUTH_STATE_${ENV_CONFIG[env].envName}`;
}

function getExpectedState(env) {
  return readEnv(getStateKey(env));
}

function getCodeChallenge(env) {
  const key = `CANVA_CODE_CHALLENGE_${ENV_CONFIG[env].envName}`;
  const challenge = readEnv(key);
  if (challenge) {
    return challenge;
  }

  const verifier = getCodeVerifier(env);
  if (!verifier) {
    return '';
  }

  const digest = createHash('sha256').update(verifier).digest('base64');
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getCodeVerifier(env) {
  const key = `CANVA_CODE_VERIFIER_${ENV_CONFIG[env].envName}`;
  return readEnv(key);
}

function getRedirectUri(env) {
  const config = ENV_CONFIG[env];
  return `${getPublicBaseUrl()}${config.callbackPath}`;
}

function getRefreshTokenSecretName(env) {
  return `CANVA_OAUTH_REFRESH_TOKEN_${ENV_CONFIG[env].envName}`;
}

function buildAuthorizationUrl(env) {
  const config = ENV_CONFIG[env];
  const clientConfig = getClientConfig(env);
  if (!config || !clientConfig.clientId) {
    throw new Error(`missing_client_id_for_${env}`);
  }

  const redirectUri = getRedirectUri(env);
  const state = getExpectedState(env);
  if (!state) {
    throw new Error(`missing_state_for_${env}`);
  }

  const codeChallenge = getCodeChallenge(env);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientConfig.clientId,
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES.join(' ')
  });

  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  params.set('state', state);

  return {
    environment: config.envName,
    client_id: clientConfig.clientId,
    redirect_uri: redirectUri,
    authorization_url: `${getCanvaAuthBase()}?${params.toString()}`
  };
}

export {
  ENV_CONFIG,
  REQUIRED_SCOPES,
  getClientConfig,
  getCanvaTokenBase,
  getExpectedState,
  getCodeVerifier,
  getRedirectUri,
  getRefreshTokenSecretName,
  buildAuthorizationUrl
};
