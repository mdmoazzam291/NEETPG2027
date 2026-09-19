(() => {
  'use strict';
  if (window.__NEETPG_PHASE13_HARDENING__) return;
  window.__NEETPG_PHASE13_HARDENING__ = true;

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function announce(message){
    const toast = $('#toast');
    if (toast && typeof window.toast !== 'function') {
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
      return;
    }
    if (typeof window.toast === 'function') window.toast(message);
  }

  function refreshCopy(){
    const footer = $('.sidebar-footer');
    const footerText = 'Local-first. Study data stays on this device offline; sign in to sync supported progress securely across devices.';
    if (footer && footer.textContent !== footerText) footer.textContent = footerText;
    const calloutText = 'Local backup remains the recovery path. When signed in, supported progress, SRS, notes, bookmarks and sessions also sync through Supabase.';
    $$('.settings-grid .callout').forEach(el => {
      if (/does not sync progress between devices/i.test(el.textContent || '') && el.textContent !== calloutText) el.textContent = calloutText;
    });
  }

  function applyAccessibility(){
    const main = $('.main');
    if (main && !main.id) main.id = 'mainContent';
    if (!$('#skipToContent') && main) {
      const link = document.createElement('a');
      link.id = 'skipToContent';
      link.className = 'p13-skip-link';
      link.href = '#mainContent';
      link.textContent = 'Skip to main content';
      document.body.prepend(link);
    }

    $('#sidebar')?.setAttribute('aria-label', 'Primary navigation');
    $('#shortcutsBtn')?.setAttribute('aria-label', 'Keyboard shortcuts');
    $('#closeShortcuts')?.setAttribute('aria-label', 'Close keyboard shortcuts');
    $('#menuBtn')?.setAttribute('aria-controls', 'sidebar');
    $('#toast')?.setAttribute('role', 'status');
    $('#toast')?.setAttribute('aria-live', 'polite');
    $('#v4SearchInput')?.setAttribute('aria-label', 'Search questions, topics and notes');

    $$('.nav button[data-view], .v4-nav-item[data-view], .v4-nav[data-v4-target]').forEach(btn => {
      if (btn.classList.contains('active')) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
      if (!btn.getAttribute('aria-label') && btn.dataset.v4Label) btn.setAttribute('aria-label', btn.dataset.v4Label);
    });

    $$('.modal-backdrop').forEach(backdrop => {
      const modal = backdrop.querySelector('.modal');
      if (modal) {
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
      }
    });
    $('#authClose')?.setAttribute('aria-label', 'Close account dialog');

    $$('.switch').forEach(sw => {
      sw.setAttribute('role', 'switch');
      sw.setAttribute('tabindex', '0');
      sw.setAttribute('aria-checked', sw.dataset.on === '1' ? 'true' : 'false');
      if (!sw.dataset.p13KeyBound) {
        sw.dataset.p13KeyBound = '1';
        sw.addEventListener('keydown', e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            sw.click();
            queueMicrotask(() => sw.setAttribute('aria-checked', sw.dataset.on === '1' ? 'true' : 'false'));
          }
        });
      }
    });

    const progress = $('#qProgressFill')?.parentElement;
    if (progress) {
      progress.setAttribute('role', 'progressbar');
      const label = $('#qProgress')?.textContent || '';
      const m = label.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) {
        progress.setAttribute('aria-valuemin', '1');
        progress.setAttribute('aria-valuemax', m[2]);
        progress.setAttribute('aria-valuenow', m[1]);
        progress.setAttribute('aria-label', `Question ${m[1]} of ${m[2]}`);
      }
    }

    const menu = $('#menuBtn'), sidebar = $('#sidebar');
    if (menu && sidebar) menu.setAttribute('aria-expanded', sidebar.classList.contains('open') ? 'true' : 'false');
  }

  function bindAccessibilityObservers(){
    applyAccessibility();
    ['neetpg:core-ready','neetpg:route-change','neetpg:data-change','neetpg:dashboard-render'].forEach(name=>window.addEventListener(name,applyAccessibility));
    const progress=$('#qProgress');
    if(progress){
      const observer=new MutationObserver(applyAccessibility);
      observer.observe(progress,{subtree:true,childList:true,characterData:true});
    }
    $('#menuBtn')?.addEventListener('click',()=>queueMicrotask(applyAccessibility));
    $('#mobileOverlay')?.addEventListener('click',()=>queueMicrotask(applyAccessibility));
  }

  function ensureUpdateBanner(){
    if ($('#appUpdateBanner')) return $('#appUpdateBanner');
    const banner = document.createElement('div');
    banner.id = 'appUpdateBanner';
    banner.className = 'p13-update-banner hidden';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<div><strong>App update ready</strong><span>Reload to use the latest tested version.</span></div><button class="btn primary" id="applyAppUpdate">Update now</button><button class="btn icon" id="dismissAppUpdate" aria-label="Dismiss update notice">×</button>';
    document.body.appendChild(banner);
    $('#dismissAppUpdate').onclick = () => banner.classList.add('hidden');
    return banner;
  }

  async function setupServiceWorkerUpdates(){
    if (!('serviceWorker' in navigator)) return;
    const banner = ensureUpdateBanner();
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      let reloadRequested = false;
      const showWaiting = worker => {
        if (!worker) return;
        banner.classList.remove('hidden');
        $('#applyAppUpdate').onclick = () => {
          reloadRequested = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        };
      };
      if (reg.waiting) showWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showWaiting(worker);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadRequested || reloading) return;
        reloading = true;
        location.reload();
      });
      reg.update().catch(() => {});
    } catch (e) {
      console.warn('Phase 13 service-worker update check failed', e);
    }
  }

  function wrapPracticeCompletion(){
    const original = window.finishSession;
    if (typeof original !== 'function' || original.__phase13Wrapped) return;
    const wrapped = async function(...args){
      const result = await original.apply(this, args);
      try { await window.NEETPG_CLOUD?.clearActiveSession?.(); }
      catch (e) { console.warn('Could not clear completed cloud session', e); }
      return result;
    };
    wrapped.__phase13Wrapped = true;
    window.finishSession = wrapped;
  }

  function injectSessionControls(){
    const actions = $('#cloudAccountCard .cloud-actions');
    if (!actions || $('#cloudSignOutAll')) return;
    const btn = document.createElement('button');
    btn.className = 'btn hidden';
    btn.id = 'cloudSignOutAll';
    btn.textContent = 'Sign out all devices';
    actions.appendChild(btn);

    const note = document.createElement('p');
    note.className = 'muted tiny p13-account-note';
    note.textContent = 'For safety, browser code does not expose privileged account deletion. You can export your merged local study data before signing out.';
    actions.parentElement.appendChild(note);

    btn.addEventListener('click', async () => {
      const cloud = window.NEETPG_CLOUD;
      if (!cloud?.client || !cloud.user) return;
      if (!confirm('Sign out this account on all devices? Unsynced local study data stays on each device.')) return;
      btn.disabled = true;
      try {
        const { error } = await cloud.client.auth.signOut({ scope: 'global' });
        if (error) throw error;
        announce('Signed out on all devices');
      } catch (e) {
        console.error(e);
        announce('Global sign-out failed');
      } finally { btn.disabled = false; }
    });
  }

  function refreshSessionControls(){
    injectSessionControls();
    const btn = $('#cloudSignOutAll');
    if (btn) btn.classList.toggle('hidden', !window.NEETPG_CLOUD?.user);
  }

  function bindRecoverySignals(){
    window.addEventListener('online', () => announce('Back online. Cloud sync can resume.'));
    window.addEventListener('offline', () => announce('Offline mode active. Study data stays on this device.'));
    document.addEventListener('click', e => {
      if (e.target.closest('#accountBtn,#cloudSignIn,#cloudSignOut,#cloudSyncNow')) setTimeout(refreshSessionControls, 100);
    }, true);
  }

  function init(){
    refreshCopy();
    bindAccessibilityObservers();
    wrapPracticeCompletion();
    setupServiceWorkerUpdates();
    bindRecoverySignals();
    refreshSessionControls();
    const cloudObserver = new MutationObserver(refreshSessionControls);
    cloudObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setInterval(refreshSessionControls, 3000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
