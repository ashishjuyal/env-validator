# Playwright Bootcamp — Environment Validator

A self-contained validation suite that confirms a corporate laptop is correctly
configured for the Playwright Automation Bootcamp hands-on labs.

Covers: Node.js, npm, Git, VS Code, Java JDK, Docker, network connectivity,
GCP Artifactory, PrintDeps.exe detection, Playwright browser launch, UI
interactions, screenshots, and API testing — with a per-session readiness
summary so IT knows exactly what to fix before the course.

**TestMart** (the demo application) is downloaded automatically from:
https://github.com/ashishjuyal/testmart

---

## Prerequisites — GCP Artifactory Setup

If your organisation uses GCP Artifactory as the npm registry, complete this
once before running the validator. If you use the public npm registry, skip
this section entirely.

### 1. Confirm your registry URL

Your IT or DevOps team will provide a URL in this format:

```
https://<host>/artifactory/api/npm/<repository-name>/
```

Set it in `config.js`:

```js
ARTIFACTORY_URL: 'https://your-host/artifactory/api/npm/npm-repo/',
```

### 2. Configure `.npmrc` with your auth token

npm reads credentials from `~/.npmrc` (your home directory). Create or edit
that file and add the following two lines — replacing the values with what your
IT team provides:

```
registry=https://<host>/artifactory/api/npm/<repository-name>/
//<host>/artifactory/api/npm/<repository-name>/:_authToken=<YOUR_API_TOKEN>
```

**How to get your API token:**

1. Log in to your Artifactory instance in a browser
2. Click your username (top right) → **Edit Profile**
3. Under **Authentication Settings**, click **Generate API Key** (or copy an existing one)
4. Paste the key as `_authToken` in your `.npmrc`

### 3. Verify the configuration works

```bash
npm ping
```

A successful response confirms npm can reach and authenticate against
Artifactory. If this fails, resolve it before running the validator — the
package availability checks will fail without it.

> **Note:** Never commit `.npmrc` to source control if it contains an auth
> token. Add `.npmrc` to your `.gitignore`.

---

## Quick Start

### First time (fresh download)

```bash
npm install
npx playwright install chromium
npm run validate
```

`npm install` and `npx playwright install chromium` are required once to install
dependencies and download the Chromium browser binary. After that, re-runs only
need `npm run validate`.

### Subsequent runs

```bash
npm run validate
```

`npm run validate` runs all three stages in sequence: pre-flight checks,
TestMart download and setup, then the full Playwright test suite.
TestMart is stopped automatically when tests finish.

---

## Step-by-step (if the one-liner fails at any stage)

### Step 1 — Configure (optional)

`config.js` is pre-configured with sensible defaults. The only value you may
need to change is `ARTIFACTORY_URL` if your organisation uses GCP Artifactory
as the npm registry:

```js
// config.js
ARTIFACTORY_URL: 'https://your-artifactory-host/artifactory/api/npm/npm-repo/',
```

Everything else — including the TestMart GitHub URL — works out of the box.

### Step 2 — Install dependencies

```bash
npm install
npx playwright install chromium
```

`npm install` installs `@playwright/test`, `typescript`, and `@types/node`.
`npx playwright install chromium` downloads the Chromium browser binary.

If either command fails, run `node check-env.js` first to diagnose the issue
(PrintDeps.exe, missing registry packages, etc.) before retrying.

### Step 3 — Pre-flight check (no npm install needed)

```bash
node check-env.js
```

Runs with zero npm dependencies. Checks:
- Node.js, npm, Git, VS Code
- Java JDK, Maven/Gradle (Session 7)
- Docker (Session 5 — Mokapi demo)
- PrintDeps.exe detection (Windows)
- npm registry and network connectivity
- Package availability for all sessions (Sessions 1–6)

Produces a **session readiness summary** showing which sessions are READY
and which are BLOCKED, with named blockers for IT to resolve.

**Fix any FAIL items before continuing.**

