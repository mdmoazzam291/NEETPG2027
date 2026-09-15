const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: /pages_smoke\.spec\.js/,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 834, height: 1194 } },
  reporter: [['line']],
});
