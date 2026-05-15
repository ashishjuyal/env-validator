/**
 * config.js — Edit this file before running the validator.
 *
 * TESTMART_GITHUB_ZIP: public zip URL of the TestMart repository.
 *   Replace with your actual repository URL once it is published.
 *   Format: https://github.com/<org>/<repo>/archive/refs/heads/main.zip
 *
 * ARTIFACTORY_URL: your GCP Artifactory npm registry URL (if applicable).
 *   Leave as null to skip Artifactory connectivity check.
 *   Format: https://<host>/artifactory/api/npm/<repo-name>/
 *
 * TESTMART_PORT: port TestMart will listen on (default 3000).
 */

module.exports = {
  TESTMART_GITHUB_ZIP: process.env.TESTMART_GITHUB_ZIP
    || 'https://github.com/ashishjuyal/testmart/archive/refs/heads/main.zip',

  ARTIFACTORY_URL: process.env.ARTIFACTORY_URL
    || null,

  TESTMART_PORT: parseInt(process.env.TESTMART_PORT || '3000', 10),
};