### Step 4 — Install Playwright browsers (if not done in Step 2)

```bash
npx playwright install chromium
```

If `npx playwright install chromium` fails with a permission error, PrintDeps.exe
or an endpoint security agent is blocking the executable.
See the **Troubleshooting** section below.

### Step 5 — Download and start TestMart

```bash
node setup-testmart.js
```

Downloads TestMart from `https://github.com/ashishjuyal/testmart`, installs
its dependencies, seeds the database, and starts the server on port 3000.

### Step 6 — Run validation tests

```bash
npm test
```

Runs validation tests across five groups:
1. Browser launch and screenshot capability
2. TestMart UI (login, search, cart, async spinner)
3. TestMart API (GET, POST, auth, admin operations)
4. Session package imports (Cucumber, ajv, Allure — Sessions 5 & 6)
5. Corporate restrictions (PrintDeps, network egress, headed mode)

### Step 7 — View the report

```bash
npm run report
```

Opens the HTML report in your browser. All screenshots are saved to
`validation-results/screenshots/`.

---

## What gets validated

### Environment checks (`check-env.js`)

| # | Check | Session relevance |
|---|-------|-----------------|
| 1 | Node.js ≥ 20 | All |
| 2 | npm ≥ 9 | All |
| 3 | Git | All |
| 4 | VS Code CLI (`code`) | All |
| 5 | Write permissions | All |
| 6 | Java JDK ≥ 11 | Sessions 6–7 (Allure CLI, Rest Assured) |
| 7 | Maven / Gradle | Session 7 (Rest Assured) |
| 8 | Docker | Session 5 (Mokapi demo) |
| 9 | PrintDeps.exe running? | All (browser execution blocker) |
| 10 | Chromium binary present and executable | Sessions 2–6 |
| 11 | npm registry (public or Artifactory) | All |
| 12 | GitHub connectivity | All (TestMart download) |
| 13 | GCP Artifactory (if configured) | All |
| 14 | `@playwright/test`, `typescript`, `@types/node`, `ts-node` | Sessions 1–4 |
| 15 | `@cucumber/cucumber`, `ajv` | Session 5 |
| 16 | `allure-playwright`, `allure-commandline` | Session 6 |

### Playwright tests (`tests/env-validate.spec.ts`)

| # | Check | Why it matters |
|---|-------|---------------|
| 1 | Chromium launches headless | Browser works at all |
| 2 | Page navigates to a URL | Networking from browser |
| 3 | Screenshot captured | Screenshot capability |
| 4 | TestMart home page loads | Full stack working |
| 5 | Products page shows 12 items | Database seeded correctly |
| 6 | Login with valid credentials | Session handling |
| 7 | Login error with invalid credentials | Error state rendering |
| 8 | Product search with async spinner | Dynamic element handling |
| 9 | Add to cart updates nav badge | Async UI + toast lifecycle |
| 10 | GET /api/products → 200 + 12 items | API request context works |
| 11 | POST /api/auth/login → token | Auth API works |
| 12 | Auth failure → 401 | Error response handling |
| 13 | API + UI cross-validation | Integration check |
| 14 | Admin create + delete product | Admin auth + cleanup |
| 15 | `@cucumber/cucumber` importable | Session 5 ready |
| 16 | `ajv` importable | Session 5 ready |
| 17 | `mokapi` importable (optional) | Session 5 demo |
| 18 | `allure-playwright` importable | Session 6 ready |
| 19 | `allure-commandline` + Java runnable | Session 6 fully ready |
| 20 | Browser executable not blocked | PrintDeps / EACCES detection |
| 21 | npm registry accessible | Package installs will work |
| 22 | Public HTTPS egress | Outbound network not blocked |

---

## Output files

After a run, `validation-results/` contains:

