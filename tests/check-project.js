/* Non-destructive checks for the browser-only VetZone prototype. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
for (const name of files) new vm.Script(fs.readFileSync(path.join(root, 'js', name), 'utf8'), { filename: name });
let checked = 0;
for (const name of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(?!https?:|#|mailto:)([^"?#]+)[^"]*"/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `${name}: missing ${match[1]}`);
    checked++;
  }
}
const data = new Map();
const store = { getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k) };
const ctx = { window: {}, localStorage: store, sessionStorage: store, Date, Math, console, alert: msg => {throw new Error(msg);} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), ctx);
const VZ = ctx.window.VZ;
assert.ok(VZ.db.products.length > 0, 'Seed inventory should exist');
assert.ok(VZ.db.users.some(u => u.role === 'admin'), 'Demo admin should exist');
assert.equal(VZ.cartTotals([{price:250,qty:2}], 10).total, 450);
assert.equal(VZ.esc('<script>'), '&lt;script&gt;');
assert.equal(VZ.login('staff1', 'staff123').ok, true, 'Demo staff should sign in');
const product = VZ.db.products.find(p => VZ.info(p).sellable >= 2);
assert.ok(product, 'Need a product with at least two sellable units');
const stockBefore = VZ.info(product).sellable;
const salesBefore = VZ.db.sales.length;
const result = VZ.recordSale([{ productId: product.id, qty: 2 }], 0, 'Cash', { cashReceived: product.price * 2 });
assert.equal(result.ok, true, result.error || 'Sale should succeed');
assert.equal(VZ.info(product).sellable, stockBefore - 2, 'Recorded sale should deduct stock');
assert.equal(VZ.db.sales.length, salesBefore + 1, 'Sale history should gain a record');
assert.equal(VZ.recordSale([{ productId: product.id, qty: stockBefore + 1 }], 0, 'Cash').ok, false, 'Overselling must be rejected');
console.log(`PASS: ${files.length} JavaScript files parsed; ${checked} local HTML links checked; basic prototype data and helpers verified.`);
