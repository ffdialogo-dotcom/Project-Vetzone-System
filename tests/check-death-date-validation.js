'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
function load(memory = new Map()) {
  const storage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };
  const ctx = { window: {}, localStorage: storage, sessionStorage: storage, Date, Math, console };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { VZ: ctx.window.VZ, memory };
}
const { VZ } = load();
const pet = VZ.db.pets[0];
assert.equal(VZ.login('staff1', 'staff123').ok, true);
const invalidDates = ['', '2026-02-30', '2025-02-29', '2024-13-01', '2024-01-00', '2024-2-01', '0000-01-01', 'not-a-date', '1900-01-01', VZ.addDays(VZ.today(), 1)];
const before = JSON.stringify(VZ.db);
for (const date of invalidDates) {
  const result = VZ.requestPetDeath(pet.id, { date, location: 'At clinic' });
  assert.equal(result.ok, false, `Must reject death date ${JSON.stringify(date)}`);
  assert.ok(result.errors.date, 'Invalid date must have a field error');
  assert.equal(JSON.stringify(VZ.db), before, 'Invalid submission must not change any records');
}
for (const date of [VZ.today(), pet.birth, '2024-02-29']) {
  const { VZ: fresh } = load();
  fresh.login('staff1', 'staff123');
  const target = fresh.db.pets[0];
  const result = fresh.requestPetDeath(target.id, { date, location: 'At clinic' });
  assert.equal(result.ok, true, `Valid date ${date} must be accepted`);
  fresh.login('admin', 'admin123');
  assert.equal(fresh.reviewPetDeath(result.request.id, 'approve', '').ok, true);
  assert.equal(target.deceased.date, date);
}
// Existing bad requests must be checked again when an admin approves them.
for (const date of invalidDates) {
  const state = load();
  state.VZ.login('staff1', 'staff123');
  const result = state.VZ.requestPetDeath(state.VZ.db.pets[0].id, { date: state.VZ.today(), location: 'At clinic' });
  result.request.date = date;
  state.VZ.save();
  const { VZ: restored } = load(state.memory);
  restored.login('admin', 'admin123');
  const beforeReview = JSON.stringify(restored.db);
  const rejectedApproval = restored.reviewPetDeath(result.request.id, 'approve', '');
  assert.equal(rejectedApproval.ok, false, `Approval must reject saved invalid date ${JSON.stringify(date)}`);
  assert.ok(rejectedApproval.error, 'Review must display the reason approval is blocked');
  assert.equal(JSON.stringify(restored.db), beforeReview, 'Blocked approval must leave request, pet, and audit unchanged');
  assert.equal(restored.reviewPetDeath(result.request.id, 'reject', 'Invalid death date; please resubmit.').ok, true, 'An invalid legacy request must still be rejectable');
}
console.log(`PASS: ${invalidDates.length} invalid submission cases, 3 valid boundaries/leap-day cases, ${invalidDates.length} persisted invalid approvals blocked without mutations and still rejectable.`);
