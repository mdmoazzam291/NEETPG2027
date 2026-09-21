(() => {
  'use strict';
  if (window.__NEETPG_AUTH_LAUNCH__) return;
  window.__NEETPG_AUTH_LAUNCH__ = true;

  const GUEST_KEY='neetpg2027-guest-session';
  const root=document.documentElement;
  let state='checking';

  root.classList.add('auth-launch-pending');
  root.dataset.authLaunch='checking';

  function splash(){
    let node=document.getElementById('authLaunchSplash');
    if(node || !document.body) return node;
    node=document.createElement('div');
    node.id='authLaunchSplash';
    node.setAttribute('role','status');
    node.setAttribute('aria-live','polite');
    node.innerHTML=
      '<div class="auth-launch-card">'+
        '<div class="auth-launch-mark">✚</div>'+
        '<strong>NEETPG 2027</strong>'+
        '<p>Preparing your study workspace…</p>'+
        '<div class="auth-launch-loader" aria-hidden="true"></div>'+
      '</div>';
    document.body.prepend(node);
    return node;
  }

  function hideSplash(){
    const node=document.getElementById('authLaunchSplash');
    if(node) node.hidden=true;
  }

  function reveal(mode){
    state=mode;
    root.dataset.authLaunch=mode;
    root.classList.remove('auth-launch-pending','auth-launch-locked');
    hideSplash();
    window.dispatchEvent(new CustomEvent('neetpg:auth-launch',{detail:{state:mode}}));
  }

  function lock(){
    state='signed-out';
    root.dataset.authLaunch='signed-out';
    root.classList.remove('auth-launch-pending');
    root.classList.add('auth-launch-locked');
    hideSplash();
    window.dispatchEvent(new CustomEvent('neetpg:auth-launch',{detail:{state:'signed-out'}}));
  }

  const api={
    get state(){return state;},
    hasGuestSession(){
      try{return sessionStorage.getItem(GUEST_KEY)==='1';}catch{return false;}
    },
    resolveAuthenticated(){
      try{sessionStorage.removeItem(GUEST_KEY);}catch{}
      reveal('authenticated');
    },
    resolveNoSession(){
      if(this.hasGuestSession()) reveal('guest');
      else lock();
      return state;
    },
    continueOffline(){
      try{sessionStorage.setItem(GUEST_KEY,'1');}catch{}
      reveal('guest');
    },
    requireLogin(){
      try{sessionStorage.removeItem(GUEST_KEY);}catch{}
      lock();
    }
  };
  window.NEETPG_AUTH_LAUNCH=api;

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',splash,{once:true});
  else splash();
})();
