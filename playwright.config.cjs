const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser', workers: 1, retries: 0, timeout: 30000,
  use: {baseURL: 'http://127.0.0.1:8766', viewport: {width: 834, height: 1194}, screenshot: 'only-on-failure', trace: 'retain-on-failure'},
  webServer: {command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 8766', url: 'http://127.0.0.1:8766/health', reuseExistingServer: false},
  reporter: [['list'], ['html', {open: 'never'}]],
});
