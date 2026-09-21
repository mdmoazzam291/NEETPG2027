(() => {
  'use strict';
  if (window.__NEETPG_AUTH_V2__) return;
  window.__NEETPG_AUTH_V2__ = true;

  const getCfg = () => window.NEETPG_SUPABASE || {};
  const getCloud = () => window.NEETPG_CLOUD || null;
  let enhanced = false;
  let recoveryBound = false;
  let providerProbeStarted = false;
  const runtimeProviders = { google: null, apple: null };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function message(error, success) {
    const e = document.getElementById('authError');
    const s = document.getElementById('authSuccess');
    if (e) e.textContent = error || '';
    if (s) s.textContent = success || '';
  }

  function recoveryUrl() {
    const cfg = getCfg();
    const url = new URL(cfg.redirectUrl || location.href, location.href);
    url.searchParams.set('auth', 'recovery');
    return url.toString();
  }

  function clientOrError() {
    const client = getCloud()?.client;
    if (!client) message('Authentication is still starting. Try again in a moment.');
    return client;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function providerAvatarUrl(user) {
    const identityData = Array.isArray(user?.identities)
      ? user.identities.map(x => x?.identity_data || {}).find(x => x.avatar_url || x.picture) || {}
      : {};
    const raw = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || identityData.avatar_url || identityData.picture || '';
    if (!raw) return '';
    try {
      const url = new URL(String(raw), location.href);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function paintProviderAvatar(node, user, fallback) {
    if (!node) return;
    const text = fallback || 'U';
    node.replaceChildren();
    node.textContent = text;
    node.classList.remove('has-photo');
    const src = providerAvatarUrl(user);
    if (!src) return;
    const img = document.createElement('img');
    img.alt = '';
    img.src = src;
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => node.classList.add('has-photo'), { once: true });
    img.addEventListener('error', () => {
      node.classList.remove('has-photo');
      node.replaceChildren();
      node.textContent = text;
    }, { once: true });
    node.replaceChildren(img);
  }

  function providerEnabled(name) {
    if (runtimeProviders[name] !== null) return Boolean(runtimeProviders[name]);
    return Boolean(getCfg()[name + 'Enabled']);
  }

  function providerFlags() {
    const cfg = getCfg();
    const googleEnabled = providerEnabled('google');
    const appleEnabled = providerEnabled('apple');
    const google = document.getElementById('authGoogle');
    const apple = document.getElementById('authApple');
    const emailCode = document.getElementById('authEmailCode');
    if (google) { google.hidden = !googleEnabled; google.style.display = googleEnabled ? '' : 'none'; }
    if (apple) { apple.hidden = !appleEnabled; apple.style.display = appleEnabled ? '' : 'none'; }
    if (emailCode) emailCode.hidden = cfg.emailCodeEnabled === false;
    const social = document.getElementById('authSocials');
    const socialDivider = document.getElementById('authSocialDivider');
    const any = googleEnabled || appleEnabled;
    if (social) social.hidden = !any;
    if (socialDivider) socialDivider.hidden = !any;
  }

  async function detectOAuthProviders() {
    const cfg = getCfg();
    if (providerProbeStarted || cfg.autoDetectOAuthProviders === false || !cfg.url || !cfg.anonKey) return;
    providerProbeStarted = true;
    try {
      const base = String(cfg.url).replace(/\/$/, '');
      const response = await fetch(base + '/auth/v1/settings', {
        headers: { apikey: cfg.anonKey },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Auth settings unavailable');
      const settings = await response.json();
      runtimeProviders.google = Boolean(settings?.external?.google);
      runtimeProviders.apple = Boolean(settings?.external?.apple);
    } catch (error) {
      runtimeProviders.google = Boolean(cfg.googleEnabled);
      runtimeProviders.apple = Boolean(cfg.appleEnabled);
      console.warn('OAuth provider detection fell back to local flags', error);
    }
    providerFlags();
    const modal = document.getElementById('authModal');
    if (modal?.classList.contains('show')) renderMode(modal.dataset.mode || 'signin');
  }

  function renderMode(mode) {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    mode = mode || modal.dataset.mode || 'signin';
    modal.dataset.mode = mode;

    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const name = document.getElementById('authNameField');
    const emailField = document.getElementById('authEmailField');
    const passwordField = document.getElementById('authPasswordField');
    const confirmField = document.getElementById('authConfirmField');
    const otpField = document.getElementById('authOtpField');
    const forgot = document.getElementById('authForgot');
    const submit = document.getElementById('authSubmit');
    const emailCode = document.getElementById('authEmailCode');
    const switchText = document.getElementById('authSwitchText');
    const switchBtn = document.getElementById('authSwitchBtn');
    const socials = document.getElementById('authSocials');
    const divider = document.getElementById('authSocialDivider');
    const password = document.getElementById('authPassword');
    const accountPanel = document.getElementById('authAccountPanel');
    const privacy = document.getElementById('authPrivacy');
    const offline = document.getElementById('authContinueOffline');

    const accountMode = mode === 'account' && Boolean(getCloud()?.user);
    const signup = mode === 'signup';
    const signin = mode === 'signin';
    const forgotMode = mode === 'forgot';
    const emailMode = mode === 'email';
    const otpMode = mode === 'otpverify';
    const resetMode = mode === 'reset';

    if (name) name.style.display = signup && !accountMode ? 'block' : 'none';
    if (emailField) emailField.style.display = !accountMode && !resetMode ? 'block' : 'none';
    if (passwordField) passwordField.style.display = !accountMode && (signin || signup || resetMode) ? 'block' : 'none';
    if (confirmField) confirmField.style.display = !accountMode && (signup || resetMode) ? 'block' : 'none';
    if (otpField) otpField.style.display = !accountMode && otpMode ? 'block' : 'none';
    if (forgot) forgot.style.display = !accountMode && signin ? 'inline-flex' : 'none';
    if (emailCode) emailCode.style.display = !accountMode && signin && getCfg().emailCodeEnabled !== false ? 'flex' : 'none';
    if (submit) submit.style.display = accountMode ? 'none' : '';
    if (switchText?.parentElement) switchText.parentElement.style.display = accountMode ? 'none' : '';
    if (offline) offline.style.display = accountMode ? 'none' : '';
    if (privacy) privacy.style.display = accountMode ? 'none' : '';
    if (accountPanel) accountPanel.style.display = accountMode ? 'grid' : 'none';
    if (password) password.autocomplete = signup || resetMode ? 'new-password' : 'current-password';

    const showSocial = (signin || signup) && !accountMode;
    const hasSocial = providerEnabled('google') || providerEnabled('apple');
    if (socials) socials.style.display = showSocial && hasSocial ? 'grid' : 'none';
    if (divider) divider.style.display = showSocial && hasSocial ? 'flex' : 'none';

    const copy = {
      account: ['Your account', 'Signed in and syncing your NEET-PG progress across devices.', ''],
      signin: ['Welcome back', 'Sign in to sync your NEET-PG progress across devices.', 'Sign in'],
      signup: ['Create your account', 'Keep practice history, revision data and notes connected.', 'Create account'],
      forgot: ['Reset your password', 'Enter your account email and we will send a secure recovery link.', 'Send reset link'],
      email: ['Email sign-in', 'Get a secure sign-in link or one-time code in your inbox.', 'Send email'],
      otpverify: ['Check your email', 'Use the secure link, or enter the 6-digit code if your email provides one.', 'Verify code'],
      reset: ['Create a new password', 'Choose a new password for your NEETPG2027 account.', 'Update password']
    }[mode] || null;

    if (copy) {
      if (title) title.textContent = copy[0];
      if (subtitle) subtitle.textContent = copy[1];
      if (submit && !accountMode) submit.textContent = copy[2];
    }

    if (accountMode) {
      const cloud = getCloud();
      const user = cloud?.user;
      const displayName = cloud?.profile?.display_name || user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'NEETPG2027 user';
      const email = user?.email || 'Signed-in account';
      const avatar = document.getElementById('authAccountAvatar');
      const nameEl = document.getElementById('authAccountName');
      const emailEl = document.getElementById('authAccountEmail');
      const statusEl = document.getElementById('authAccountStatus');
      const fallbackInitials = displayName.split(/\s+|@/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'U';
      paintProviderAvatar(avatar, user, fallbackInitials);
      if (nameEl) nameEl.textContent = displayName;
      if (emailEl) emailEl.textContent = email;
      if (statusEl) statusEl.textContent = cloud?.syncing ? 'Syncing now' : cloud?.dirty ? 'Changes pending sync' : cloud?.lastSyncAt ? 'Cloud sync up to date' : 'Cloud account connected';
    }

    if (switchText && switchBtn) {
      if (signin) {
        switchText.textContent = 'New here?';
        switchBtn.textContent = 'Create account';
        switchBtn.dataset.targetMode = 'signup';
      } else if (signup) {
        switchText.textContent = 'Already have an account?';
        switchBtn.textContent = 'Sign in';
        switchBtn.dataset.targetMode = 'signin';
      } else {
        switchText.textContent = '';
        switchBtn.textContent = 'Back to sign in';
        switchBtn.dataset.targetMode = 'signin';
      }
    }

    providerFlags();
  }

  function useBaseTab(mode) {
    const modal = document.getElementById('authModal');
    const tab = modal?.querySelector('[data-auth-tab="' + mode + '"]');
    if (tab) tab.click();
    else {
      if (modal) modal.dataset.mode = mode;
      renderMode(mode);
    }
    setTimeout(() => renderMode(mode), 0);
  }

  async function handleForgot() {
    const client = clientOrError();
    const email = document.getElementById('authEmail')?.value.trim() || '';
    if (!client || !validEmail(email)) {
      if (client) message('Enter a valid email address.');
      return;
    }
    const submit = document.getElementById('authSubmit');
    if (submit) submit.disabled = true;
    message();
    try {
      const result = await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryUrl() });
      if (result.error) throw result.error;
      message('', 'If an account can receive recovery mail, a reset link has been sent. Check your inbox and spam folder.');
    } catch (error) {
      message(error.message || 'Could not send the recovery email.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleEmailSignIn() {
    const client = clientOrError();
    const email = document.getElementById('authEmail')?.value.trim() || '';
    if (!client || !validEmail(email)) {
      if (client) message('Enter a valid email address.');
      return;
    }
    const submit = document.getElementById('authSubmit');
    if (submit) submit.disabled = true;
    message();
    try {
      const result = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: getCfg().redirectUrl || location.href
        }
      });
      if (result.error) throw result.error;
      document.getElementById('authModal').dataset.authEmail = email;
      renderMode('otpverify');
      message('', 'Sign-in email sent. Open the secure link, or enter the code below if your email contains one.');
      document.getElementById('authOtp')?.focus();
    } catch (error) {
      message(error.message || 'Could not send the sign-in email.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleOtpVerify() {
    const client = clientOrError();
    const modal = document.getElementById('authModal');
    const email = modal?.dataset.authEmail || document.getElementById('authEmail')?.value.trim() || '';
    const token = (document.getElementById('authOtp')?.value || '').replace(/\s+/g, '');
    if (!client || !validEmail(email) || !/^\d{6}$/.test(token)) {
      if (client) message('Enter the 6-digit code from your email.');
      return;
    }
    const submit = document.getElementById('authSubmit');
    if (submit) submit.disabled = true;
    message();
    try {
      const result = await client.auth.verifyOtp({ email, token, type: 'email' });
      if (result.error) throw result.error;
      modal?.classList.remove('show');
    } catch (error) {
      message(error.message || 'That code could not be verified.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleReset() {
    const client = clientOrError();
    const password = document.getElementById('authPassword')?.value || '';
    const confirm = document.getElementById('authConfirmPassword')?.value || '';
    if (!client) return;
    if (password.length < 8) {
      message('Use at least 8 characters for the new password.');
      return;
    }
    if (password !== confirm) {
      message('Passwords do not match.');
      return;
    }
    const submit = document.getElementById('authSubmit');
    if (submit) submit.disabled = true;
    message();
    try {
      const result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      message('', 'Password updated. You are signed in.');
      const url = new URL(location.href);
      url.searchParams.delete('auth');
      history.replaceState({}, '', url.pathname + url.search + url.hash);
      setTimeout(() => document.getElementById('authModal')?.classList.remove('show'), 600);
    } catch (error) {
      message(error.message || 'Could not update your password.');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function appleSignIn() {
    if (!providerEnabled('apple')) {
      message('Apple sign-in is not enabled in Supabase yet.');
      return;
    }
    const client = clientOrError();
    if (!client) return;
    try {
      const result = await client.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo: getCfg().redirectUrl || location.href }
      });
      if (result.error) throw result.error;
    } catch (error) {
      message(error.message || 'Apple sign-in failed.');
    }
  }

  function enhance() {
    const modal = document.getElementById('authModal');
    const panel = modal?.querySelector('.modal');
    if (!modal || !panel || enhanced) return false;
    enhanced = true;
    modal.classList.add('auth-v2');
    panel.classList.add('auth-v2-card');

    const shell = make('div', 'auth-v2-shell');
    const promo = make('aside', 'auth-v2-promo');
    promo.innerHTML =
      '<div class="auth-v2-brand"><div class="auth-v2-logo">✚</div><div><strong>NEETPG 2027</strong><span>Study smarter. Practice deeper.</span></div></div>' +
      '<h2>Your preparation, synced.</h2>' +
      '<p>One account keeps your practice history, spaced repetition, bookmarks, notes and study sessions connected.</p>' +
      '<div class="auth-v2-features">' +
        '<div class="auth-v2-feature"><span class="auth-v2-feature-icon">◎</span><div><b>Practice</b><small>High-yield MCQs and adaptive sessions</small></div></div>' +
        '<div class="auth-v2-feature"><span class="auth-v2-feature-icon">↻</span><div><b>Revise</b><small>Spaced repetition and error recovery</small></div></div>' +
        '<div class="auth-v2-feature"><span class="auth-v2-feature-icon">⌁</span><div><b>Track</b><small>Performance and weakness analytics</small></div></div>' +
        '<div class="auth-v2-feature"><span class="auth-v2-feature-icon">◇</span><div><b>Build</b><small>Your connected medical knowledge vault</small></div></div>' +
      '</div>';

    modal.insertBefore(shell, panel);
    shell.appendChild(promo);
    shell.appendChild(panel);

    const heading = panel.querySelector('.modal-head h3');
    const subtitle = panel.querySelector('.modal-head p');
    if (heading) { heading.id = 'authTitle'; heading.textContent = 'Welcome back'; }
    if (subtitle) { subtitle.id = 'authSubtitle'; subtitle.textContent = 'Sign in to sync your NEET-PG progress across devices.'; }

    const stack = panel.querySelector('.auth-stack');
    const google = document.getElementById('authGoogle');
    const divider = panel.querySelector('.auth-divider');
    const nameField = document.getElementById('authNameField');
    const email = document.getElementById('authEmail');
    const password = document.getElementById('authPassword');
    const submit = document.getElementById('authSubmit');
    const error = document.getElementById('authError');
    const success = document.getElementById('authSuccess');
    const privacy = stack?.querySelector('.tiny');
    if (!stack || !email || !password || !submit) return true;

    const emailField = email.closest('.field');
    const passwordField = password.closest('.field');
    if (emailField) emailField.id = 'authEmailField';
    if (passwordField) passwordField.id = 'authPasswordField';

    const socials = make('div', 'auth-v2-socials');
    socials.id = 'authSocials';
    if (google) {
      google.classList.add('auth-v2-social');
      google.innerHTML = '<span class="auth-v2-provider-mark">G</span><span>Continue with Google</span>';
      socials.appendChild(google);
    }
    const apple = make('button', 'auth-v2-social');
    apple.id = 'authApple';
    apple.type = 'button';
    apple.innerHTML = '<span class="auth-v2-provider-mark">●</span><span>Continue with Apple</span>';
    socials.appendChild(apple);

    if (nameField) stack.insertBefore(socials, nameField);
    else stack.insertBefore(socials, stack.firstChild);

    if (divider) {
      divider.id = 'authSocialDivider';
      divider.textContent = 'or continue with email';
      socials.after(divider);
    }

    if (passwordField) {
      const label = passwordField.querySelector('label');
      const row = make('div', 'auth-v2-label-row');
      const forgot = make('button', 'auth-v2-link', 'Forgot password?');
      forgot.id = 'authForgot';
      forgot.type = 'button';
      if (label) {
        label.remove();
        row.appendChild(label);
      }
      row.appendChild(forgot);
      passwordField.insertBefore(row, passwordField.firstChild);

      const wrap = make('div', 'auth-v2-password-wrap');
      password.parentNode.insertBefore(wrap, password);
      wrap.appendChild(password);
      const eye = make('button', 'auth-v2-eye', '◉');
      eye.id = 'authPasswordToggle';
      eye.type = 'button';
      eye.setAttribute('aria-label', 'Show password');
      wrap.appendChild(eye);

      const caps = make('div', 'auth-v2-caps', 'Caps Lock is on');
      caps.id = 'authCaps';
      passwordField.appendChild(caps);
    }

    const confirmField = make('div', 'field');
    confirmField.id = 'authConfirmField';
    confirmField.style.display = 'none';
    confirmField.innerHTML = '<label>Confirm password</label><div class="auth-v2-password-wrap"><input id="authConfirmPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat your password"><button class="auth-v2-eye" id="authConfirmToggle" type="button" aria-label="Show password">◉</button></div>';
    submit.parentNode.insertBefore(confirmField, submit);

    const otpField = make('div', 'field');
    otpField.id = 'authOtpField';
    otpField.style.display = 'none';
    otpField.innerHTML = '<label>6-digit email code</label><input id="authOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">';
    submit.parentNode.insertBefore(otpField, submit);

    const emailCode = make('button', 'btn auth-v2-email-code', '✉  Sign in with email link / code');
    emailCode.id = 'authEmailCode';
    emailCode.type = 'button';
    submit.after(emailCode);

    const switchRow = make('div', 'auth-v2-switch');
    switchRow.innerHTML = '<span id="authSwitchText">New here?</span> <button type="button" class="auth-v2-link" id="authSwitchBtn">Create account</button>';
    emailCode.after(switchRow);

    const offline = make('button', 'auth-v2-offline', 'Continue offline · study now, sync later');
    offline.id = 'authContinueOffline';
    offline.type = 'button';
    switchRow.after(offline);

    const accountPanel = make('section', 'auth-v2-account');
    accountPanel.id = 'authAccountPanel';
    accountPanel.setAttribute('aria-label', 'Signed-in account');
    accountPanel.style.display = 'none';
    accountPanel.innerHTML =
      '<div class="auth-v2-account-card">' +
        '<div class="auth-v2-account-avatar" id="authAccountAvatar">U</div>' +
        '<div class="auth-v2-account-copy"><strong id="authAccountName">Account</strong><span id="authAccountEmail"></span></div>' +
        '<span class="auth-v2-account-badge" id="authAccountStatus">Cloud account connected</span>' +
      '</div>' +
      '<button type="button" class="auth-v2-account-primary" id="authAccountContinue">Continue studying</button>' +
      '<button type="button" class="auth-v2-account-settings" id="authAccountSettings">Account & sync settings</button>' +
      '<div class="auth-v2-logout-zone">' +
        '<div><strong>Sign out</strong><span>Your local study data stays on this device.</span></div>' +
        '<button type="button" class="auth-v2-signout" id="authPageSignOut">Sign out</button>' +
      '</div>';
    offline.after(accountPanel);

    if (error) accountPanel.after(error);
    if (success) error?.after(success);
    if (privacy) { privacy.id = 'authPrivacy'; success?.after(privacy); }

    apple.addEventListener('click', appleSignIn);
    document.getElementById('authForgot')?.addEventListener('click', () => { message(); renderMode('forgot'); });
    emailCode.addEventListener('click', () => { message(); renderMode('email'); });
    offline.addEventListener('click', () => {
      window.NEETPG_AUTH_LAUNCH?.continueOffline?.();
      document.getElementById('authClose')?.click();
    });
    document.getElementById('authSwitchBtn')?.addEventListener('click', () => {
      message();
      useBaseTab(document.getElementById('authSwitchBtn')?.dataset.targetMode || 'signin');
    });
    document.getElementById('authAccountContinue')?.addEventListener('click', () => document.getElementById('authClose')?.click());
    document.getElementById('authAccountSettings')?.addEventListener('click', () => {
      document.getElementById('authClose')?.click();
      if (typeof navigate === 'function') navigate('settings');
    });
    document.getElementById('authPageSignOut')?.addEventListener('click', async () => {
      const client = clientOrError();
      const button = document.getElementById('authPageSignOut');
      if (!client) return;
      if (button) { button.disabled = true; button.textContent = 'Signing out…'; }
      message();
      try {
        const result = await client.auth.signOut();
        if (result?.error) throw result.error;
        const modal = document.getElementById('authModal');
        if (modal) modal.dataset.mode = 'signin';
        renderMode('signin');
        message('', 'Signed out. Local study data remains available on this device.');
      } catch (error) {
        message(error.message || 'Could not sign out.');
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Sign out'; }
      }
    });

    function toggle(inputId, buttonId) {
      const input = document.getElementById(inputId);
      const button = document.getElementById(buttonId);
      if (!input || !button) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
    }
    document.getElementById('authPasswordToggle')?.addEventListener('click', () => toggle('authPassword', 'authPasswordToggle'));
    document.getElementById('authConfirmToggle')?.addEventListener('click', () => toggle('authConfirmPassword', 'authConfirmToggle'));

    const capsHandler = event => {
      const caps = document.getElementById('authCaps');
      if (caps) caps.classList.toggle('show', Boolean(event.getModifierState && event.getModifierState('CapsLock')));
    };
    password.addEventListener('keyup', capsHandler);
    password.addEventListener('keydown', capsHandler);

    submit.addEventListener('click', async event => {
      const mode = modal.dataset.mode || 'signin';
      if (mode === 'signup') {
        const confirm = document.getElementById('authConfirmPassword')?.value || '';
        if (password.value !== confirm) {
          event.preventDefault();
          event.stopImmediatePropagation();
          message('Passwords do not match.');
        }
        return;
      }
      if (!['forgot','email','otpverify','reset'].includes(mode)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mode === 'forgot') await handleForgot();
      if (mode === 'email') await handleEmailSignIn();
      if (mode === 'otpverify') await handleOtpVerify();
      if (mode === 'reset') await handleReset();
    }, true);

    [document.getElementById('authEmail'), document.getElementById('authOtp'), document.getElementById('authConfirmPassword')].forEach(input => {
      input?.addEventListener('keydown', event => {
        if (event.key === 'Enter') submit.click();
      });
    });

    modal.querySelectorAll('[data-auth-tab]').forEach(tab => tab.addEventListener('click', () => setTimeout(() => renderMode(tab.dataset.authTab), 0)));
    new MutationObserver(() => {
      if (modal.classList.contains('show')) {
        const currentMode = getCloud()?.user ? (modal.dataset.mode === 'reset' ? 'reset' : 'account') : (modal.dataset.mode || 'signin');
        renderMode(currentMode);
        if (currentMode !== 'account') setTimeout(() => document.getElementById('authEmail')?.focus(), 40);
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });

    renderMode(modal.dataset.mode || 'signin');
    return true;
  }

  function bindRecovery() {
    if (recoveryBound) return;
    const client = getCloud()?.client;
    if (!client?.auth?.onAuthStateChange) return;
    recoveryBound = true;
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        const modal = document.getElementById('authModal');
        if (modal?.classList.contains('show')) renderMode('signin');
      }
      if (event === 'SIGNED_IN') {
        const modal = document.getElementById('authModal');
        if (modal?.classList.contains('show') && modal.dataset.mode !== 'reset') renderMode('account');
      }
      if (event === 'PASSWORD_RECOVERY') {
        const modal = document.getElementById('authModal');
        if (modal) {
          modal.classList.add('show');
          renderMode('reset');
        }
      }
    });
    const url = new URL(location.href);
    if (url.searchParams.get('auth') === 'recovery') {
      const modal = document.getElementById('authModal');
      if (modal) {
        modal.classList.add('show');
        renderMode('reset');
      }
    }
  }

  window.addEventListener('neetpg:cloud-status', () => {
    const modal = document.getElementById('authModal');
    if (modal?.classList.contains('show') && getCloud()?.user && modal.dataset.mode !== 'reset') renderMode('account');
  });

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    enhance();
    bindRecovery();
    providerFlags();
    detectOAuthProviders();
    if (enhanced && recoveryBound && providerProbeStarted) clearInterval(timer);
    if (tries > 240) clearInterval(timer);
  }, 25);

  if (document.readyState !== 'loading') {
    enhance();
    bindRecovery();
    detectOAuthProviders();
  }
})();
