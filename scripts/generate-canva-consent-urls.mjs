import fs from 'node:fs';
import path from 'node:path';
import { buildAuthorizationUrl } from '../src/config.js';

const outDir = path.resolve('evidence');
fs.mkdirSync(outDir, { recursive: true });

const rows = ['dev', 'stage', 'prod'].map((env) => buildAuthorizationUrl(env));

const timestamp = new Date().toISOString();
const runtimeJsonPath = path.join(outDir, 'canva_oauth_consent_runtime.json');
const publicTsvPath = path.join(outDir, 'canva_oauth_consent_public.tsv');

fs.writeFileSync(runtimeJsonPath, JSON.stringify({ generated_at: timestamp, rows }, null, 2));

const tsvLines = rows.map((r) => [r.environment, r.client_id, r.redirect_uri, r.authorization_url].join('\t'));
fs.writeFileSync(publicTsvPath, tsvLines.join('\n') + '\n');

console.log(`generated ${runtimeJsonPath}`);
console.log(`generated ${publicTsvPath}`);
