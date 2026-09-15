(() => {
  'use strict';
  // The legacy study engine binds these dashboard buttons during async startup.
  // UI v4 replaces the dashboard markup, so keep invisible compatibility targets
  // outside that view until startup has finished. This prevents bindEvents() from
  // aborting if the premium shell initializes first on a fast browser.
  const host=document.createElement('div');
  host.id='v4CoreCompat';
  host.hidden=true;
  host.innerHTML='<button id="refreshDashboard" type="button"></button><button id="startSmart" type="button"></button>';
  if(!document.getElementById('v4CoreCompat')) document.body.appendChild(host);
})();
