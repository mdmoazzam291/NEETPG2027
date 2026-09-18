const { defineConfig } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests',
  testMatch:['github_only_v2.spec.js','neetpg_timer.spec.js','supabase_auth.spec.js','ui_v4.spec.js','exam_v9.spec.js','phase10_taxonomy.spec.js','phase11_analytics.spec.js','phase12_planning.spec.js','phase13_hardening.spec.js','pyq_intelligence.spec.js'],
  use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium'},
  reporter:'line',
  timeout:30000
});
