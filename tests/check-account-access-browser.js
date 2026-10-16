'use strict';

/* Admin-only account creation, denied public APIs, and preserved legacy requests. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const root = path.resolve(__dirname, '..');
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
  let browser, page;
  const contexts = [], errors = [], passed = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
    async function newContext(options = {}) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
      contexts.push(context);
      await context.route('https://fonts.googleapis.com/**', route => route.abort());
      return context;
    }
    const context = await newContext();
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    async function open(file) {
      const response = await page.goto(baseURL + file, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
    }
    async function login(username, password) {
      await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);
      await page.locator('#login-form button[type=submit]').click();
      await page.waitForURL('**/dashboard.html');
    }
    async function logout() {
      await page.locator('#user-btn').click(); await page.locator('#logout-btn').click();
      await page.waitForURL('**/index.html');
    }
    async function noPublicCreateLink() {
      assert.equal(await page.locator('#create-link').count(), 0, 'Public account link must be removed from the document');
      assert.equal(await page.locator('a[href*="create-account.html"]').count(), 0, 'Login states must not expose an account-creation link');
    }
    async function noOverflow(label) {
      for (const width of [320, 375, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label + ' must fit ' + width + 'px');
      }
    }
    async function deniedRegister(label) {
      const result = await page.evaluate(() => {
        function snapshot() {
          function entries(storage) { return Array.from({ length: storage.length }, (_, i) => { const key = storage.key(i); return [key, storage.getItem(key)]; }); }
          return JSON.stringify({ db: VZ.db, local: entries(localStorage), session: entries(sessionStorage) });
        }
        const before = snapshot(), responses = [];
        const payloads = [undefined, null, {}, { name: 'Public Staff', username: 'publicstaff', password: 'public12345', role: 'staff' }, { name: 'Crafted Admin', username: 'craftedadmin', password: 'public12345', role: 'admin', active: true, pending: false, displayId: 'ADM-9999' }];
        for (let repeat = 0; repeat < 3; repeat++) for (const payload of payloads) responses.push(VZ.register(payload));
        return { unchanged: snapshot() === before, responses };
      });
      assert.equal(result.unchanged, true, label + ': register must not alter users, activity, audit, IDs or any storage');
      for (const response of result.responses) {
        assert.equal(response.ok, false);
        assert.equal(typeof response.error, 'string');
        assert.ok(response.error.length > 0);
        assert.equal(response.errors.name, response.error, 'Legacy API should expose the same denial in its field-error shape');
      }
    }
    async function deniedAddUser(label) {
      const result = await page.evaluate(() => {
        function snapshot() {
          function entries(storage) { return Array.from({ length: storage.length }, (_, i) => { const key = storage.key(i); return [key, storage.getItem(key)]; }); }
          return JSON.stringify({ db: VZ.db, local: entries(localStorage), session: entries(sessionStorage) });
        }
        const before = snapshot();
        const responses = ['staff', 'admin'].map(role => VZ.addUser({ name: 'Denied ' + role, username: 'denied_' + role, password: 'denied12345', role }));
        return { unchanged: snapshot() === before, responses };
      });
      assert.equal(result.unchanged, true, label + ': denied addUser must not mutate data or storage');
      for (const response of result.responses) { assert.equal(response.ok, false); assert.equal(response.denied, true); }
    }
    async function fillAccount({ name, username, password, role }) {
      await page.locator('#create-form [name=name]').fill(name);
      await page.locator('#create-form [name=username]').fill(username);
      await page.locator('#create-form [name=password]').fill(password);
      await page.locator('#create-form [name=role]').selectOption(role);
    }
    async function submitAccount() {
      await page.locator('#create-form button[type=submit]').click();
    }

    await open('index.html'); await noPublicCreateLink(); await noOverflow('Login');
    for (const [preview, back] of [['mfa', '#mfa-back'], ['clinic-network', '#network-back']]) {
      await open('index.html?preview=' + preview); await noPublicCreateLink();
      await page.locator(back).click(); await noPublicCreateLink();
      assert.equal(await page.locator('#login-form').isVisible(), true);
    }
    passed.push('no public creation link on login, security previews or Back; login fits five widths');

    await open('create-account.html'); await page.waitForURL('**/index.html');
    assert.equal(await page.locator('#create-form').isVisible(), false);
    await deniedRegister('Anonymous'); await deniedAddUser('Anonymous');
    passed.push('anonymous direct URL redirects and account APIs deny without mutations');

    const noScriptContext = await newContext({ javaScriptEnabled: false });
    const noScriptPage = await noScriptContext.newPage();
    for (const fixtureSession of [null, { uid: 'u2' }]) {
      await noScriptPage.goto(baseURL + 'create-account.html', { waitUntil: 'load' });
      if (fixtureSession) {
        await noScriptPage.evaluate(value => sessionStorage.setItem('vz_proto_session_v1', JSON.stringify(value)), fixtureSession);
        await noScriptPage.reload({ waitUntil: 'load' });
      }
      assert.equal(await noScriptPage.locator('#page').getAttribute('hidden') !== null, true, 'Account page must start hidden in its HTML');
      assert.equal(await noScriptPage.locator('#create-form').isVisible(), false, 'Disabled scripts must never expose the account form');
    }
    passed.push('account form stays hidden with JavaScript disabled, including an existing staff session');

    const baseline = await page.evaluate(() => {
      const originalUsers = VZ.db.users.map(user => ({ id: user.id, displayId: user.displayId, username: user.username, role: user.role }));
      const clinicData = JSON.stringify(Object.fromEntries(Object.entries(VZ.db).filter(([key]) => !['users', 'activity', 'audit', 'seq'].includes(key))));
      const template = VZ.db.users.find(user => user.role === 'staff');
      const pending = ['approve', 'reject'].map(decision => {
        const username = 'legacy_' + decision;
        const user = { ...template, id: 'legacy-pending-' + decision + '-v26', displayId: VZ.nextDisplayId(VZ.db.users, 'STF'), username, name: 'Legacy ' + decision, passHash: VZ.hash(username, 'legacy12345'), active: false, pending: true, seen: {} };
        VZ.db.users.push(user);
        return { id: user.id, displayId: user.displayId, username };
      });
      VZ.save(); return { originalUsers, clinicData, pending };
    });
    await page.reload();
    assert.equal(await page.evaluate(() => VZ.pendingCount()), 2, 'Existing pending requests must survive loading V26');
    await login('staff1', 'staff123');
    await open('create-account.html'); await page.waitForURL('**/dashboard.html');
    assert.equal(await page.locator('#create-form').isVisible(), false);
    await deniedRegister('Staff'); await deniedAddUser('Staff');
    const deniedReview = await page.evaluate(ids => ids.map(id => ({ approve: VZ.approveUser(id).ok, reject: VZ.rejectUser(id).ok })), baseline.pending.map(user => user.id));
    assert.deepEqual(deniedReview, [{ approve: false, reject: false }, { approve: false, reject: false }]);
    assert.equal(await page.evaluate(() => VZ.pendingCount()), 2);
    await open('staff.html'); await page.waitForURL('**/dashboard.html');
    assert.equal(await page.locator('#add-user').count(), 0);
    passed.push('staff direct URLs and crafted APIs cannot create accounts or review legacy requests');

    await logout(); await login('admin', 'admin123'); await open('staff.html');
    assert.equal(await page.locator('#add-user').isVisible(), true);
    for (const pending of baseline.pending) assert.equal(await page.locator('[data-approve="' + pending.id + '"]').isVisible(), true);
    await deniedRegister('Admin');
    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    assert.equal(await page.locator('#page').isVisible(), true);
    assert.equal(await page.locator('#create-form').isVisible(), true);
    assert.equal(await page.locator('#admin-role').isVisible(), true);
    assert.deepEqual(await page.locator('#create-form [name=role] option').evaluateAll(options => options.map(option => option.value)), ['staff', 'admin']);
    assert.equal(await page.locator('#guest-role, #guest-top').count(), 0);
    assert.equal(await page.locator('#login-link').getAttribute('href'), 'staff.html');
    await noOverflow('Admin create account');
    await fillAccount({ name: 'V26 Added Staff', username: 'v26staff', password: 'V26staff12345', role: 'staff' });
    const password = page.locator('#create-form [name=password]');
    assert.equal(await password.getAttribute('type'), 'password');
    await page.locator('#toggle-pw').click();
    assert.equal(await password.getAttribute('type'), 'text');
    assert.equal(await page.locator('#toggle-pw').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#toggle-pw').getAttribute('aria-label'), 'Hide password');
    await page.locator('#toggle-pw').click();
    assert.equal(await password.getAttribute('type'), 'password');
    await submitAccount(); await page.waitForURL('**/staff.html');
    const addedStaff = await page.evaluate(() => VZ.db.users.find(user => user.username === 'v26staff'));
    assert.equal(addedStaff.role, 'staff'); assert.equal(addedStaff.active, true); assert.equal(addedStaff.pending, false);
    assert.match(addedStaff.displayId, /^STF-\d{4,}$/);
    passed.push('admin reaches create from Staff accounts, keeps role selection/password toggle and creates active staff');

    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    await fillAccount({ name: 'Duplicate Case', username: 'V26STAFF', password: 'Duplicate12345', role: 'admin' });
    const beforeDuplicate = await page.evaluate(() => JSON.stringify(VZ.db));
    await submitAccount();
    assert.match(await page.locator('[data-err=username]').innerText(), /taken|already|exist/i);
    assert.equal(await page.evaluate(() => JSON.stringify(VZ.db)), beforeDuplicate, 'Case-insensitive duplicate must not allocate IDs or create logs');
    await fillAccount({ name: 'V26 Added Admin', username: 'v26admin', password: 'V26admin12345', role: 'admin' });
    await submitAccount(); await page.waitForURL('**/staff.html');
    const addedAdmin = await page.evaluate(() => VZ.db.users.find(user => user.username === 'v26admin'));
    assert.equal(addedAdmin.role, 'admin'); assert.equal(addedAdmin.active, true); assert.equal(addedAdmin.pending, false);
    assert.match(addedAdmin.displayId, /^ADM-\d{4,}$/);
    const beforeReload = await page.evaluate(() => JSON.stringify(VZ.db.users));
    await page.reload();
    assert.equal(await page.evaluate(() => JSON.stringify(VZ.db.users)), beforeReload);
    assert.equal(await page.evaluate(() => new Set(VZ.db.users.map(user => user.displayId)).size === VZ.db.users.length), true, 'Display IDs must remain unique across both roles and pending requests');
    assert.equal(await page.evaluate(() => VZ.pendingCount()), 2);
    passed.push('case-insensitive duplicates do not mutate data; admin creation and unique ADM/STF IDs persist on reload');

    await page.locator('[data-approve="' + baseline.pending[0].id + '"]').click();
    assert.deepEqual(await page.evaluate(id => { const user = VZ.db.users.find(user => user.id === id); return { active: user.active, pending: user.pending, displayId: user.displayId }; }, baseline.pending[0].id), { active: true, pending: false, displayId: baseline.pending[0].displayId });
    await page.locator('[data-reject="' + baseline.pending[1].id + '"]').click();
    await page.locator('[data-yes]').click();
    await page.waitForSelector('.modal-overlay', { state: 'detached' });
    assert.equal(await page.evaluate(id => VZ.db.users.some(user => user.id === id), baseline.pending[1].id), false);
    assert.equal(await page.evaluate(() => VZ.pendingCount()), 0);
    const preserved = await page.evaluate(() => ({
      users: VZ.db.users.map(user => ({ id: user.id, displayId: user.displayId, username: user.username, role: user.role })),
      clinicData: JSON.stringify(Object.fromEntries(Object.entries(VZ.db).filter(([key]) => !['users', 'activity', 'audit', 'seq'].includes(key)))),
      actions: VZ.db.audit.map(event => event.action)
    }));
    for (const user of baseline.originalUsers) assert.deepEqual(preserved.users.find(candidate => candidate.id === user.id), user, 'Existing accounts must be preserved');
    assert.equal(preserved.clinicData, baseline.clinicData, 'Account work must preserve patient, inventory, sales and all other clinic collections');
    assert.ok(preserved.actions.includes('account.approve')); assert.ok(preserved.actions.includes('account.reject'));
    await page.reload();
    assert.equal(await page.evaluate(id => VZ.db.users.find(user => user.id === id).active, baseline.pending[0].id), true);
    passed.push('legacy pending users survive until explicit admin approval/rejection; existing users and clinic records remain unchanged');

    await logout(); await noPublicCreateLink(); await login('v26staff', 'V26staff12345');
    assert.equal(await page.evaluate(() => VZ.currentUser().id), addedStaff.id);
    await open('create-account.html'); await page.waitForURL('**/dashboard.html');
    assert.equal(await page.locator('#create-form').isVisible(), false);
    await deniedRegister('New staff'); await deniedAddUser('New staff');
    await logout(); await login('v26admin', 'V26admin12345'); await open('staff.html');
    assert.equal(await page.locator('#add-user').isVisible(), true);
    passed.push('new staff can sign in without acquiring admin creation powers; newly created admin can manage accounts');

    const control = await context.newPage();
    control.setDefaultTimeout(10000); control.on('pageerror', error => errors.push(error.message));
    await control.goto(baseURL + 'index.html', { waitUntil: 'load' });
    await control.locator('#username').fill('admin'); await control.locator('#password').fill('admin123');
    await control.locator('#login-form button[type=submit]').click(); await control.waitForURL('**/dashboard.html');
    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    await fillAccount({ name: 'Stale Demoted Admin', username: 'stale_demotion', password: 'Stale12345', role: 'admin' });
    const otherTabChanges = await control.evaluate(targetId => {
      const demoted = VZ.changeRole(targetId, 'staff', 'admin123');
      const created = VZ.addUser({ name: 'Other Tab Staff', username: 'other_tab_staff', password: 'Other12345', role: 'staff' });
      return { demoted: demoted.ok, created: created.ok, saved: localStorage.getItem('vz_proto_db_v1') };
    }, addedAdmin.id);
    assert.equal(otherTabChanges.demoted, true); assert.equal(otherTabChanges.created, true);
    assert.equal(await page.evaluate(() => VZ.currentUser().role), 'admin', 'The open form must still have its old in-memory role for this regression');
    const staleDemotion = await page.evaluate(() => {
      const before = JSON.stringify(VZ.db);
      const result = VZ.addUser({ name: 'Stale Demoted Admin', username: 'stale_demotion', password: 'Stale12345', role: 'admin' });
      return { result, unchanged: before === JSON.stringify(VZ.db), saved: localStorage.getItem('vz_proto_db_v1') };
    });
    assert.equal(staleDemotion.result.ok, false); assert.equal(staleDemotion.result.denied, true);
    assert.equal(staleDemotion.unchanged, true, 'Denied stale actor must not allocate IDs or append events');
    assert.equal(staleDemotion.saved, otherTabChanges.saved, 'Stale actor must not overwrite a persisted demotion or another account');
    await submitAccount();
    assert.match(await page.locator('#create-form .form-error').innerText(), /access.*changed|reload|sign in again/i);
    assert.equal(await page.evaluate(() => localStorage.getItem('vz_proto_db_v1')), otherTabChanges.saved);
    assert.equal(await page.locator('#create-form [name=username]').inputValue(), 'stale_demotion', 'A denied save must preserve the draft');
    await control.reload({ waitUntil: 'load' });
    const freshAdmin = await control.evaluate(targetId => {
      const created = VZ.addUser({ name: 'Fresh Tab Staff', username: 'fresh_tab_staff', password: 'Fresh12345', role: 'staff' });
      const restored = VZ.changeRole(targetId, 'admin', 'admin123');
      return { created: created.ok, restored: restored.ok };
    }, addedAdmin.id);
    assert.deepEqual(freshAdmin, { created: true, restored: true }, 'Fresh authorized admin can still create accounts after reloading');
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#create-form').isVisible(), true);
    assert.equal(await page.evaluate(() => VZ.db.users.some(user => user.username === 'stale_demotion')), false);
    assert.equal(await page.evaluate(() => ['other_tab_staff', 'fresh_tab_staff'].every(username => VZ.db.users.some(user => user.username === username))), true);
    passed.push('real two-tab demotion and account creation cannot be overwritten by stale APIs/forms; refreshed admin creation works');

    await fillAccount({ name: 'Stock Refresh Staff', username: 'stock_refresh', password: 'Stock12345', role: 'staff' });
    const stockChange = await control.evaluate(() => {
      const product = VZ.db.products.find(product => !product.archived && !VZ.EXPIRY_REQUIRED.includes(product.category));
      const before = VZ.info(product).sellable;
      const result = VZ.restock(product.id, { qty: 2, expiry: '', reason: 'Concurrent stock receipt regression' });
      return { ok: result.ok, productId: product.id, before, after: VZ.info(product).sellable, saved: localStorage.getItem('vz_proto_db_v1') };
    });
    assert.equal(stockChange.ok, true); assert.equal(stockChange.after, stockChange.before + 2);
    const staleStock = await page.evaluate(() => {
      const before = JSON.stringify(VZ.db);
      const result = VZ.addUser({ name: 'Stock Refresh Staff', username: 'stock_refresh', password: 'Stock12345', role: 'staff' });
      return { result, unchanged: before === JSON.stringify(VZ.db), saved: localStorage.getItem('vz_proto_db_v1') };
    });
    assert.equal(staleStock.result.ok, false); assert.match(staleStock.result.error, /saved data changed.*reload/i);
    assert.equal(staleStock.unchanged, true, 'A stale data save must not consume IDs or log a creation');
    assert.equal(staleStock.saved, stockChange.saved, 'Account creation must not overwrite newer stock');
    await submitAccount();
    assert.match(await page.locator('#create-form .form-error').innerText(), /saved data changed.*reload/i);
    assert.equal(await page.locator('#create-form [name=username]').inputValue(), 'stock_refresh');
    assert.equal(await page.locator('#create-form [name=password]').inputValue(), 'Stock12345', 'The blocked save must not discard an open draft');
    assert.equal(await page.evaluate(() => localStorage.getItem('vz_proto_db_v1')), stockChange.saved);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.evaluate(id => VZ.info(VZ.findProduct(id)).sellable, stockChange.productId), stockChange.after);
    await fillAccount({ name: 'Stock Refresh Staff', username: 'stock_refresh', password: 'Stock12345', role: 'staff' });
    await submitAccount(); await page.waitForURL('**/staff.html');
    assert.equal(await page.evaluate(() => VZ.db.users.filter(user => user.username === 'stock_refresh').length), 1);
    assert.equal(await page.evaluate(id => VZ.info(VZ.findProduct(id)).sellable, stockChange.productId), stockChange.after, 'Refreshed account creation must retain the stock receipt');
    await control.close();
    passed.push('unrelated newer stock blocks a stale account save without mutation or draft loss; explicit reload preserves stock and permits creation');

    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    await fillAccount({ name: 'Expired Session', username: 'expired_session', password: 'Expired12345', role: 'admin' });
    await page.evaluate(() => sessionStorage.removeItem('vz_proto_session_v1'));
    await deniedAddUser('Session removed after opening form');
    await submitAccount(); await page.waitForURL('**/index.html');
    assert.equal(await page.locator('#create-form').isVisible(), false);
    assert.equal(await page.evaluate(() => VZ.db.users.some(user => user.username === 'expired_session')), false);
    passed.push('session removal after form opening blocks both the API and submission');

    await login('v26admin', 'V26admin12345'); await open('staff.html');
    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    await fillAccount({ name: 'Demoted Session', username: 'demoted_session', password: 'Demoted12345', role: 'admin' });
    const demotion = await page.evaluate(() => {
      const id = VZ.currentUser().id;
      const actingAdmin = VZ.login('admin', 'admin123');
      const change = VZ.changeRole(id, 'staff', 'admin123');
      const changedSession = VZ.login('v26admin', 'V26admin12345');
      return { actingAdmin: actingAdmin.ok, change: change.ok, changedSession: changedSession.ok, role: VZ.currentUser().role };
    });
    assert.deepEqual(demotion, { actingAdmin: true, change: true, changedSession: true, role: 'staff' });
    await deniedAddUser('Demoted user after opening form');
    await submitAccount(); await page.waitForURL('**/dashboard.html');
    assert.equal(await page.locator('#create-form').isVisible(), false);
    assert.equal(await page.evaluate(() => VZ.db.users.some(user => user.username === 'demoted_session')), false);
    passed.push('a current role change after form opening blocks the API and submission');

    await logout(); await login('admin', 'admin123'); await open('staff.html');
    await page.locator('#add-user').click(); await page.waitForURL('**/create-account.html');
    await fillAccount({ name: 'Cached Form', username: 'cached_form', password: 'Cached12345', role: 'admin' });
    const hiddenPage = await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return { hidden: document.getElementById('page').hidden, password: document.querySelector('#create-form [name=password]').value };
    });
    assert.deepEqual(hiddenPage, { hidden: true, password: '' }, 'Leaving a cached page must hide the form and clear its temporary password');
    await page.evaluate(() => sessionStorage.removeItem('vz_proto_session_v1'));
    const restoredNavigation = page.waitForURL('**/index.html');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await restoredNavigation;
    assert.equal(await page.locator('#create-form').isVisible(), false);
    assert.equal(await page.evaluate(() => VZ.db.users.some(user => user.username === 'cached_form')), false);
    passed.push('persisted-page lifecycle hides sensitive form data and reloads authorization before revealing it');

    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: V26 account access browser checks (' + passed.length + ' scenarios): ' + passed.join('; ') + '.');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: '/tmp/v26-account-access-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    for (const context of contexts) await context.close();
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
