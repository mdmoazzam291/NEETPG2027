(() => {
  function applyProviderFlags(){
    const cfg=window.NEETPG_SUPABASE||{};
    const google=document.getElementById('authGoogle');
    if(google && !cfg.googleEnabled){
      const divider=google.previousElementSibling;
      google.style.display='none';
      if(divider?.classList?.contains('auth-divider'))divider.style.display='none';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(applyProviderFlags,50));
  else setTimeout(applyProviderFlags,50);
  const observer=new MutationObserver(()=>applyProviderFlags());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),5000);
})();
