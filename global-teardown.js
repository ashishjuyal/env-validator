/**
 * global-teardown.js — Stops the TestMart server after all Playwright tests complete.
 * Runs automatically via globalTeardown in playwright.config.ts.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  const pidFile = path.join(process.cwd(), 'validation-results', 'testmart.pid');

  if (!fs.existsSync(pidFile)) {
    console.log('\n  TestMart: no PID file found — server may not have been started by this run.');
    return;
  }

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (isNaN(pid)) {
    console.log('\n  TestMart: PID file is invalid — skipping shutdown.');
    return;
  }

  try {
    process.kill(pid);
    fs.unlinkSync(pidFile);
    console.log(`\n  TestMart stopped (PID ${pid}).`);
  } catch (e) {
    if (e.code === 'ESRCH') {
      // Process was already gone — clean up the stale PID file
      fs.unlinkSync(pidFile);
      console.log(`\n  TestMart (PID ${pid}) was already stopped.`);
    } else {
      console.warn(`\n  TestMart shutdown warning: ${e.message}`);
    }
  }
};
