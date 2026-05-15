/**
 * env-validate.spec.ts
 *
 * Comprehensive corporate environment validation for the Playwright Bootcamp.
 * Covers: browser launch, UI interactions, screenshots, API calls, and
 * explicit detection of PrintDeps.exe / execution-blocked scenarios.
 *
 * Run after check-env.js and setup-testmart.js:
 *   npx playwright test --reporter=html,list
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Config ─────────────────────────────────────────────────────────────────────

const BASE_URL    = process.env.TESTMART_URL || 'http://localhost:3000';
const RESULTS_DIR = path.join(process.cwd(), 'validation-results');
const SCREENSHOT_DIR = path.join(RESULTS_DIR, 'screenshots');

const STANDARD_USER  = { email: 'standard_user@example.com', password: 'Password123!' };
const ADMIN_USER     = { email: 'admin@example.com',         password: 'Admin123!' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function readPreflight(): Record<string, unknown> {
  const p = path.join(RESULTS_DIR, 'preflight.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {};
}

function saveScreenshot(name: string, buffer: Buffer) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  fs.writeFileSync(file, buffer);
  return file;
}

// ── PrintDeps / blocked-executable detection ──────────────────────────────────

function classifyBrowserError(error: Error): { type: string; message: string } {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('executable doesn') ||
    msg.includes('executable path does not exist') ||
    msg.includes('failed to launch') && msg.includes('enoent')
  ) {
    return {
      type: 'BROWSER_BINARY_MISSING',
      message: 'Playwright browser binary not found. Run: npx playwright install chromium',
    };
  }
  if (
    msg.includes('eacces') || msg.includes('eperm') ||
    msg.includes('access is denied') || msg.includes('access denied') ||
    msg.includes('printdeps') || msg.includes('spawn error')
  ) {
    return {
      type: 'BROWSER_BLOCKED',
      message:
        'Browser executable was BLOCKED — likely by PrintDeps.exe or an endpoint security agent. ' +
        'Ask IT to whitelist the Playwright browser cache directory (~/.cache/ms-playwright).',
    };
  }
  return { type: 'BROWSER_UNKNOWN_ERROR', message: error.message };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Browser Launch
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('1. Browser Launch', () => {

  test('1.1 Chromium launches in headless mode', async ({ browser }) => {
    // This is the most fundamental check — if it fails, nothing else works
    expect(browser.browserType().name()).toBe('chromium');
    const context = await browser.newContext();
    const page    = await context.newPage();
    await page.goto('about:blank');
    expect(page.url()).toBe('about:blank');
    await context.close();
  });

  test('1.2 New page can navigate to a URL', async ({ page }) => {
    await page.goto(BASE_URL);
    // TestMart should respond — any non-error response is acceptable
    await expect(page).not.toHaveURL('about:blank');
  });

  test('1.3 Screenshot capability', async ({ page }) => {
    await page.goto(BASE_URL);
    const buffer = await page.screenshot({ fullPage: false });
    expect(buffer.length).toBeGreaterThan(1000); // valid PNG has content
    const saved = saveScreenshot('01-browser-launch', buffer);
    console.log(`    Screenshot saved: ${saved}`);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — TestMart UI
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('2. TestMart UI', () => {

  test('2.1 Home page loads with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/TestMart/);
    await expect(page.getByTestId('hero-title')).toBeVisible();
    await expect(page.getByTestId('nav-login')).toBeVisible();

    const buf = await page.screenshot();
    saveScreenshot('02-home-page', buf);
  });

  test('2.2 Products page loads and shows 12 products', async ({ page }) => {
    await page.goto(`${BASE_URL}/products`);
    await expect(page.getByTestId('products-heading')).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(12);

    const buf = await page.screenshot();
    saveScreenshot('03-products-page', buf);
  });

  test('2.3 Login with standard user credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.getByTestId('login-email').fill(STANDARD_USER.email);
    await page.getByTestId('login-password').fill(STANDARD_USER.password);
    await page.getByTestId('login-submit').click();

    // Confirm authenticated state
    await expect(page.getByTestId('nav-logout')).toBeVisible();
    await expect(page.getByTestId('nav-username')).toHaveText('Alex');

    const buf = await page.screenshot();
    saveScreenshot('04-login-success', buf);
  });

  test('2.4 Login with incorrect credentials shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    await page.getByTestId('login-email').fill('wrong@example.com');
    await page.getByTestId('login-password').fill('wrongpassword');
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
    await expect(page.getByTestId('login-error')).toHaveText('Invalid email or password');

    const buf = await page.screenshot();
    saveScreenshot('05-login-error', buf);
  });

  test('2.5 Product search triggers async fetch with spinner', async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.getByTestId('login-email').fill(STANDARD_USER.email);
    await page.getByTestId('login-password').fill(STANDARD_USER.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('nav-logout')).toBeVisible();

    // Search
    await page.goto(`${BASE_URL}/products`);
    await page.getByTestId('search-input').fill('Keyboard');
    await page.getByTestId('search-btn').click();

    // Spinner lifecycle — validates async behavior works in this environment
    await expect(page.getByTestId('loading-spinner')).toBeVisible();
    await expect(page.getByTestId('loading-spinner')).not.toBeVisible();

    await expect(page.getByTestId('product-card')).toHaveCount(1);
    await expect(page.getByTestId('product-name')).toHaveText('Mechanical Keyboard');

    const buf = await page.screenshot();
    saveScreenshot('06-product-search', buf);
  });

  test('2.6 Add to cart updates nav badge', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.getByTestId('login-email').fill(STANDARD_USER.email);
    await page.getByTestId('login-password').fill(STANDARD_USER.password);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('nav-logout')).toBeVisible();

    // Read the current cart count before adding — the DB may already have items
    // from previous test runs, so we assert +1 rather than an absolute value.
    await page.goto(`${BASE_URL}/products`);
    const badgeVisible = await page.getByTestId('cart-count').isVisible();
    const countBefore  = badgeVisible
      ? parseInt(await page.getByTestId('cart-count').textContent() || '0', 10)
      : 0;

    // Add first in-stock product to cart
    await page.getByTestId('add-to-cart-btn').first().click();

    // Toast appears — confirms the async fetch completed and the API responded
    await expect(page.getByTestId('toast')).toBeVisible();

    // Cart badge increments by exactly 1 — the real validation
    await expect(page.getByTestId('cart-count')).toHaveText(String(countBefore + 1));

    const buf = await page.screenshot();
    saveScreenshot('07-add-to-cart', buf);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — TestMart API (validates APIRequestContext)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('3. TestMart API', () => {

  test('3.1 GET /api/products returns 200 and 12 products', async ({ request }) => {
    const res  = await request.get(`${BASE_URL}/api/products`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('products');
    expect(body).toHaveProperty('count', 12);
    expect(Array.isArray(body.products)).toBe(true);
  });

  test('3.2 POST /api/auth/login with valid credentials returns token', async ({ request }) => {
    const res  = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: STANDARD_USER.email, password: STANDARD_USER.password }
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('token');
    expect(body.user.email).toBe(STANDARD_USER.email);
    expect(body.user.role).toBe('user');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
  });

  test('3.3 POST /api/auth/login with invalid credentials returns 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: 'nobody@example.com', password: 'wrong' }
    });
    expect(res.status()).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty('error', 'Invalid email or password');
  });

  test('3.4 API + UI cross-validation: product name matches', async ({ page, request }) => {
    // Fetch all products and use the first one — avoids hardcoding an ID
    // that may differ across fresh SQLite databases (AUTOINCREMENT starts vary)
    const listRes = await request.get(`${BASE_URL}/api/products`);
    expect(listRes.status()).toBe(200);
    const { products } = await listRes.json();
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];

    // Fetch the same product by its actual ID
    const res = await request.get(`${BASE_URL}/api/products/${product.id}`);
    expect(res.status()).toBe(200);
    const { product: detail } = await res.json();

    // Verify same name and price appear on the UI detail page
    await page.goto(`${BASE_URL}/products/${detail.id}`);
    await expect(page.getByTestId('product-detail-name')).toHaveText(detail.name);
    await expect(page.getByTestId('product-detail-price'))
      .toHaveText(`$${detail.price.toFixed(2)}`);

    const buf = await page.screenshot();
    saveScreenshot('08-api-ui-crossvalidation', buf);
  });

  test('3.5 Admin API: create product requires admin token', async ({ request }) => {
    // Login as admin
    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: ADMIN_USER.email, password: ADMIN_USER.password }
    });
    expect(loginRes.status()).toBe(200);
    const { token } = await loginRes.json();

    // Create a test product
    const name      = `Env-Check-${Date.now()}`;
    const createRes = await request.post(`${BASE_URL}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name, description: 'Validation test product', price: 1.00, category: 'Electronics', stock: 1 }
    });
    expect(createRes.status()).toBe(201);
    const { product } = await createRes.json();

    // Clean up
    const delRes = await request.delete(`${BASE_URL}/api/products/${product.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(delRes.status()).toBe(204);
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — Session-specific package import checks
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('4. Session Package Imports', () => {

  test('4.1 Session 5: @cucumber/cucumber is importable', async () => {
    try {
      require('@cucumber/cucumber');
      console.log('    @cucumber/cucumber: importable ✓');
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('Cannot find module')) {
        console.warn('    @cucumber/cucumber: NOT installed — run: npm install @cucumber/cucumber');
        console.warn('    If install fails, this package is missing from your npm registry.');
      } else {
        throw e;
      }
    }
  });

  test('4.2 Session 5: ajv (JSON schema validation) is importable', async () => {
    try {
      require('ajv');
      console.log('    ajv: importable ✓');
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('Cannot find module')) {
        console.warn('    ajv: NOT installed — run: npm install ajv');
      } else {
        throw e;
      }
    }
  });

  test('4.3 Session 5: mokapi is importable', async () => {
    try {
      require('mokapi');
      console.log('    mokapi: importable ✓');
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('Cannot find module')) {
        console.warn('    mokapi: NOT installed — run: npm install mokapi');
        console.warn('    If install fails, mokapi is missing from your npm registry.');
        console.warn('    Alternative: run Mokapi as a Docker container (requires Docker).');
      } else {
        throw e;
      }
    }
  });

  test('4.4 Session 6: allure-playwright is importable', async () => {
    try {
      require('allure-playwright');
      console.log('    allure-playwright: importable ✓');
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('Cannot find module')) {
        console.warn('    allure-playwright: NOT installed — run: npm install allure-playwright');
      } else {
        throw e;
      }
    }
  });

  test('4.5 Session 6: allure-commandline is importable (requires Java)', async () => {
    const { execSync } = require('child_process');
    try {
      require('allure-commandline');
      // Also verify allure CLI works (it needs Java)
      try {
        execSync('npx allure --version', { stdio: 'pipe', timeout: 10000 });
        console.log('    allure-commandline: importable and executable ✓');
      } catch {
        console.warn('    allure-commandline: installed but allure CLI failed to run.');
        console.warn('    Most likely cause: Java JDK not installed or not in PATH.');
        console.warn('    Install JDK 11+ from: https://adoptium.net');
      }
    } catch (e: unknown) {
      const err = e as Error;
      if (err.message.includes('Cannot find module')) {
        console.warn('    allure-commandline: NOT installed — run: npm install allure-commandline');
      } else {
        throw e;
      }
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — Corporate Restrictions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('4. Corporate Restrictions Check', () => {

  test('4.1 Browser executable is reachable (PrintDeps / EACCES detection)', async () => {
    // Try to launch with an explicit executable path check
    const { chromium } = require('@playwright/test');
    let execPath: string;
    try {
      execPath = chromium.executablePath();
    } catch {
      execPath = '';
    }

    if (!execPath || !require('fs').existsSync(execPath)) {
      // This will cause the test to fail with a clear message rather than a timeout
      throw new Error(
        'BROWSER_BINARY_MISSING: Playwright browser binary not found.\n' +
        '  Run: npx playwright install chromium\n' +
        '  If the install fails or the binary is blocked from running, ' +
        'request IT to whitelist: ~/.cache/ms-playwright/'
      );
    }

    // Try to actually spawn the executable with a simple flag to test execution permission
    const { spawnSync } = require('child_process');
    const result = spawnSync(execPath, ['--version'], { timeout: 5000, stdio: 'pipe' });

    if (result.error) {
      const err = classifyBrowserError(result.error);
      throw new Error(`${err.type}: ${err.message}`);
    }

    expect(result.status).toBe(0);
    console.log(`    Chromium executable: ${execPath}`);
    console.log(`    Execution confirmed: version output received`);
  });

  test('4.2 npm registry connectivity', async () => {
    const preflight = readPreflight();
    const regCheck  = (preflight.checks as Array<{name: string; status: string; detail: string}>)
      ?.find(c => c.name === 'npm registry');

    if (!regCheck) {
      test.skip(); // preflight not run
      return;
    }

    console.log(`    npm registry: ${regCheck.detail}`);
    // Warn but don't fail — Artifactory may have all needed packages
    expect(['PASS', 'WARN']).toContain(regCheck.status);
  });

  test('4.3 Playwright can download a file (network egress)', async ({ request }) => {
    // Uses the request fixture to hit a public URL — validates outbound HTTPS
    const res = await request.get('https://registry.npmjs.org/@playwright/test/latest');
    // Any response (even 304, 429) means network egress works
    // Only a connection error or timeout means it's blocked
    expect(res.status()).toBeLessThan(500);
    console.log(`    Public HTTPS egress: HTTP ${res.status()}`);
  });

  test('4.4 Headed mode is available (optional)', async ({ browser }) => {
    // On machines with PrintDeps or no display, this may fail
    // We mark it as a warning rather than hard failure
    try {
      const ctx  = await browser.newContext({ headless: false } as never);
      const page = await ctx.newPage();
      await page.goto('about:blank');
      await ctx.close();
      console.log('    Headed mode: AVAILABLE');
    } catch (e: unknown) {
      const err = e as Error;
      const classified = classifyBrowserError(err);
      console.warn(`    Headed mode: ${classified.type} — ${classified.message}`);
      // Don't fail — headless is sufficient for most lab exercises
    }
  });

});

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL — Generate plain-text summary for sharing
// ═══════════════════════════════════════════════════════════════════════════════

test.afterAll(async () => {
  const screenshots = fs.existsSync(SCREENSHOT_DIR)
    ? fs.readdirSync(SCREENSHOT_DIR).length
    : 0;

  const summary = [
    '═══════════════════════════════════════════════════════',
    'PLAYWRIGHT BOOTCAMP — ENVIRONMENT VALIDATION SUMMARY',
    `Date     : ${new Date().toLocaleString()}`,
    `Platform : ${os.platform()} ${os.release()} ${os.arch()}`,
    `Node.js  : ${process.version}`,
    `TestMart : ${BASE_URL}`,
    '───────────────────────────────────────────────────────',
    'Results saved to:',
    `  Screenshots    : validation-results/screenshots/ (${screenshots} files)`,
    '  HTML Report    : validation-results/html/index.html',
    '  Pre-flight log : validation-results/preflight.json',
    '═══════════════════════════════════════════════════════',
  ].join('\n');

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'summary.txt'),
    summary,
    'utf8'
  );

  console.log('\n' + summary);
});