```
validation-results/
├── preflight.json          ← machine-readable pre-flight + session readiness
├── testmart.zip            ← downloaded TestMart archive
├── testmart.pid            ← TestMart server PID (for teardown)
├── testmart.log            ← TestMart server output
├── testmart-meta.json      ← TestMart config (path, port, pid)
├── test-results.json       ← Playwright JSON results
├── summary.txt             ← plain-text summary (share with IT / instructor)
├── html/
│   └── index.html          ← full HTML report (open in browser)
├── screenshots/
│   ├── 01-browser-launch.png
│   ├── 02-home-page.png
│   ├── 03-products-page.png
│   ├── 04-login-success.png
│   ├── 05-login-error.png
│   ├── 06-product-search.png
│   ├── 07-add-to-cart.png
│   └── 08-api-ui-crossvalidation.png
└── test-artifacts/         ← Playwright traces (on retry)
```

Share `validation-results/summary.txt` and `screenshots/` with your instructor
or IT team.

---

## About Mokapi

Mokapi is a standalone Go binary used for HTTP
and Kafka mocking. It is demonstrated by the instructor and does not require
installation by participants.

To follow the demo locally you need Docker:

```bash
docker run -it --rm -p 8080:8080 mokapi/mokapi serve
```

Binary downloads: https://github.com/marle3003/mokapi/releases

Participants without Docker use Playwright's built-in `page.route()` for all
mocking exercises — no additional tooling required.

---

## Troubleshooting

### `npx playwright install chromium` fails or browser won't launch

**Symptom:** `Executable doesn't exist` or `EACCES` / `EPERM` or `access denied`.

**Cause:** PrintDeps.exe or an endpoint security agent is blocking the
downloaded browser executable.

**Fix:** Ask IT to whitelist the Playwright cache directory:

- **Windows:** `C:\Users\<username>\.cache\ms-playwright\`
- **macOS/Linux:** `~/.cache/ms-playwright/`

---

### npm install fails — packages not found in Artifactory

**Symptom:** `404 Not Found` during `npm install`.

**Cause:** GCP Artifactory does not proxy the required packages.

**Fix:** Ask the Artifactory administrator to add the following packages:

| Session | Required packages |
|---------|-----------------|
| Sessions 1–4 | `@playwright/test`, `typescript`, `@types/node`, `ts-node` |
| Session 5 | `@cucumber/cucumber`, `ajv` |
| Session 6 | `allure-playwright`, `allure-commandline` |

---

### `node setup-testmart.js` hangs on download

**Symptom:** Download stalls or times out.

**Cause:** GitHub may be slow or blocked through a corporate proxy.

**Fix:** Request that IT pre-download
`https://github.com/ashishjuyal/testmart/archive/refs/heads/main.zip`
and distribute it via an internal file share. Then set:

```bash
TESTMART_GITHUB_ZIP=http://internal-share/testmart.zip node setup-testmart.js
```

---

### TestMart starts but tests fail to connect

**Symptom:** `ERR_CONNECTION_REFUSED` on `http://localhost:3000`.

**Cause:** Port 3000 is blocked or already in use.

**Fix:** Set a different port:

```bash
TESTMART_PORT=4000 node setup-testmart.js
TESTMART_URL=http://localhost:4000 npm test
```

---

### `allure generate` fails even though allure-commandline is installed

**Symptom:** Allure CLI exits with a Java error or is not found.

**Cause:** `allure-commandline` is a Java application. Java JDK 11+ must be
installed and in PATH.

**Fix:** Install JDK 11+ from https://adoptium.net and ensure `java -version`
works in the same terminal.

---

## Stopping TestMart

TestMart is **stopped automatically** when the Playwright tests finish via
`globalTeardown` in `playwright.config.ts`. You do not need to do anything.

If you need to stop it manually (e.g. after a cancelled run):

```bash
node -e "
  const fs = require('fs');
  const pid = fs.readFileSync('validation-results/testmart.pid', 'utf8').trim();
  process.kill(parseInt(pid));
  console.log('TestMart stopped (PID ' + pid + ')');
"
```
