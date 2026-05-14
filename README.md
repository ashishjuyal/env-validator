# Playwright Bootcamp — Environment Validator

A self-contained validation suite that confirms a corporate laptop is correctly
configured for the Playwright Automation Bootcamp hands-on labs.

Covers: Node.js, npm, Git, VS Code, network connectivity, GCP Artifactory,
PrintDeps.exe detection, Playwright browser launch, UI interactions,
screenshots, and API testing.

---

## Quick Start (one command)

```bash
npm run validate
```

This runs all three stages in sequence and opens the HTML report when complete.

---

## Step-by-step (if the one-liner fails)

### Step 1 — Configure (edit once)

Open `config.js` and set:

```js
TESTMART_GITHUB_ZIP: 'https://github.com/YOUR_ORG/testmart/archive/refs/heads/main.zip',

// If running on a machine that already has TestMart locally:
TESTMART_LOCAL_PATH: '/path/to/your/testmart',

// If your organisation uses GCP Artifactory as the npm registry:
ARTIFACTORY_URL: 'https://your-artifactory-host/artifactory/api/npm/npm-repo/',
```

### Step 2 — Pre-flight check (no npm install needed)

```bash
node check-env.js
```

Checks Node.js version, npm, Git, VS Code, network connectivity, PrintDeps.exe,
and your npm registry. **Fix any FAIL items before continuing.**

### Step 3 — Install Playwright

```bash
npm install
npx playwright install chromium
```

If `npx playwright install chromium` fails with a permission error or the
browser cannot be launched after install, PrintDeps.exe or an endpoint security
agent is blocking the executable. See the **Troubleshooting** section below.

### Step 4 — Start TestMart

```bash
node setup-testmart.js
```

Downloads TestMart (or uses local copy), installs its dependencies, seeds the
database, and starts the server on port 3000.

### Step 5 — Run validation tests

```bash
npm test
```

Runs 17 validation tests across four groups:
1. Browser launch and screenshot capability
2. TestMart UI (login, search, cart, async spinner)
3. TestMart API (GET, POST, auth, admin operations)
4. Corporate restrictions (PrintDeps, network egress, headed mode)

### Step 6 — View the report

```bash
npm run report
```

Opens the HTML report in your browser. All screenshots are saved to
`validation-results/screenshots/`.

---

## What gets validated

| # | Check | Why it matters |
|---|-------|---------------|
| 1 | Node.js ≥ 20 | Required by Playwright and TypeScript |
| 2 | npm ≥ 9 | Package installation |
| 3 | Git | Cloning course materials |
| 4 | VS Code CLI (`code`) | Extension installation |
| 5 | Write permissions | npm install writes to disk |
| 6 | npm registry (public or Artifactory) | Package downloads |
| 7 | GitHub connectivity | Downloading TestMart |
| 8 | GCP Artifactory (if configured) | Corporate package proxy |
| 9 | PrintDeps.exe running? | Will it block browser launch? |
| 10 | Chromium binary present | `npx playwright install` succeeded |
| 11 | Chromium can execute | PrintDeps / EACCES detection |
| 12 | TestMart home page loads | Full stack working |
| 13 | Login flow with correct credentials | Session handling |
| 14 | Login error with wrong credentials | Error state rendering |
| 15 | Product search with async spinner | Dynamic element handling |
| 16 | Add to cart, toast appears/dismisses | Async UI interactions |
| 17 | GET /api/products → 200 | API client works |
| 18 | POST /api/auth/login → token | Auth API works |
| 19 | Auth failure → 401 | Error response handling |
| 20 | API + UI cross-validation | Integration check |
| 21 | Admin API: create + delete product | Admin auth flow |
| 22 | Public HTTPS egress | Outbound network not blocked |

---

## Output files

After a successful run, `validation-results/` contains:

```
validation-results/
├── preflight.json          ← machine-readable pre-flight results
├── testmart.pid            ← TestMart server PID (for teardown)
├── testmart.log            ← TestMart server output
├── testmart-meta.json      ← TestMart config (path, port, pid)
├── test-results.json       ← Playwright JSON results
├── summary.txt             ← plain-text summary (shareable)
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

Share `validation-results/summary.txt` and the `screenshots/` folder with
your instructor or IT team.

---

## Troubleshooting

### `npx playwright install` fails / browser won't launch

**Symptom:** `Executable doesn't exist` or `EACCES` / `EPERM` error.

**Cause:** PrintDeps.exe or another endpoint security agent is blocking the
downloaded browser executable.

**Fix:** Request your IT team to whitelist the following path before the session:

- **Windows:** `C:\Users\<username>\.cache\ms-playwright\`
- **macOS/Linux:** `~/.cache/ms-playwright/`

Alternatively, ask IT to pre-install the browsers via an approved software
deployment mechanism.

---

### npm install fails — packages not found in Artifactory

**Symptom:** `404 Not Found` during `npm install`.

**Cause:** GCP Artifactory does not proxy `@playwright/test` or `typescript`.

**Fix:** Ask the Artifactory administrator to add the following packages to the
approved npm proxy repository:
- `@playwright/test` (latest stable)
- `typescript`
- `@types/node`

---

### `node setup-testmart.js` hangs on download

**Symptom:** Download progress stalls.

**Cause:** GitHub is accessible but slow through a corporate proxy.

**Fix:** Either use `TESTMART_LOCAL_PATH` in `config.js` to point at a local
copy of TestMart, or request that the TestMart ZIP be pre-distributed via an
internal file share.

---

### TestMart starts but tests fail to connect

**Symptom:** `ERR_CONNECTION_REFUSED` on `http://localhost:3000`.

**Cause:** Port 3000 is blocked by a local firewall or another service is
already using it.

**Fix:** Change `TESTMART_PORT` in `config.js` to an available port (e.g. 4000)
and re-run `node setup-testmart.js`.

---

## Stopping TestMart after the session

```bash
node -e "
  const fs = require('fs');
  const pid = fs.readFileSync('validation-results/testmart.pid', 'utf8').trim();
  process.kill(parseInt(pid));
  console.log('TestMart stopped (PID ' + pid + ')');
"
```
