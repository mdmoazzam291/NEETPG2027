const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['production_live.spec.js'],
  workers: 1,
  retries: 2,
  timeout: 45000,
  use: { browserName: 'chromium' },
  reporter: 'line'
});
