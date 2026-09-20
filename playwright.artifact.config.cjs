const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests',testMatch:'production_artifact.spec.js',use:{baseURL:'http://127.0.0.1:4180',browserName:'chromium'},webServer:{command:'python -m http.server 4180 --bind 127.0.0.1 --directory _site',port:4180},timeout:45000,reporter:'line'});
