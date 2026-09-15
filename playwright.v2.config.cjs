const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests',
  testMatch:['github_only_v2.spec.js','neetpg_timer.spec.js','supabase_auth.spec.js'],
  use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium'},
  reporter:'line',
  timeout:30000
});
