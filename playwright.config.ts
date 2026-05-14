import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'validation-results');

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,        // generous timeout for corporate networks
  retries: 1,             // one retry catches transient network issues
  workers: 1,             // sequential — avoids resource contention on restricted machines
  fullyParallel: false,

  use: {
    baseURL:           process.env.TESTMART_URL || 'http://localhost:3000',
    screenshot:        'on',    // capture screenshots for every test
    video:             'off',   // disabled — reduces resource usage
    trace:             'on-first-retry',
    actionTimeout:     15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['html', {
      outputFolder: path.join(RESULTS_DIR, 'html'),
      open: 'never',
    }],
    ['list'],
    ['json', {
      outputFile: path.join(RESULTS_DIR, 'test-results.json'),
    }],
  ],

  outputDir: path.join(RESULTS_DIR, 'test-artifacts'),
});
