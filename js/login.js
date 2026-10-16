/* Login UI. Prototype access is separate from the future server-controlled flow.
   No OTP, role, or network decision is validated locally. */
(function () {
  'use strict';
  var mode = window.VZ_LOGIN_CONFIG && window.VZ_LOGIN_CONFIG.mode;
  var prototype = mode === 'prototype';
  var adapter = window.VZ_AUTH_ADAPTER;
  var previewType = new URLSearchParams(location.search).get('preview');
  var preview = previewType === 'mfa' || previewType === 'clinic-network';
  if (prototype && !preview && VZ.currentUser()) { location.replace('dashboard.html'); return; }

  function el(id) { return document.getElementById(id); }
  var form = el('login-form'), user = el('username'), pw = el('password');
  var toggle = el('toggle-pw'), code = el('mfa-code');
  var state = 'login', challenge = null, retryToken = null, busy = false, pendingAction = '';
  var revision = 0, timer = null, blockedUntil = 0, networkRetryAt = 0;
  var unavailable = 'Verification is not connected to the backend yet. No code was sent and no access was granted.';

  function showError(id, message) {
    el(id).textContent = message;
    el(id).hidden = false;
  }
  function resetPassword() {
    pw.value = '';
    pw.type = 'password';
    toggle.innerHTML = VZ.icon('eye', 22);
    toggle.setAttribute('aria-pressed', 'false');
    toggle.setAttribute('aria-label', 'Show password');
  }
  function remaining(at) { return Math.max(0, Math.ceil((at - Date.now()) / 1000)); }
  function seconds(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400 ? value : fallback;
  }
  function token(value) { return typeof value === 'string' && value.length > 0 && value.length <= 2048; }
  function setStatus(id, text) { el(id).textContent = text; el(id).hidden = !text; }
  function clearTimer() { if (timer) clearInterval(timer); timer = null; }
  function controls() {
    var wait = remaining(blockedUntil);
    form.querySelectorAll('input, button').forEach(function (input) { input.disabled = busy || wait > 0; });
    el('fill-admin').disabled = el('fill-staff').disabled = busy;
    form.setAttribute('aria-busy', String(busy && state === 'login'));
    el('mfa-form').setAttribute('aria-busy', String(busy && state === 'mfa'));
    el('network-panel').setAttribute('aria-busy', String(busy && state === 'network'));
    if (state === 'mfa' && challenge) {
      var expired = !preview && remaining(challenge.expiresAt) === 0;
      var resendWait = remaining(challenge.resendAt);
      code.disabled = busy || expired || wait > 0;
      el('verify-code').disabled = busy || expired || wait > 0;
      el('verify-code').textContent = busy && pendingAction === 'verify' ? 'Verifying…' : wait ? 'Try again in ' + wait + 's' : 'Verify code';
      el('resend-code').hidden = !challenge.canResend;
      el('resend-code').disabled = busy || resendWait > 0;
      el('resend-code').textContent = busy && pendingAction === 'resend' ? 'Requesting…' : resendWait ? 'Resend in ' + resendWait + 's' : 'Resend code';
      el('mfa-timing').textContent = preview ? 'Code expiry and resend limits will be supplied by the backend.' :
        expired ? 'This code has expired. Request a new code or go back to sign in.' :
          'Verification expires in ' + remaining(challenge.expiresAt) + 's.';
    }
    var networkWait = remaining(networkRetryAt);
    el('network-retry').disabled = busy || networkWait > 0;
    el('network-retry').textContent = busy && state === 'network' ? 'Checking…' : networkWait ? 'Try again in ' + networkWait + 's' : 'Try again';
    var submit = form.querySelector('button[type="submit"]');
    submit.textContent = busy && state === 'login' ? 'Signing in…' : wait && state === 'login' ? 'Try again in ' + wait + 's' : 'Log in';
  }
  function view(next) {
    revision++;
    busy = false;
    state = next;
    resetPassword();
    code.value = '';
    code.removeAttribute('aria-invalid');
    ['login-error', 'mfa-error', 'network-error'].forEach(function (id) { el(id).hidden = true; el(id).textContent = ''; });
    ['login-status', 'mfa-status', 'network-status'].forEach(function (id) { setStatus(id, ''); });
    form.hidden = next !== 'login';
    el('mfa-panel').hidden = next !== 'mfa';
    el('network-panel').hidden = next !== 'network';
    el('demo-accounts').hidden = !prototype || preview || next !== 'login';
    el('security-preview-note').hidden = !preview;
    el('login-heading').textContent = next === 'mfa' ? 'Verify your sign in' : next === 'network' ? 'Clinic network required' : next === 'complete' ? 'Signing in' : 'Sign in';
    controls();
  }
  function back(message) {
    preview = false;
    clearTimer();
    challenge = null;
    retryToken = null;
    blockedUntil = networkRetryAt = 0;
    view('login');
    // URL cleanup must not prevent cancellation if browser history is restricted.
    try {
      var url = new URL(location.href);
      url.searchParams.delete('preview');
      history.replaceState(null, '', url.href);
    } catch (error) { /* The preview hint is harmless; sensitive state is cleared. */ }
    if (message) setStatus('login-status', message);
    user.focus();
  }
  function showMfa(result) {
    if (!token(result.challengeId) || !['email', 'sms', 'authenticator'].includes(result.channel) ||
        seconds(result.expiresInSeconds, 0) <= 0 ||
        (result.resendAfterSeconds !== undefined && seconds(result.resendAfterSeconds, -1) < 0)) throw new Error('Invalid MFA challenge');
    clearTimer();
    retryToken = null;
    blockedUntil = 0;
    challenge = {
      id: result.challengeId,
      expiresAt: Date.now() + result.expiresInSeconds * 1000,
      resendAt: Date.now() + seconds(result.resendAfterSeconds, 0) * 1000,
      canResend: result.channel !== 'authenticator' && result.canResend === true
    };
    view('mfa');
    var destination = typeof result.maskedDestination === 'string' ? result.maskedDestination.slice(0, 150) : '';
    el('mfa-instructions').textContent = preview ? 'This is where the admin will enter a six-digit verification code after the backend requests MFA.' :
      result.channel === 'authenticator' ? 'Enter the six-digit code from your authenticator app.' :
        'Enter the six-digit code sent ' + (destination ? 'to ' + destination : 'through your registered ' + (result.channel === 'sms' ? 'phone number' : 'email address')) + '.';
    controls();
    if (!preview) timer = setInterval(controls, 250);
    code.focus();
  }
  function showNetwork(result) {
    clearTimer();
    challenge = null;
    blockedUntil = 0;
    retryToken = token(result.retryToken) ? result.retryToken : null;
    networkRetryAt = 0;
    view('network');
    el('login-heading').focus();
  }
  function errorResult(result, action) {
    var target = state === 'mfa' ? 'mfa-error' : state === 'network' ? 'network-error' : 'login-error';
    var messages = {
      invalid_credentials: 'The username or password is incorrect.',
      invalid_code: 'That verification code is not correct. Try again.',
      challenge_expired: 'Your verification has expired. Request a new code or go back to sign in.',
      rate_limited: 'Too many attempts. Please wait before trying again.',
      unavailable: 'Sign in is unavailable. Please try again later.'
    };
    if (result.code === 'rate_limited') {
      var until = Date.now() + seconds(result.retryAfterSeconds, 30) * 1000;
      if (action === 'resend' && challenge) challenge.resendAt = until;
      else if (state === 'network') networkRetryAt = until;
      else blockedUntil = until;
      if (!timer) timer = setInterval(controls, 250);
    }
    if (result.code === 'challenge_expired' && challenge) challenge.expiresAt = 0;
    if (state === 'mfa') { code.value = ''; code.setAttribute('aria-invalid', 'true'); }
    if (state === 'login') resetPassword();
    showError(target, messages[result.code] || 'Sign in could not be completed. Please try again.');
    controls();
    if (state === 'mfa' && !code.disabled) code.focus();
    else if (state === 'login' && !pw.disabled) pw.focus();
  }
  async function run(method, payload, action) {
    if (busy) return;
    var active = ++revision;
    busy = true;
    pendingAction = action;
    controls();
    try {
      if (!adapter || typeof adapter[method] !== 'function' || typeof adapter.complete !== 'function') throw new Error('Missing backend adapter');
      var result = await adapter[method](payload);
      if (active !== revision) return;
      if (!result || typeof result !== 'object') throw new Error('Invalid backend result');
      busy = false;
      if (result.status === 'mfa_required') {
        showMfa(result);
        if (action === 'resend') setStatus('mfa-status', 'A new code has been requested. Use the latest code.');
      } else if (result.status === 'clinic_network_required') {
        showNetwork(result);
        if (action === 'retry') setStatus('network-status', 'The clinic network is still required. Check your connection or contact the admin.');
      } else if (result.status === 'authenticated' && action !== 'resend') {
        // Session cookies, shared data bootstrap and navigation belong to the
        // future backend adapter. Never fabricate a VZ localStorage session.
        clearTimer();
        challenge = retryToken = null;
        view('complete');
        active = revision;
        busy = true;
        controls();
        await adapter.complete(result);
        if (active === revision) setStatus('login-status', 'Sign in was confirmed by the server.');
      } else if (result.status === 'error') errorResult(result, action);
      else throw new Error('Unknown backend result');
    } catch (error) {
      if (active !== revision) return;
      busy = false;
      if (state === 'complete') back();
      errorResult({ code: 'unavailable' }, action);
    }
    controls();
  }

  toggle.innerHTML = VZ.icon('eye', 22);
  toggle.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.innerHTML = VZ.icon(show ? 'eyeoff' : 'eye', 22);
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (state !== 'login' || busy || remaining(blockedUntil)) return;
    el('login-error').hidden = true;
    if (!user.value.trim() || !pw.value) {
      showError('login-error', 'Enter your username and password.');
      (user.value.trim() ? pw : user).focus();
      return;
    }
    if (prototype) {
      var result = VZ.login(user.value, pw.value);
      if (result.ok) { location.href = 'dashboard.html'; return; }
      showError('login-error', result.error);
      resetPassword();
      pw.focus();
      return;
    }
    if (mode !== 'backend') {
      resetPassword();
      errorResult({ code: 'unavailable' }, 'begin');
      return;
    }
    var credentials = { username: user.value.trim(), password: pw.value };
    resetPassword();
    run('begin', credentials, 'begin');
  });
  el('mfa-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (state !== 'mfa' || busy || !challenge || remaining(blockedUntil)) return;
    if (!preview && !remaining(challenge.expiresAt)) { errorResult({ code: 'challenge_expired' }, 'verify'); return; }
    if (!/^[0-9]{6}$/.test(code.value)) {
      code.setAttribute('aria-invalid', 'true');
      showError('mfa-error', 'Enter the six-digit verification code.');
      code.focus();
      return;
    }
    el('mfa-error').hidden = true;
    code.removeAttribute('aria-invalid');
    if (preview) { code.value = ''; showError('mfa-error', unavailable); code.focus(); return; }
    var verification = { challengeId: challenge.id, code: code.value };
    code.value = '';
    run('verify', verification, 'verify');
  });
  el('resend-code').addEventListener('click', function () {
    if (state !== 'mfa' || busy || !challenge || !challenge.canResend || remaining(challenge.resendAt)) return;
    if (preview) { showError('mfa-error', unavailable); return; }
    el('mfa-error').hidden = true;
    code.value = '';
    run('resend', { challengeId: challenge.id }, 'resend');
  });
  el('network-retry').addEventListener('click', function () {
    if (state !== 'network' || busy || remaining(networkRetryAt)) return;
    if (preview) { showError('network-error', 'The network check is not connected to the backend yet. No access was granted.'); return; }
    if (!retryToken) { back('Connect to the clinic network, then enter your username and password again.'); return; }
    el('network-error').hidden = true;
    run('retryNetwork', { retryToken: retryToken }, 'retry');
  });
  el('mfa-back').addEventListener('click', function () { back(); });
  el('network-back').addEventListener('click', function () { back(); });
  el('fill-admin').addEventListener('click', function () { user.value = 'admin'; pw.value = 'admin123'; pw.focus(); });
  el('fill-staff').addEventListener('click', function () { user.value = 'staff1'; pw.value = 'staff123'; pw.focus(); });
  window.addEventListener('pagehide', function () {
    revision++;
    clearTimer();
    challenge = retryToken = null;
    resetPassword();
    code.value = '';
  });
  window.addEventListener('pageshow', function (event) { if (event.persisted) back(); });

  if (previewType === 'mfa') showMfa({ challengeId: 'screen-preview', channel: 'email', expiresInSeconds: 300, canResend: true });
  else if (previewType === 'clinic-network') showNetwork({});
  else view('login');
})();
