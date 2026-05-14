#!/usr/bin/env node
/**
 * check-env.js — Pre-flight environment check (all 7 sessions).
 *
 * Runs with ZERO npm dependencies — plain Node.js only.
 * Must pass before attempting npm install or Playwright tests.
 *
 * Usage:  node check-env.js
 * Output: console summary + validation-results/preflight.json
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const { mkdirSync, writeFileSync, existsSync } = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');
const os     = require('os');
const config = require('./config');

mkdirSync('validation-results', { recursive: true });

// ── Colours ────────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m',
};
const PASS = `${C.green}PASS${C.reset}`;
const FAIL = `${C.red}FAIL${C.reset}`;
const WARN = `${C.yellow}WARN${C.reset}`;
const SKIP = `${C.cyan}SKIP${C.reset}`;

const results = {
  timestamp: new Date().toISOString(),
  os: `${os.platform()} ${os.release()} ${os.arch()}`,
  user: os.userInfo().username,
  checks: [],
  packageChecks: {},
  sessionReadiness: {},
};

// ── Record helpers ─────────────────────────────────────────────────────────────

function record(name, status, detail = '') {
  results.checks.push({ name, status, detail });
  const icon = { PASS, FAIL, WARN, SKIP }[status] || SKIP;
  const det  = detail ? `: ${detail}` : '';
  console.log(`  [${icon}] ${name}${det}`);
  return status;
}

function section(title) {
  console.log(`\n${C.bold}${title}${C.reset}`);
}

// ── CLI helpers ────────────────────────────────────────────────────────────────

function cmd(command) {
  try { return execSync(command, { stdio: 'pipe', timeout: 10000 }).toString().trim(); }
  catch { return null; }
}

function cmdFirstLine(command) {
  const out = cmd(command);
  return out ? out.split('\n')[0].trim() : null;
}

// ── Network helper ─────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      resolve({ ok: true, status: res.statusCode });
      res.resume();
    });
    req.on('error',   (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', ()  => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

// ── npm view: check if a package is available in the configured registry ───────

function npmView(pkgName) {
  const out = cmd(`npm view ${pkgName} version --json 2>&1`);
  if (!out) return null;
  // If output is a quoted string like "1.44.0", the package exists
  // If it contains "E404" or "Not Found", the package is not in the registry
  if (out.includes('E404') || out.includes('Not Found') || out.includes('not found')) return null;
  try {
    // npm view returns the version as a JSON string e.g. "1.44.0" or array
    return JSON.parse(out.replace(/^"|"$/g, ''));
  } catch {
    return out.replace(/^"/, '').replace(/"$/, '').trim() || 'available';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — Core toolchain
// ═══════════════════════════════════════════════════════════════════════════════

function checkNode() {
  const v     = process.version;
  const major = parseInt(v.replace('v', '').split('.')[0], 10);
  const status = major >= 20 ? 'PASS' : 'FAIL';
  const detail = major >= 20 ? `${v} (required: v20+)` : `${v} — upgrade to v20 LTS from nodejs.org`;
  return record('Node.js version', status, detail);
}

function checkNpm() {
  const v = cmd('npm --version');
  if (!v) return record('npm', 'FAIL', 'not found — reinstall Node.js');
  const major = parseInt(v.split('.')[0], 10);
  return record('npm', major >= 9 ? 'PASS' : 'WARN', `v${v}${major < 9 ? ' — recommended v9+' : ''}`);
}

function checkGit() {
  const v = cmd('git --version');
  return v
    ? record('Git', 'PASS', v)
    : record('Git', 'FAIL', 'not found — install from git-scm.com');
}

function checkVSCode() {
  const v = cmdFirstLine('code --version');
  return v
    ? record('VS Code CLI', 'PASS', v)
    : record('VS Code CLI', 'WARN', '"code" command not in PATH — VS Code may still be installed without PATH setup');
}

function checkTypeScript() {
  const v = cmd('tsc --version') || cmd('npx --yes tsc --version 2>/dev/null');
  return v
    ? record('TypeScript', 'PASS', v)
    : record('TypeScript', 'WARN', 'Not installed globally — will install via npm');
}

function checkWritePermission() {
  const testFile = path.join(os.tmpdir(), `pw-test-${Date.now()}.tmp`);
  try {
    require('fs').writeFileSync(testFile, 'ok');
    require('fs').unlinkSync(testFile);
    return record('Write permissions', 'PASS', os.tmpdir());
  } catch (e) {
    return record('Write permissions', 'FAIL', `Cannot write to temp dir: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Java / JVM stack (Session 7)
// ═══════════════════════════════════════════════════════════════════════════════

function checkJava() {
  // Java prints version to stderr, so we pipe both
  const v = cmd('java -version 2>&1');
  if (!v) return record('Java JDK', 'FAIL', 'not found — required for Session 7 (Rest Assured, Allure CLI). Install JDK 11+ from adoptium.net');

  const match = v.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return record('Java JDK', 'WARN', `Found but version unreadable: ${v.split('\n')[0]}`);

  const major = parseInt(match[1]) === 1 ? parseInt(match[2] || '0') : parseInt(match[1]);
  if (major >= 11) return record('Java JDK', 'PASS', `JDK ${major} (${v.split('\n')[0]})`);
  return record('Java JDK', 'WARN', `JDK ${major} found — JDK 11+ recommended for Session 7`);
}

function checkMaven() {
  const v = cmdFirstLine('mvn --version');
  return v
    ? record('Maven', 'PASS', v)
    : record('Maven', 'WARN', 'Not found — needed for Rest Assured (Session 7). May use Gradle instead.');
}

function checkGradle() {
  const v = cmdFirstLine('gradle --version');
  // Only warn if Maven is also missing
  if (!v) return record('Gradle', 'WARN', 'Not found (alternative to Maven for Session 7)');
  return record('Gradle', 'PASS', v);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Docker (Mokapi container, TestContainers demo)
// ═══════════════════════════════════════════════════════════════════════════════

function checkDocker() {
  const v = cmdFirstLine('docker --version');
  if (!v) return record('Docker', 'WARN', 'Not found — needed for Mokapi container (Session 5) and TestContainers demos');

  // Check if Docker daemon is running
  const info = cmd('docker info 2>&1');
  if (!info || info.includes('Cannot connect') || info.includes('permission denied')) {
    return record('Docker', 'WARN', `${v} — installed but daemon not running or permissions issue`);
  }
  return record('Docker', 'PASS', v);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Performance testing tools (Session 7)
// ═══════════════════════════════════════════════════════════════════════════════

function checkK6() {
  const v = cmdFirstLine('k6 version');
  return v
    ? record('k6 (performance testing)', 'PASS', v)
    : record('k6 (performance testing)', 'WARN', 'Not found — needed for Session 7 performance testing. Install from k6.io');
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PrintDeps / execution security
// ═══════════════════════════════════════════════════════════════════════════════

function checkPrintDeps() {
  if (os.platform() !== 'win32') {
    return record('PrintDeps.exe', 'SKIP', `Not applicable on ${os.platform()}`);
  }
  const output = cmd('tasklist /FI "IMAGENAME eq PrintDeps.exe" /NH 2>nul');
  if (output && output.includes('PrintDeps.exe')) {
    return record(
      'PrintDeps.exe',
      'WARN',
      'RUNNING — will block Playwright browser executables. ' +
      'Request IT to whitelist: %USERPROFILE%\\.cache\\ms-playwright\\'
    );
  }
  return record('PrintDeps.exe', 'PASS', 'Not running');
}

function checkPlaywrightBinaries() {
  if (!existsSync(path.join('node_modules', '@playwright'))) {
    return record('Playwright browser binaries', 'SKIP', 'Playwright not installed yet — run npm install first');
  }
  const result = spawnSync(
    process.execPath,
    ['-e', "const {chromium}=require('@playwright/test');process.stdout.write(chromium.executablePath())"],
    { cwd: process.cwd(), timeout: 8000, stdio: 'pipe' }
  );
  if (result.status === 0) {
    const binPath = result.stdout.toString().trim();
    const exists  = existsSync(binPath);
    return exists
      ? record('Playwright browser binaries', 'PASS', `Chromium found and accessible`)
      : record('Playwright browser binaries', 'FAIL',
          'Binary path returned but file missing — run: npx playwright install chromium');
  }
  const err = result.stderr?.toString() || '';
  if (err.includes('EACCES') || err.includes('EPERM') || err.includes('access denied')) {
    return record('Playwright browser binaries', 'FAIL',
      'BLOCKED — PrintDeps.exe or endpoint security is preventing execution. Request IT whitelisting.');
  }
  return record('Playwright browser binaries', 'WARN', `Could not verify: ${err.substring(0, 100)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — npm registry & connectivity
// ═══════════════════════════════════════════════════════════════════════════════

function checkNpmRegistry() {
  const registry = cmd('npm config get registry') || 'unknown';
  const isPublic = registry.includes('registry.npmjs.org');
  const label    = isPublic ? 'Public npm registry' : `Corporate registry: ${registry}`;
  return record(
    'npm registry',
    isPublic ? 'PASS' : 'WARN',
    isPublic ? registry : `${registry} — packages must be available here for all sessions`
  );
}

async function checkConnectivity(label, url) {
  const r = await httpGet(url);
  if (r.ok && r.status < 500) return record(`Connectivity: ${label}`, 'PASS', `HTTP ${r.status}`);
  return record(`Connectivity: ${label}`, 'FAIL', r.error || `HTTP ${r.status}`);
}

async function checkArtifactory() {
  if (!config.ARTIFACTORY_URL) {
    return record('Connectivity: GCP Artifactory', 'SKIP', 'ARTIFACTORY_URL not set in config.js');
  }
  return checkConnectivity('GCP Artifactory', config.ARTIFACTORY_URL);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — npm package availability per session
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_PACKAGES = {
  'Session 1-3 (Core)': [
    '@playwright/test',
    'typescript',
    '@types/node',
    'ts-node',
  ],
  'Session 5 (BDD + Mocking)': [
    '@cucumber/cucumber',
    'ajv',
    'mokapi',
  ],
  'Session 6 (Visual + Allure)': [
    'allure-playwright',
    'allure-commandline',
  ],
};

async function checkPackageAvailability() {
  const registry = cmd('npm config get registry') || 'npm registry';
  console.log(`  ${C.dim}Querying: ${registry}${C.reset}\n`);

  for (const [sessionLabel, packages] of Object.entries(SESSION_PACKAGES)) {
    console.log(`  ${C.dim}${sessionLabel}${C.reset}`);
    results.packageChecks[sessionLabel] = {};

    for (const pkg of packages) {
      const version = npmView(pkg);
      if (version) {
        results.packageChecks[sessionLabel][pkg] = { available: true, version };
        console.log(`    [${PASS}] ${pkg}@${version}`);
      } else {
        results.packageChecks[sessionLabel][pkg] = { available: false };
        console.log(`    [${FAIL}] ${pkg} — NOT found in registry. Ask Artifactory admin to add it.`);
      }
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Per-session readiness summary
// ═══════════════════════════════════════════════════════════════════════════════

function buildSessionReadiness() {
  const getStatus = (name) => {
    const c = results.checks.find(c => c.name === name);
    return c ? c.status : 'SKIP';
  };

  const pkgOk = (label, pkg) => {
    return results.packageChecks[label]?.[pkg]?.available !== false;
  };

  const allPkgsOk = (label) => {
    const group = results.packageChecks[label] || {};
    return Object.values(group).every(v => v.available !== false);
  };

  const nodeOk     = getStatus('Node.js version') === 'PASS';
  const npmOk      = ['PASS', 'WARN'].includes(getStatus('npm'));
  const gitOk      = getStatus('Git') === 'PASS';
  const writeOk    = getStatus('Write permissions') === 'PASS';
  const coreOk     = nodeOk && npmOk && gitOk && writeOk;
  const playwrightOk = allPkgsOk('Session 1-3 (Core)');
  const noBrowserBlock = getStatus('PrintDeps.exe') !== 'FAIL' &&
                         getStatus('Playwright browser binaries') !== 'FAIL';

  const javaOk   = ['PASS', 'WARN'].includes(getStatus('Java JDK'));
  const dockerOk = ['PASS', 'WARN'].includes(getStatus('Docker'));

  const sessions = {
    'Session 1 — TypeScript Fundamentals': {
      ready: coreOk && pkgOk('Session 1-3 (Core)', 'typescript') && pkgOk('Session 1-3 (Core)', 'ts-node'),
      blockers: [],
    },
    'Session 2 — Playwright Core': {
      ready: coreOk && playwrightOk && noBrowserBlock,
      blockers: [],
    },
    'Session 3 — Stability & POM': {
      ready: coreOk && playwrightOk && noBrowserBlock,
      blockers: [],
    },
    'Session 4 — Hybrid Testing': {
      ready: coreOk && playwrightOk && noBrowserBlock,
      blockers: [],
    },
    'Session 5 — BDD + Mocking': {
      ready: coreOk && playwrightOk && noBrowserBlock && allPkgsOk('Session 5 (BDD + Mocking)'),
      blockers: [],
    },
    'Session 6 — Visual + Framework': {
      ready: coreOk && playwrightOk && noBrowserBlock && allPkgsOk('Session 6 (Visual + Allure)') && javaOk,
      blockers: [],
    },
    'Session 7 — Performance + Security': {
      ready: javaOk,
      blockers: [],
    },
  };

  // Build blockers list
  if (!nodeOk) sessions['Session 1 — TypeScript Fundamentals'].blockers.push('Node.js ≥20 required');
  if (!noBrowserBlock) {
    ['Session 2 — Playwright Core', 'Session 3 — Stability & POM',
     'Session 4 — Hybrid Testing', 'Session 5 — BDD + Mocking',
     'Session 6 — Visual + Framework'].forEach(s => {
      sessions[s].blockers.push('Browser blocked by PrintDeps.exe or missing binaries');
    });
  }

  ['@cucumber/cucumber', 'ajv', 'mokapi'].forEach(pkg => {
    if (!pkgOk('Session 5 (BDD + Mocking)', pkg)) {
      sessions['Session 5 — BDD + Mocking'].blockers.push(`${pkg} not in registry`);
    }
  });

  ['allure-playwright', 'allure-commandline'].forEach(pkg => {
    if (!pkgOk('Session 6 (Visual + Allure)', pkg)) {
      sessions['Session 6 — Visual + Framework'].blockers.push(`${pkg} not in registry`);
    }
  });

  if (!javaOk) {
    sessions['Session 6 — Visual + Framework'].blockers.push('Java JDK needed for allure-commandline');
    sessions['Session 7 — Performance + Security'].blockers.push('Java JDK required for Rest Assured');
  }

  if (getStatus('Maven') === 'FAIL' && getStatus('Gradle') === 'FAIL') {
    sessions['Session 7 — Performance + Security'].blockers.push('Maven or Gradle required for Rest Assured');
  }

  results.sessionReadiness = sessions;
  return sessions;
}

function printSessionReadiness(sessions) {
  console.log(C.bold + '─'.repeat(65) + C.reset);
  console.log(`${C.bold}SESSION READINESS SUMMARY${C.reset}`);
  console.log(C.bold + '─'.repeat(65) + C.reset);

  for (const [session, info] of Object.entries(sessions)) {
    const icon   = info.ready ? `${C.green}READY  ${C.reset}` : `${C.red}BLOCKED${C.reset}`;
    console.log(`  ${icon}  ${session}`);
    if (!info.ready && info.blockers.length > 0) {
      info.blockers.forEach(b => console.log(`           ${C.red}↳ ${b}${C.reset}`));
    }
  }
  console.log(C.bold + '─'.repeat(65) + C.reset);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Overall summary
// ═══════════════════════════════════════════════════════════════════════════════

function printOverallSummary() {
  const passed  = results.checks.filter(c => c.status === 'PASS').length;
  const failed  = results.checks.filter(c => c.status === 'FAIL').length;
  const warned  = results.checks.filter(c => c.status === 'WARN').length;
  const skipped = results.checks.filter(c => c.status === 'SKIP').length;

  console.log(`\n  ${C.green}Passed${C.reset}   : ${passed}`);
  console.log(`  ${C.red}Failed${C.reset}   : ${failed}`);
  console.log(`  ${C.yellow}Warnings${C.reset} : ${warned}`);
  console.log(`  ${C.cyan}Skipped${C.reset}  : ${skipped}`);

  if (failed > 0) {
    console.log(`\n${C.red}${C.bold}CRITICAL FAILURES — resolve FAIL items before the course.${C.reset}`);
  } else if (warned > 0) {
    console.log(`\n${C.yellow}Warnings found — review and address where possible.${C.reset}`);
  } else {
    console.log(`\n${C.green}${C.bold}All checks passed.${C.reset}`);
  }

  return failed === 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

(async () => {
  console.log(`\n${C.bold}Playwright Bootcamp — Pre-flight Environment Check${C.reset}`);
  console.log(`${'─'.repeat(65)}`);
  console.log(`Platform : ${os.platform()} ${os.release()} ${os.arch()}`);
  console.log(`User     : ${os.userInfo().username}`);
  console.log(`Date     : ${new Date().toLocaleString()}\n`);

  // ── 1. Core toolchain ──────────────────────────────────────────────────────
  section('1. Core Toolchain');
  checkNode();
  checkNpm();
  checkGit();
  checkTypeScript();
  checkVSCode();
  checkWritePermission();

  // ── 2. Java / JVM ──────────────────────────────────────────────────────────
  section('2. Java / JVM Stack  (Session 7)');
  checkJava();
  checkMaven();
  checkGradle();

  // ── 3. Docker ─────────────────────────────────────────────────────────────
  section('3. Docker  (Session 5 — Mokapi)');
  checkDocker();

  // ── 4. Performance tooling ─────────────────────────────────────────────────
  section('4. Performance Tooling  (Session 7)');
  checkK6();

  // ── 5. Execution security ──────────────────────────────────────────────────
  section('5. Execution Security');
  checkPrintDeps();
  checkPlaywrightBinaries();

  // ── 6. Network ────────────────────────────────────────────────────────────
  section('6. Network & Registry');
  checkNpmRegistry();
  await checkConnectivity('GitHub', 'https://github.com');
  await checkConnectivity('Public npm', 'https://registry.npmjs.org');
  await checkArtifactory();

  // ── 7. Package availability ────────────────────────────────────────────────
  section('7. npm Package Availability by Session');
  await checkPackageAvailability();

  // ── 8. Session readiness ───────────────────────────────────────────────────
  const sessions = buildSessionReadiness();
  printSessionReadiness(sessions);

  // ── Overall ────────────────────────────────────────────────────────────────
  const allPassed = printOverallSummary();

  // Write results
  writeFileSync(
    'validation-results/preflight.json',
    JSON.stringify({ ...results, allPassed }, null, 2),
    'utf8'
  );
  console.log(`\nResults saved to: validation-results/preflight.json\n`);

  process.exit(allPassed ? 0 : 1);
})();
