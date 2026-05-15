#!/usr/bin/env node
/**
 * setup-testmart.js — Download, install, and start TestMart.
 *
 * Source priority:
 *   1. TESTMART_GITHUB_ZIP in config.js  (download from GitHub)
 *
 * Writes:
 *   validation-results/testmart.pid  — server PID (for teardown)
 *   validation-results/testmart.log  — server stdout/stderr
 */

'use strict';

const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');
const os       = require('os');
const { execSync, spawn } = require('child_process');
const config   = require('./config');

fs.mkdirSync('validation-results', { recursive: true });

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};

const info  = (s) => console.log(`${C.cyan}ℹ${C.reset}  ${s}`);
const ok    = (s) => console.log(`${C.green}✓${C.reset}  ${s}`);
const fail  = (s) => { console.error(`${C.red}✗${C.reset}  ${s}`); process.exit(1); };
const warn  = (s) => console.log(`${C.yellow}⚠${C.reset}  ${s}`);

// ── Download ZIP ──────────────────────────────────────────────────────────────

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    info(`Downloading TestMart from ${url} ...`);
    const file = fs.createWriteStream(destPath);
    const lib  = url.startsWith('https') ? https : http;

    function doGet(targetUrl) {
      lib.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with HTTP ${res.statusCode}: ${targetUrl}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    }

    doGet(url);
  });
}

// ── Extract ZIP ───────────────────────────────────────────────────────────────

function extractZip(zipPath, destDir) {
  info(`Extracting to ${destDir} ...`);
  fs.mkdirSync(destDir, { recursive: true });

  if (os.platform() === 'win32') {
    execSync(
      `powershell -Command "Expand-Archive -Force '${zipPath}' '${destDir}'"`,
      { stdio: 'pipe' }
    );
  } else {
    execSync(`unzip -q -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
  }
}

// ── Find TestMart root (GitHub ZIP extracts as repo-main/) ──────────────────

function findTestMartRoot(extractDir) {
  // GitHub zips extract as: <repo>-<branch>/
  const entries = fs.readdirSync(extractDir);
  for (const e of entries) {
    const p = path.join(extractDir, e);
    if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'package.json'))) {
      return p;
    }
  }
  // Fallback: extractDir itself
  if (fs.existsSync(path.join(extractDir, 'package.json'))) return extractDir;
  throw new Error(`Could not find TestMart package.json inside ${extractDir}`);
}

// ── Wait for TestMart to be ready ────────────────────────────────────────────

function waitForTestMart(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(check, 500);
        res.resume();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('TestMart did not start in time'));
        else setTimeout(check, 500);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    check();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${C.bold}TestMart Setup${C.reset}\n`);

  const port = config.TESTMART_PORT;
  let testmartDir;

  // ── 1. Download TestMart from GitHub ─────────────────────────────────────
  const zipUrl     = config.TESTMART_GITHUB_ZIP;
  const zipDest    = 'validation-results/testmart.zip';
  const extractDir = 'testmart-download';

  await downloadFile(zipUrl, zipDest);
  ok(`Downloaded to ${zipDest}`);

  extractZip(zipDest, extractDir);
  testmartDir = findTestMartRoot(extractDir);
  ok(`Extracted TestMart to ${testmartDir}`);

  // ── 2. npm install ────────────────────────────────────────────────────────
  info('Running npm install in TestMart directory ...');
  try {
    execSync('npm install --no-audit --no-fund', {
      cwd: testmartDir,
      stdio: 'pipe',
      timeout: 120_000,
    });
    ok('npm install completed');
  } catch (e) {
    fail(`npm install failed: ${e.message}\n  Check npm registry connectivity and run check-env.js first.`);
  }

  // ── 3. Seed the database ──────────────────────────────────────────────────
  info('Seeding TestMart database ...');
  try {
    execSync('node --no-warnings db/seed.js', {
      cwd: testmartDir,
      stdio: 'pipe',
    });
    ok('Database seeded');
  } catch (e) {
    warn(`DB seed failed (may already be seeded): ${e.message}`);
  }

  // ── 4. Kill anything on the port ──────────────────────────────────────────
  try {
    if (os.platform() === 'win32') {
      const pidLine = execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' }).toString();
      const match   = pidLine.match(/\s+(\d+)\s*$/m);
      if (match) execSync(`taskkill /PID ${match[1]} /F`, { stdio: 'pipe' });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
    }
  } catch { /* port was free */ }

  // ── 5. Start TestMart ────────────────────────────────────────────────────
  info(`Starting TestMart on port ${port} ...`);

  // fs.createWriteStream() returns a stream with fd:null until the 'open' event fires.
  // spawn() with detached:true needs a synchronous numeric file descriptor — use openSync().
  const logFd = fs.openSync('validation-results/testmart.log', 'w');

  const server = spawn('node', ['--no-warnings', 'server.js'], {
    cwd: testmartDir,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, PORT: String(port) },
  });
  server.unref();

  // Parent closes its copy of the fd — the child process has inherited it
  fs.closeSync(logFd);

  fs.writeFileSync('validation-results/testmart.pid', String(server.pid), 'utf8');

  // ── 6. Wait for ready ─────────────────────────────────────────────────────
  try {
    await waitForTestMart(port, 20_000);
    ok(`TestMart is ready at http://localhost:${port}`);
    console.log(`\n  Standard user : standard_user@example.com / Password123!`);
    console.log(`  Admin user    : admin@example.com / Admin123!\n`);
  } catch (e) {
    fail(`TestMart failed to start. Check validation-results/testmart.log for details.`);
  }

  // ── 7. Write testmart path for Playwright tests ───────────────────────────
  fs.writeFileSync(
    'validation-results/testmart-meta.json',
    JSON.stringify({ dir: testmartDir, port, pid: server.pid }, null, 2),
    'utf8'
  );
  ok(`Setup complete. Run: npm test`);
})();
