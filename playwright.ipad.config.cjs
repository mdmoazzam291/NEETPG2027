const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: ['phase13_ipad_webkit.spec.js','neuralvault_v1.spec.js'],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'webkit',
    viewport: { width: 834, height: 1194 },
    hasTouch: true
  },
  reporter: 'line',
  timeout: 30000
});
