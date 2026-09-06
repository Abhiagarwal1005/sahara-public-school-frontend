// ---------------------------------------------------------------------------
// Keeps vercel.json's /api rewrite in step with deploy.config.js.
//
// Why a script instead of just reading the value at runtime: vercel.json is
// STATIC. Vercel does not substitute environment variables into it, and it is
// read when the deployment is set up — before `npm run build` runs. So the
// production API URL has to be a literal in that file, and the only way to
// keep one source of truth is to write it there from deploy.config.js.
//
//   npm run sync:vercel     write API_PROD into vercel.json
//   npm run check:vercel    fail if the two disagree (runs before every build,
//                           so a stale vercel.json can never ship unnoticed)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { API_PROD } from '../deploy.config.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'vercel.json');
const checkOnly = process.argv.includes('--check');

const API_SOURCE = '/api/:path*';
const expected = `${API_PROD.replace(/\/$/, '')}/api/:path*`;

const config = JSON.parse(readFileSync(file, 'utf8'));
const rewrite = (config.rewrites || []).find((r) => r.source === API_SOURCE);

if (!rewrite) {
    console.error(
        `vercel.json has no "${API_SOURCE}" rewrite.\n` +
            'Without it the catch-all serves index.html to /api requests and every\n' +
            'API call returns HTML. Add it ABOVE the catch-all — order matters.'
    );
    process.exit(1);
}

if (rewrite.destination === expected) {
    console.log(`vercel.json /api -> ${expected}  (in sync with deploy.config.js)`);
    process.exit(0);
}

if (checkOnly) {
    console.error(
        'vercel.json is OUT OF SYNC with deploy.config.js\n\n' +
            `  deploy.config.js API_PROD : ${expected}\n` +
            `  vercel.json destination   : ${rewrite.destination}\n\n` +
            'Run:  npm run sync:vercel     then commit vercel.json.'
    );
    process.exit(1);
}

rewrite.destination = expected;
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log(`vercel.json /api -> ${expected}  (updated — commit this file)`);
