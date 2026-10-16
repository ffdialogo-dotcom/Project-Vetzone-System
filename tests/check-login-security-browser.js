'use strict';

/* Frontend security states and backend-adapter boundaries. No real OTP or IP service is used. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const sessionKey = 'vz_proto_session_v1';
const mfa = (extra = {}) => ({ status: 'mfa_required', challengeId: 'challenge-1', channel: 'email', maskedDestination: 'a***@clinic.test', expiresInSeconds: 120, resendAfterSeconds: 0, canResend: true, ...extra });
const step = result => ({ result });

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); res.end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const baseURL = 'http://127.0.0.1:' + server.address().port + '/';
  let browser, currentPage;
  const contexts = [], pageErrors = [], passed = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });

    async function open(suffix = '', spec) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
      contexts.push(context);
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      if (spec) await context.addInitScript(settings => {
        window.VZ_LOGIN_CONFIG = { mode: 'backend' };
        if (settings.existingPrototypeSession) sessionStorage.setItem('vz_proto_session_v1', JSON.stringify({ uid: 'u1' }));
        const queues = settings.queues || {};
        const h = window.__authTest = { calls: { begin: [], verify: [], resend: [], retryNetwork: [], complete: [] }, pending: {} };
        h.resolve = function (id, result) { if (!h.pending[id]) throw new Error('Unknown pending call ' + id); h.pending[id].resolve(result); delete h.pending[id]; };
        function call(name, payload) {
          h.calls[name].push(payload);
          const next = (queues[name] || []).shift();
          if (!next) return Promise.resolve({ status: 'error', code: 'unavailable' });
          if (next.defer) return new Promise((resolve, reject) => { h.pending[next.defer] = { resolve, reject }; });
          if (next.reject) return Promise.reject(new Error('Adapter deliberately unavailable'));
          return Promise.resolve(next.result);
        }
        if (!settings.missingAdapter) {
          window.VZ_AUTH_ADAPTER = {
            begin: payload => call('begin', payload),
            verify: payload => call('verify', payload),
            resend: payload => call('resend', payload),
            retryNetwork: payload => call('retryNetwork', payload),
            complete: result => { h.calls.complete.push(result); return settings.completeReject ? Promise.reject(new Error('Session handoff unavailable')) : Promise.resolve(); }
          };
          for (const name of settings.missingMethods || []) delete window.VZ_AUTH_ADAPTER[name];
        }
      }, spec);
      const page = await context.newPage(); currentPage = page;
      page.setDefaultTimeout(6000);
      page.on('pageerror', error => pageErrors.push(error.message));
      const response = await page.goto(baseURL + 'index.html' + suffix, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
      if (spec || suffix) await trackLegacyLogin(page);
      return page;
    }
    async function trackLegacyLogin(page) {
      await page.evaluate(() => {
        window.__legacyLoginCalls = 0;
        const original = VZ.login;
        VZ.login = function () { window.__legacyLoginCalls++; return original.apply(this, arguments); };
      });
    }
    async function signedOut(page) {
      assert.equal(new URL(page.url()).pathname, '/index.html', 'Security states must not navigate into the prototype');
      assert.equal(await page.evaluate(key => sessionStorage.getItem(key), sessionKey), null, 'Security states must never create a prototype session');
      assert.equal(await page.evaluate(() => VZ.currentUser()), null);
      assert.equal(await page.evaluate(() => window.__legacyLoginCalls), 0, 'Backend/preview flows must never fall back to VZ.login');
    }
    async function credentials(page) {
      await page.locator('#username').fill('admin');
      await page.locator('#password').fill('admin123');
      await page.locator('#login-form').evaluate(form => form.requestSubmit());
    }
    async function visible(page, selector) { await page.locator(selector).waitFor({ state: 'visible' }); }
    async function calls(page, name) { return page.evaluate(key => window.__authTest.calls[key], name); }
    async function resolve(page, id, result) {
      await page.evaluate(({ id, result }) => window.__authTest.resolve(id, result), { id, result });
      // Resolve the request and its UI continuation before inspecting a stale response.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function submitCode(page, code) {
      await page.locator('#mfa-code').fill(code);
      await page.locator('#mfa-form').evaluate(form => form.requestSubmit());
    }
    async function noPersistedSecrets(page, secrets) {
      const snapshot = await page.evaluate(() => {
        function storageValues(storage) {
          return Array.from({ length: storage.length }, (_, index) => {
            const key = storage.key(index); return [key, storage.getItem(key)];
          });
        }
        return JSON.stringify({ url: location.href, local: storageValues(localStorage), session: storageValues(sessionStorage) });
      });
      for (const secret of secrets) assert.equal(snapshot.includes(secret), false, 'Challenges, OTPs and retry tokens must stay out of the URL and browser storage');
    }

    let page = await open();
    assert.equal(await page.evaluate(() => VZ_LOGIN_CONFIG.mode), 'prototype');
    await credentials(page);
    await page.waitForURL('**/dashboard.html');
    assert.equal(await page.evaluate(() => VZ.currentUser().username), 'admin');
    passed.push('existing explicit prototype sign-in');

    page = await open('?preview=mfa');
    await visible(page, '#mfa-panel');
    assert.equal(await page.locator('#login-form').isVisible(), false);
    assert.equal(await page.locator('#mfa-code').getAttribute('type'), 'text');
    assert.equal(await page.locator('#mfa-code').getAttribute('inputmode'), 'numeric');
    assert.equal(await page.locator('#mfa-code').getAttribute('autocomplete'), 'one-time-code');
    assert.equal(await page.locator('#mfa-code').getAttribute('maxlength'), '6');
    for (const code of ['12', '000000', '123456', '654321']) {
      await submitCode(page, code);
      await visible(page, '#mfa-error');
      await signedOut(page);
    }
    await page.locator('#resend-code').click();
    await visible(page, '#mfa-error');
    assert.match(await page.locator('#mfa-error').innerText(), /backend|connect|preview|unavailable/i);
    await signedOut(page);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'MFA must fit a narrow viewport');
    assert.equal(await page.locator('#verify-code').isVisible(), true);
    await page.locator('#mfa-back').click();
    await visible(page, '#login-form');
    assert.equal(await page.locator('#password').inputValue(), '');
    await signedOut(page);
    passed.push('MFA preview arbitrary codes, resend, Back, accessibility attributes and mobile layout');

    page = await open('?preview=clinic-network');
    await visible(page, '#network-panel');
    await page.locator('#network-retry').click();
    await visible(page, '#network-error');
    assert.match(await page.locator('#network-error').innerText(), /backend|connect|preview|unavailable/i);
    await visible(page, '#network-panel');
    await page.locator('#network-retry').click();
    await signedOut(page);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Clinic-network denial must fit a narrow viewport');
    await page.locator('#network-back').click();
    await visible(page, '#login-form');
    await signedOut(page);
    passed.push('clinic-network preview retries never grant access');

    page = await open('', { queues: { begin: [step(mfa())], verify: [step({ status: 'error', code: 'invalid_code' }), step({ status: 'authenticated' })] } });
    await credentials(page);
    await visible(page, '#mfa-panel');
    assert.deepEqual(await calls(page, 'begin'), [{ username: 'admin', password: 'admin123' }]);
    assert.ok((await page.locator('#mfa-panel').innerText()).includes('a***@clinic.test'));
    assert.equal(await page.locator('#password').inputValue(), '', 'Password should be discarded after credential processing');
    await signedOut(page);
    for (const code of ['12345', 'abcdef']) {
      await submitCode(page, code); await visible(page, '#mfa-error');
      assert.equal((await calls(page, 'verify')).length, 0, 'Malformed OTP input must not reach verification');
    }
    await page.locator('#mfa-code').fill('');
    await page.evaluate(() => navigator.clipboard.writeText('012345'));
    await page.locator('#mfa-code').focus();
    await page.keyboard.press('Control+V');
    await page.waitForFunction(() => document.querySelector('#mfa-code').value === '012345');
    await page.locator('#mfa-code').press('Enter');
    await visible(page, '#mfa-error');
    assert.deepEqual(await calls(page, 'verify'), [{ challengeId: 'challenge-1', code: '012345' }]);
    await signedOut(page);
    await submitCode(page, '098765');
    await page.waitForFunction(() => window.__authTest.calls.complete.length === 1);
    assert.deepEqual(await calls(page, 'complete'), [{ status: 'authenticated' }]);
    await signedOut(page);
    passed.push('backend credential/MFA transitions, clipboard paste, leading zero, Enter and explicit session handoff');

    page = await open('', { queues: { begin: [step(mfa())], verify: [{ defer: 'verify' }] } });
    await credentials(page); await visible(page, '#mfa-panel');
    await page.locator('#mfa-code').fill('012345');
    await page.locator('#mfa-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
    assert.equal((await calls(page, 'verify')).length, 1, 'Repeated submissions must make one request');
    assert.equal(await page.locator('#verify-code').isDisabled(), true);
    assert.equal(await page.locator('#resend-code').isDisabled(), true);
    await page.locator('#mfa-back').click();
    await visible(page, '#login-form');
    await resolve(page, 'verify', { status: 'authenticated' });
    assert.equal((await calls(page, 'complete')).length, 0, 'Verification completing after Back must be ignored');
    assert.equal(await page.locator('#mfa-code').inputValue(), '');
    await signedOut(page);
    passed.push('verification pending state, duplicate-submit guard and stale success after Back');

    page = await open('', { queues: { begin: [step(mfa())], verify: [{ defer: 'restricted-history' }] } });
    await credentials(page); await visible(page, '#mfa-panel');
    await submitCode(page, '012345');
    assert.equal((await calls(page, 'verify')).length, 1);
    await page.evaluate(() => {
      // Model values restored by browser autofill while a request is pending.
      document.querySelector('#password').value = 'autofilled-before-cancel';
      document.querySelector('#mfa-code').value = '098765';
      history.replaceState = function () {
        window.__restrictedHistoryAttempted = true;
        throw new DOMException('History changes are restricted', 'SecurityError');
      };
    });
    await page.locator('#mfa-back').click(); await visible(page, '#login-form');
    assert.equal(await page.evaluate(() => window.__restrictedHistoryAttempted), true);
    assert.equal(await page.locator('#password').inputValue(), '', 'History failure must not retain a password');
    assert.equal(await page.locator('#mfa-code').inputValue(), '', 'History failure must not retain an OTP');
    assert.equal(await page.locator('#username').isDisabled(), false);
    assert.equal(await page.locator('#password').isDisabled(), false);
    assert.equal(await page.locator('#mfa-panel').isVisible(), false);
    await resolve(page, 'restricted-history', { status: 'authenticated' });
    assert.equal((await calls(page, 'complete')).length, 0, 'History failure must not allow a canceled verification to authenticate');
    await visible(page, '#login-form'); await signedOut(page);
    passed.push('restricted browser history cannot interrupt cancellation, field clearing or stale-response protection');

    page = await open('', { queues: { begin: [step(mfa())], resend: [{ defer: 'resend' }] } });
    await credentials(page); await visible(page, '#mfa-panel');
    await page.locator('#resend-code').evaluate(button => { button.click(); button.click(); });
    assert.equal((await calls(page, 'resend')).length, 1);
    assert.deepEqual(await calls(page, 'resend'), [{ challengeId: 'challenge-1' }]);
    assert.equal(await page.locator('#resend-code').isDisabled(), true);
    await page.locator('#mfa-back').click();
    await resolve(page, 'resend', mfa({ challengeId: 'challenge-stale' }));
    await visible(page, '#login-form');
    assert.equal(await page.locator('#mfa-panel').isVisible(), false, 'Stale resend cannot reopen MFA');
    await signedOut(page);
    passed.push('resend pending state, duplicate request and stale challenge cancellation');

    page = await open('', { queues: { begin: [step(mfa({ expiresInSeconds: 1, resendAfterSeconds: 2 }))], resend: [step(mfa({ challengeId: 'challenge-2' }))], verify: [step({ status: 'error', code: 'invalid_code' })] } });
    await credentials(page); await visible(page, '#mfa-panel');
    assert.equal(await page.locator('#resend-code').isDisabled(), true, 'Resend cooldown starts disabled');
    await page.waitForFunction(() => document.querySelector('#verify-code').disabled, null, { timeout: 4000 });
    await page.locator('#mfa-form').evaluate(form => { document.querySelector('#mfa-code').value = '012345'; form.requestSubmit(); });
    assert.equal((await calls(page, 'verify')).length, 0, 'An expired local challenge must not be submitted');
    await page.waitForFunction(() => !document.querySelector('#resend-code').disabled, null, { timeout: 4000 });
    await page.locator('#resend-code').click();
    await page.waitForFunction(() => !document.querySelector('#verify-code').disabled);
    await submitCode(page, '012345'); await visible(page, '#mfa-error');
    assert.deepEqual(await calls(page, 'verify'), [{ challengeId: 'challenge-2', code: '012345' }]);
    await signedOut(page);
    passed.push('cooldown, local expiry, fresh resend challenge and old challenge invalidation');

    page = await open('', { queues: { begin: [step(mfa({ channel: 'authenticator', canResend: false }))], verify: [step({ status: 'error', code: 'rate_limited', retryAfterSeconds: 1 }), step({ status: 'error', code: 'challenge_expired' })] } });
    await credentials(page); await visible(page, '#mfa-panel');
    assert.equal(await page.locator('#resend-code').isVisible(), false, 'Authenticator codes have no resend action');
    await submitCode(page, '012345'); await visible(page, '#mfa-error');
    assert.equal(await page.locator('#verify-code').isDisabled(), true, 'Rate-limited verification waits');
    await page.waitForFunction(() => !document.querySelector('#verify-code').disabled, null, { timeout: 3500 });
    await submitCode(page, '012345');
    await page.waitForFunction(() => document.querySelector('#verify-code').disabled);
    await signedOut(page);
    passed.push('authenticator UI, server rate limit and server challenge expiry');

    page = await open('', { queues: { begin: [step({ status: 'clinic_network_required', retryToken: 'network-1' })], retryNetwork: [step(mfa())] } });
    await credentials(page); await visible(page, '#network-panel');
    await page.locator('#network-retry').click(); await visible(page, '#mfa-panel');
    assert.deepEqual(await calls(page, 'retryNetwork'), [{ retryToken: 'network-1' }]);
    assert.equal((await calls(page, 'complete')).length, 0, 'Network acceptance cannot skip a required MFA response');
    await signedOut(page);
    passed.push('server clinic-network recheck continues into MFA');

    page = await open('', { queues: { begin: [step(mfa())], verify: [step({ status: 'clinic_network_required', retryToken: 'after-mfa' })], retryNetwork: [step({ status: 'authenticated' })] } });
    await credentials(page); await visible(page, '#mfa-panel');
    await submitCode(page, '012345'); await visible(page, '#network-panel');
    assert.equal((await calls(page, 'complete')).length, 0, 'MFA success cannot grant access while the server requires a network check');
    await page.locator('#network-retry').click();
    await page.waitForFunction(() => window.__authTest.calls.complete.length === 1);
    assert.deepEqual(await calls(page, 'retryNetwork'), [{ retryToken: 'after-mfa' }]);
    assert.deepEqual(await calls(page, 'complete'), [{ status: 'authenticated' }]);
    await signedOut(page);
    passed.push('network recheck after MFA and backend-authenticated session handoff');

    page = await open('', { queues: { begin: [step({ status: 'clinic_network_required', retryToken: 'network-1' })], retryNetwork: [{ defer: 'network' }] } });
    await credentials(page); await visible(page, '#network-panel');
    await page.locator('#network-retry').evaluate(button => { button.click(); button.click(); });
    assert.equal((await calls(page, 'retryNetwork')).length, 1);
    assert.equal(await page.locator('#network-retry').isDisabled(), true);
    await page.locator('#network-back').click();
    await resolve(page, 'network', { status: 'authenticated' });
    await visible(page, '#login-form');
    assert.equal((await calls(page, 'complete')).length, 0, 'Network success after Back must be ignored');
    await signedOut(page);
    passed.push('network duplicate request guard and stale response after Back');

    page = await open('', { queues: { begin: [step({ status: 'clinic_network_required' })] } });
    await credentials(page); await visible(page, '#network-panel');
    await page.locator('#network-retry').click(); await visible(page, '#login-form');
    assert.equal((await calls(page, 'retryNetwork')).length, 0, 'Missing retry token requires a fresh sign-in');
    assert.equal(await page.locator('#password').inputValue(), '');
    await signedOut(page);
    passed.push('network denial without retry token returns to cleared credentials');

    page = await open('', { queues: {
      begin: [step({ status: 'clinic_network_required', retryToken: 'denied-0' })],
      retryNetwork: [1, 2, 3].map(index => step({ status: 'clinic_network_required', retryToken: 'denied-' + index }))
    } });
    await credentials(page); await visible(page, '#network-panel');
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.locator('#network-retry').click();
      await page.waitForFunction(count => window.__authTest.calls.retryNetwork.length === count && !document.querySelector('#network-retry').disabled, attempt);
      await visible(page, '#network-panel');
      assert.equal((await calls(page, 'complete')).length, 0, 'Repeated server denials must never become successful locally');
      await signedOut(page);
    }
    assert.deepEqual(await calls(page, 'retryNetwork'), [0, 1, 2].map(index => ({ retryToken: 'denied-' + index })));
    passed.push('three actual adapter network denials remain denied and use current retry tokens');

    page = await open('', { queues: { begin: [step(mfa())], resend: [step({ status: 'authenticated' })] } });
    await credentials(page); await visible(page, '#mfa-panel');
    await page.locator('#resend-code').click(); await visible(page, '#mfa-error');
    await visible(page, '#mfa-panel');
    assert.equal((await calls(page, 'complete')).length, 0, 'A resend response must never authenticate');
    await signedOut(page);
    passed.push('resend returning authenticated fails closed without session handoff');

    page = await open('', { existingPrototypeSession: true, queues: { begin: [step(mfa())] } });
    await visible(page, '#login-form');
    const oldPrototypeSession = await page.evaluate(key => sessionStorage.getItem(key), sessionKey);
    assert.equal(await page.evaluate(() => VZ.currentUser().id), 'u1', 'Fixture should contain a valid old prototype session');
    await credentials(page); await visible(page, '#mfa-panel');
    assert.equal(new URL(page.url()).pathname, '/index.html', 'Backend mode must not automatically navigate using a prototype session');
    assert.equal((await calls(page, 'begin')).length, 1, 'Existing prototype state cannot skip backend credentials');
    assert.equal((await calls(page, 'complete')).length, 0);
    assert.equal(await page.evaluate(() => window.__legacyLoginCalls), 0);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), sessionKey), oldPrototypeSession, 'Backend login must not replace the existing prototype session');
    passed.push('backend mode with an old prototype session still requires backend credentials and MFA');

    const privateChallenge = 'private-challenge-v25-603e', privateCode = '063928', privateRetry = 'private-network-v25-942d';
    const secrets = [privateChallenge, privateCode, privateRetry];
    page = await open('', { queues: {
      begin: [step(mfa({ challengeId: privateChallenge }))],
      verify: [step({ status: 'clinic_network_required', retryToken: privateRetry })],
      retryNetwork: [{ defer: 'private-network' }]
    } });
    await credentials(page); await visible(page, '#mfa-panel');
    await page.locator('#mfa-code').fill(privateCode);
    await noPersistedSecrets(page, secrets);
    await page.reload({ waitUntil: 'load' }); await trackLegacyLogin(page);
    await visible(page, '#login-form');
    assert.equal(await page.locator('#mfa-panel').isVisible(), false);
    assert.equal(await page.locator('#mfa-code').inputValue(), '');
    assert.equal(await page.locator('#password').inputValue(), '');
    assert.equal((await calls(page, 'begin')).length, 0, 'Refresh must not automatically resume credentials or MFA');
    await signedOut(page); await noPersistedSecrets(page, secrets);
    await credentials(page); await visible(page, '#mfa-panel');
    await submitCode(page, privateCode); await visible(page, '#network-panel');
    assert.equal(await page.locator('#mfa-code').inputValue(), '');
    await page.locator('#network-retry').click();
    assert.deepEqual(await calls(page, 'retryNetwork'), [{ retryToken: privateRetry }]);
    await noPersistedSecrets(page, secrets);
    await page.reload({ waitUntil: 'load' }); await trackLegacyLogin(page);
    await visible(page, '#login-form');
    assert.equal(await page.locator('#mfa-panel').isVisible(), false);
    assert.equal(await page.locator('#network-panel').isVisible(), false);
    assert.equal((await calls(page, 'retryNetwork')).length, 0, 'Refresh must not automatically reuse a retry token');
    await signedOut(page); await noPersistedSecrets(page, secrets);
    passed.push('challenge/OTP/retry privacy in URLs and storage; refresh resets MFA and pending network state');

    for (const invalid of [
      { expiresInSeconds: 0 }, { expiresInSeconds: -1 }, { expiresInSeconds: '120' },
      { expiresInSeconds: 86401 }, { channel: 'push' }, { channel: null },
      { resendAfterSeconds: -1 }, { resendAfterSeconds: '30' },
      { resendAfterSeconds: null }, { resendAfterSeconds: 86401 }
    ]) {
      page = await open('', { queues: { begin: [step(mfa(invalid))] } });
      await credentials(page); await visible(page, '#login-error');
      assert.equal(await page.locator('#mfa-panel').isVisible(), false, 'Malformed challenge metadata must not open verification');
      assert.equal((await calls(page, 'complete')).length, 0);
      await signedOut(page);
    }
    passed.push('invalid challenge expiry, resend cooldowns and unsupported/missing channels fail closed');

    for (const [name, settings] of [
      ['missing adapter', { missingAdapter: true }],
      ['rejected adapter', { queues: { begin: [{ reject: true }] } }],
      ['unknown result', { queues: { begin: [step({ status: 'unexpected' })] } }],
      ['malformed result', { queues: { begin: [step(null)] } }],
      ['missing challenge ID', { queues: { begin: [step(mfa({ challengeId: '' }))] } }],
      ['missing completion handler', { queues: { begin: [step({ status: 'authenticated' })] }, missingMethods: ['complete'] }],
      ['rejected completion handler', { queues: { begin: [step({ status: 'authenticated' })] }, completeReject: true }]
    ]) {
      page = await open('', settings); await credentials(page);
      await visible(page, '#login-error');
      await signedOut(page);
      passed.push(name + ' fails closed');
    }

    page = await open('', { queues: { begin: [step(mfa())] }, missingMethods: ['verify'] });
    await credentials(page); await visible(page, '#mfa-panel');
    await submitCode(page, '012345'); await visible(page, '#mfa-error');
    await signedOut(page);
    passed.push('missing verification handler fails closed');

    assert.deepEqual(pageErrors, [], 'No uncaught browser errors');
    console.log('PASS: V25 login security browser checks (' + passed.length + ' scenarios): ' + passed.join('; ') + '.');
  } catch (error) {
    if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: '/tmp/v25-login-security-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
