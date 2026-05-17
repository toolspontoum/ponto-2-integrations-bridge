import { spawn } from 'node:child_process';
import { getCanvaTokenBase, getClientConfig, getCodeVerifier, getRedirectUri, getRefreshTokenSecretName } from './config.js';

function isSensitiveKey(key) {
  return [
    'code',
    'access_token',
    'refresh_token',
    'client_secret',
    'authorization',
    'code_verifier'
  ].includes(String(key).toLowerCase());
}

function sanitizeObject(input) {
  if (!input || typeof input !== 'object') {
    return input;
  }

  const output = Array.isArray(input) ? [] : {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      output[key] = '***redacted***';
      continue;
    }

    if (value && typeof value === 'object') {
      output[key] = sanitizeObject(value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

function logStructured(level, event, payload) {
  const line = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeObject(payload)
  };
  const sink = level === 'error' ? console.error : console.log;
  sink(JSON.stringify(line));
}

async function exchangeCanvaToken({ environment, code }) {
  const config = getClientConfig(environment);
  if (!config?.clientId || !config?.clientSecret) {
    throw new Error(`missing_oauth_client_config_for_${environment}`);
  }

  const codeVerifier = getCodeVerifier(environment);
  if (!codeVerifier) {
    throw new Error(`missing_code_verifier_for_${environment}`);
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(environment),
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier
  });

  const response = await fetch(getCanvaTokenBase(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { raw: await response.text() };

  if (!response.ok) {
    logStructured('error', 'canva_token_exchange_failed', {
      environment,
      status_code: response.status,
      response: data
    });
    throw new Error(`token_exchange_failed_${response.status}`);
  }

  if (!data.refresh_token) {
    throw new Error('missing_refresh_token_in_token_response');
  }

  return data;
}

async function persistRefreshToken({ environment, refreshToken }) {
  const secretName = getRefreshTokenSecretName(environment);
  const storeCmd = (process.env.CANVA_REFRESH_TOKEN_STORE_CMD || '').trim();

  if (!storeCmd) {
    throw new Error('missing_refresh_token_store_command');
  }

  const command = storeCmd.includes('{secret_name}')
    ? storeCmd.replaceAll('{secret_name}', secretName)
    : storeCmd;

  const child = spawn(command, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: process.env
  });

  child.stdin.write(refreshToken);
  child.stdin.end();

  const stderr = [];
  child.stderr.on('data', (chunk) => stderr.push(String(chunk)));

  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        logStructured('error', 'canva_refresh_token_store_failed', {
          environment,
          status_code: code,
          stderr: stderr.join('').slice(0, 200)
        });
        reject(new Error(`refresh_token_store_failed_${code}`));
      }
    });
  });

  return { secretName };
}

export { sanitizeObject, logStructured, exchangeCanvaToken, persistRefreshToken };
