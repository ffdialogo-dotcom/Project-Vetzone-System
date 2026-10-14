/* V13 frontend workflows. Server transactions and durable shared storage follow later. */
(function () {
  'use strict';
  var V = window.VZ;
  function fail(message) { return { ok: false, error: message }; }
  function user(perm) { return V.currentUser() && V.can(perm) ? V.currentUser() : null; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
  function money(value) { var n = Number(value); return value !== '' && value != null && isFinite(n) && n >= 0 && n <= 1000000000 && Number.isSafeInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 0.000001; }
  function whole(value, min) { return value !== '' && value != null && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= 1000000; }
  V.validDate = function (date) { var d = new Date(date + 'T00:00:00Z'); return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(0, 4) !== '0000' && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date; };
  function log(action, target, details, me) { V.audit(action, target, details, me); V.log('pet', details, me); }
  function save() { V.save(); return { ok: true }; }
  V.workflowRequests = function () { var me = V.currentUser(); return me ? V.db.workflowRequests.filter(function (r) { return me.role === 'admin' || r.by === me.username; }).slice().reverse() : []; };
  function queue(kind, payload, summary, me, before) {
    var r = { id: V.uid('wf'), kind: kind, payload: clone(payload), summary: summary, before: before || null, status: 'pending', by: me.username, at: V.nowStr(), reviewedBy: '', reviewedAt: '', note: '' };
    V.db.workflowRequests.push(r); log('workflow.submit', summary, 'Submitted ' + summary, me); V.save(); return { ok: true, pending: true, request: r };
  }
  function petSnapshot(pet) { var owner = V.findOwner(pet.ownerId); return { name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birth: pet.birth, ownerName: owner.name, ownerPhone: owner.phone }; }
  V.petSnapshot = petSnapshot;
  function validatePet(pet, d) {
    if (!pet || !V.db.owners.some(function (o) { return o.id === pet.ownerId; })) return fail('Pet or owner record is unavailable.');
    if (!text(d.name, 40) || !text(d.breed, 40) || ['Dog', 'Cat'].indexOf(d.species) < 0 || ['F', 'M'].indexOf(d.sex) < 0) return fail('Complete the pet name, species, breed and sex.');
    if (!V.validDate(d.birth) || d.birth > V.today() || V.db.records.some(function (r) { return r.petId === pet.id && r.date < d.birth; })) return fail('Birth date must be valid and no later than the earliest history entry.');
    if (!text(d.ownerName, 60) || !/^\+?[\d\s()\-]{7,25}$/.test(d.ownerPhone || '') || String(d.ownerPhone).replace(/\D/g, '').length < 7 || String(d.ownerPhone).replace(/\D/g, '').length > 13) return fail('Enter the owner name and a valid contact number.');
    return { ok: true };
  }
  function applyPet(pet, d, me) {
    var owner = V.db.owners.filter(function (o) { return o.id === pet.ownerId; })[0];
    ['name', 'species', 'breed', 'sex', 'birth'].forEach(function (key) { pet[key] = String(d[key]).trim(); });
    owner.name = d.ownerName.trim(); owner.phone = d.ownerPhone.trim();
    log('pet.edit', pet.name, 'Pet and owner details updated; clinical history retained', me);
  }
  V.editPetDetails = function (petId, d) {
    var me = user('pets.status'); if (!me) return fail('Sign in to update pet details.');
    var pet = V.findPet(petId), checked = validatePet(pet, d); if (!checked.ok) return checked;
    if (V.db.workflowRequests.some(function (r) { return r.kind === 'pet_edit' && r.payload.petId === petId && r.status === 'pending'; })) return fail('A details change for this pet is already pending.');
    if (me.role !== 'admin') return queue('pet_edit', Object.assign({}, d, { petId: petId }), 'Pet details: ' + pet.name, me, petSnapshot(pet));
    applyPet(pet, d, me); V.save(); return { ok: true, pending: false };
  };
  V.saveService = function (id, d) {
    var me = user('users.manage'); if (!me) return fail('Only admins can manage service prices.');
    if (!text(d.name, 60) || !money(d.price)) return fail('Enter a service name and valid price.');
    if (V.db.services.some(function (s) { return s.id !== id && s.name.toLowerCase() === d.name.trim().toLowerCase(); })) return fail('That service name is already used.');
    var service = id ? V.db.services.filter(function (s) { return s.id === id; })[0] : null;
    if (id && !service) return fail('Service not found.');
    if (!service) { service = { id: V.uid('svc'), displayId: V.nextDisplayId(V.db.services, 'SVC') }; V.db.services.push(service); }
    service.name = d.name.trim(); service.price = Number(d.price); service.active = d.active !== false;
    log('service.edit', service.name, 'Service catalog updated', me); return save();
  };
  function validateReceiving(d) {
    if (!text(d.supplier, 80) || !text(d.reference, 60) || !V.validDate(d.date) || d.date > V.today()) return fail('Enter supplier, delivery reference and a valid received date.');
    if (!Array.isArray(d.lines) || !d.lines.length || d.lines.length > 50) return fail('Add between 1 and 50 delivery lines.');
    if (V.db.receivings.some(function (r) { return r.supplier.toLowerCase() === d.supplier.trim().toLowerCase() && r.reference.toLowerCase() === d.reference.trim().toLowerCase(); })) return fail('This supplier reference has already been received.');
    var totalCents = 0;
    for (var i = 0; i < d.lines.length; i++) {
      var line = d.lines[i], p = V.findProduct(line.productId);
      if (!p || p.archived || !whole(line.qty, 1) || !money(line.unitCost) || !text(line.lot, 60)) return fail('Each line needs an active product, quantity, unit cost and batch reference.');
      totalCents += Math.round(Number(line.unitCost) * 100) * Number(line.qty);
      if (!Number.isSafeInteger(totalCents)) return fail('The delivery purchase total is too large.');
      if ((V.EXPIRY_REQUIRED.indexOf(p.category) >= 0 && !line.expiry) || (line.expiry && (!V.validDate(line.expiry) || line.expiry < d.date))) return fail('Enter valid expiry dates; medicines/vaccines require one, no earlier than receipt.');
      if (d.lines.slice(0, i).some(function (x) { return x.productId === line.productId && x.lot === line.lot && x.expiry === line.expiry; })) return fail('Combine duplicate product/batch lines.');
    }
    return { ok: true };
  }
  function applyReceiving(d, me, submitter) {
    var receipt = { id: V.uid('recv'), supplier: d.supplier.trim(), reference: d.reference.trim(), date: d.date, lines: [], by: me.username, submittedBy: submitter || me.username, at: V.nowStr(), totalCost: 0 };
    d.lines.forEach(function (l) {
      var batch = { id: V.uid('b'), productId: l.productId, qty: Number(l.qty), received: d.date, expiry: l.expiry || null, unitCost: Number(l.unitCost), lot: l.lot.trim(), receivingId: receipt.id };
      V.db.batches.push(batch); receipt.lines.push(Object.assign({}, l, { qty: batch.qty, unitCost: batch.unitCost, batchId: batch.id, productName: V.findProduct(l.productId).name })); receipt.totalCost += batch.qty * Math.round(batch.unitCost * 100) / 100;
    });
    receipt.totalCost = V.round2(receipt.totalCost); V.db.receivings.push(receipt); log('receiving.applied', receipt.reference, 'Received delivery from ' + receipt.supplier, me);
    return receipt;
  }
  V.receiveDelivery = function (d) {
    var me = user('inventory.submit'); if (!me) return fail('Sign in to receive a delivery.');
    var checked = validateReceiving(d); if (!checked.ok) return checked;
    if (V.db.workflowRequests.some(function (r) { return r.kind === 'receiving' && r.status === 'pending' && r.payload.supplier.trim().toLowerCase() === d.supplier.trim().toLowerCase() && r.payload.reference.trim().toLowerCase() === d.reference.trim().toLowerCase(); })) return fail('This delivery is already pending.');
    if (me.role !== 'admin') return queue('receiving', d, 'Delivery: ' + d.supplier + ' / ' + d.reference, me);
    var receipt = applyReceiving(d, me); V.save(); return { ok: true, pending: false, receipt: receipt };
  };
  function validateLoss(d) {
    var b = V.db.batches.filter(function (x) { return x.id === d.batchId; })[0];
    if (!b || !whole(d.qty, 1) || Number(d.qty) > b.qty || ['Damaged', 'Expired', 'Missing'].indexOf(d.reason) < 0 || !text(d.notes, 200) || !V.validDate(d.date) || d.date > V.today() || d.date < b.received) return fail('Choose an available batch, valid loss quantity/date, reason and note.');
    if (d.reason === 'Expired' && (!b.expiry || b.expiry >= d.date)) return fail('This batch was not expired on the loss date.');
    return { ok: true, batch: b };
  }
  function applyLoss(d, me) {
    var b = validateLoss(d).batch; b.qty -= Number(d.qty);
    var loss = Object.assign({}, d, { id: V.uid('loss'), qty: Number(d.qty), productId: b.productId, unitCost: b.unitCost == null ? null : b.unitCost, cost: b.unitCost == null ? null : V.round2(Number(d.qty) * b.unitCost), by: me.username, at: V.nowStr() });
    V.db.stockLosses.push(loss); log('stock.loss', V.findProduct(b.productId).name, d.reason + ': ' + d.qty + ' units. ' + d.notes, me);
  }
  V.recordStockLoss = function (d) {
    var me = user('inventory.submit'); if (!me) return fail('Sign in to record a stock loss.');
    var check = validateLoss(d); if (!check.ok) return check;
    if (V.db.workflowRequests.some(function (r) { return r.kind === 'loss' && r.status === 'pending' && r.payload.batchId === d.batchId; })) return fail('A loss for this batch is already pending.');
    if (me.role !== 'admin') return queue('loss', d, 'Stock loss: ' + V.findProduct(check.batch.productId).name, me);
    applyLoss(d, me); V.save(); return { ok: true, pending: false };
  };
  V.setLossPurchaseCost = function (lossId, unitCost, note, confirmed) {
    var me = user('inventory.direct'); if (!me || me.role !== 'admin') return fail('Only an admin can enter missing purchase costs.');
    var loss = V.db.stockLosses.filter(function (l) { return l.id === lossId; })[0];
    if (!loss || loss.cost != null) return fail('Choose a loss with an unknown purchase cost. This cost may already have been entered.');
    var batch = V.db.batches.filter(function (b) { return b.id === loss.batchId && b.productId === loss.productId; })[0];
    if (!batch || !(['string', 'number'].indexOf(typeof unitCost) >= 0) || (typeof unitCost === 'string' && !unitCost.trim()) || !money(unitCost) || !text(note, 200) || confirmed !== true) return fail('Enter the actual purchase cost per unit, its source, and confirm it is not the selling price.');
    unitCost = Number(unitCost);
    if (batch.unitCost != null && batch.unitCost !== unitCost) return fail('This batch already has a different purchase cost. Refresh and check the batch.');
    var losses = V.db.stockLosses.filter(function (l) { return l.batchId === batch.id && l.cost == null; });
    if (!Number.isSafeInteger(Math.round(unitCost * 100) * batch.qty) || losses.some(function (l) { return !Number.isSafeInteger(Math.round(unitCost * 100) * l.qty); })) return fail('The batch cost total is too large.');
    var at = V.nowStr();
    batch.unitCost = unitCost; batch.costEnteredAt = at; batch.costEnteredBy = me.username; batch.costNote = note.trim();
    losses.forEach(function (l) { l.unitCost = unitCost; l.cost = Math.round(unitCost * 100) * l.qty / 100; l.costEnteredAt = at; l.costEnteredBy = me.username; l.costNote = note.trim(); });
    V.audit('stock.purchase_cost.entered', batch.id, 'Unknown purchase cost set to ' + V.money(unitCost) + ' per unit; updated ' + losses.length + ' loss records. Source: ' + note.trim(), me);
    V.log('inventory', 'Entered missing purchase cost for ' + V.findProduct(batch.productId).name, me); return save();
  };
  V.costSummary = function () {
    if (!user('income.view')) return null;
    var r = { purchases: 0, lossCost: 0, unknownLossUnits: 0, expiredCost: 0, unknownExpiredUnits: 0 };
    V.db.receivings.forEach(function (x) { r.purchases += x.totalCost; });
    V.db.stockLosses.forEach(function (l) { if (l.cost == null) r.unknownLossUnits += l.qty; else r.lossCost += l.cost; });
    V.db.batches.forEach(function (b) { if (b.qty > 0 && b.expiry && b.expiry < V.today()) { if (b.unitCost == null) r.unknownExpiredUnits += b.qty; else r.expiredCost += b.qty * b.unitCost; } });
    ['purchases', 'lossCost', 'expiredCost'].forEach(function (k) { r[k] = V.round2(r[k]); }); return r;
  };
  V.visibleSales = function () { var me = user('sales.record'); return me ? V.db.sales.filter(function (s) { return me.role === 'admin' || s.by === me.username; }).slice().reverse() : []; };
  V.requestSaleReversal = function (saleId, reason) {
    var me = user('sales.record'), sale = V.db.sales.filter(function (s) { return s.id === saleId; })[0];
    if (!me || !sale || (me.role !== 'admin' && sale.by !== me.username)) return fail('You cannot request a reversal for this sale.');
    if (sale.status === 'voided' || !text(reason, 200) || reason.trim().length < 3) return fail('Choose an active sale and explain the reversal.');
    if (V.db.workflowRequests.some(function (r) { return r.kind === 'reversal' && r.payload.saleId === saleId && r.status === 'pending'; })) return fail('A reversal is already pending for this sale.');
    return queue('reversal', { saleId: saleId, amount: sale.total, reason: reason.trim() }, 'Sale reversal: ' + sale.no, me);
  };
  function validateReversal(r, decision) {
    var sale = V.db.sales.filter(function (s) { return s.id === r.payload.saleId; })[0];
    if (!sale || sale.status === 'voided' || sale.total !== r.payload.amount) return fail('This sale has changed or is already reversed.');
    if (!decision || decision.refundConfirmed !== true || V.PAYMENT_METHODS.indexOf(decision.refundMethod) < 0) return fail('Confirm the full refund was recorded and choose its method.');
    var returns = decision.returns || [], seen = {}, totalByBatch = {};
    for (var i = 0; i < returns.length; i++) {
      var ret = returns[i], line = sale.items[ret.lineIndex];
      if (!line || line.kind === 'service' || seen[ret.lineIndex] || !whole(ret.qty, 0) || Number(ret.qty) > line.qty) return fail('Check the returned product quantities.');
      seen[ret.lineIndex] = true;
      if (!Number(ret.qty)) continue;
      if (ret.usableConfirmed !== true || !Array.isArray(line.allocations) || !line.allocations.length) return fail('Stock return requires confirmed usable items and verified original batches.');
      var remaining = Number(ret.qty);
      for (var j = 0; j < line.allocations.length && remaining; j++) {
        var a = line.allocations[j], b = V.db.batches.filter(function (x) { return x.id === a.batchId; })[0], take = Math.min(remaining, a.qty);
        if (!b || !V.findProduct(line.productId) || b.productId !== line.productId || b.archived || V.findProduct(line.productId).archived || b.expiry !== a.expiry || (b.expiry && b.expiry < V.today())) return fail('Returned stock belongs to an expired, archived or changed batch. Keep its return quantity at zero.');
        totalByBatch[b.id] = (totalByBatch[b.id] || 0) + take; remaining -= take;
      }
      if (remaining) return fail('The original batch quantities cannot support this return.');
    }
    return { ok: true, sale: sale, additions: totalByBatch };
  }
  V.reviewWorkflow = function (id, choice, note, decision) {
    var me = user('inventory.review'), r = V.db.workflowRequests.filter(function (x) { return x.id === id; })[0];
    if (!me || !r || r.status !== 'pending') return fail('Only an admin can review a pending request.');
    note = String(note || '').trim(); if (note.length > 200 || ['approve', 'reject'].indexOf(choice) < 0 || (choice === 'reject' && note.length < 3)) return fail('Choose a decision; rejection needs a short explanation.');
    if (choice === 'approve') {
      var checked;
      if (r.kind === 'receiving') { checked = validateReceiving(r.payload); if (!checked.ok) return checked; applyReceiving(r.payload, me, r.by); }
      else if (r.kind === 'loss') { checked = validateLoss(r.payload); if (!checked.ok) return checked; applyLoss(r.payload, me); }
      else if (r.kind === 'pet_edit') {
        var pet = V.findPet(r.payload.petId); checked = validatePet(pet, r.payload); if (!checked.ok) return checked;
        if (JSON.stringify(petSnapshot(pet)) !== JSON.stringify(r.before)) return fail('Pet or owner details changed. Reject this stale request and submit a new one.');
        applyPet(pet, r.payload, me);
      } else if (r.kind === 'reversal') {
        checked = validateReversal(r, decision); if (!checked.ok) return checked;
        Object.keys(checked.additions).forEach(function (batchId) { V.db.batches.filter(function (b) { return b.id === batchId; })[0].qty += checked.additions[batchId]; });
        checked.sale.status = 'voided'; checked.sale.voidedAt = V.nowStr(); checked.sale.reversalId = r.id;
        r.refundMethod = decision.refundMethod; r.amount = checked.sale.total;
        r.returns = (decision.returns || []).map(function (item) { return { lineIndex: Number(item.lineIndex), qty: Number(item.qty), usableConfirmed: item.usableConfirmed === true }; });
        r.batchReturns = clone(checked.additions);
        r.returnedUnits = Object.keys(checked.additions).reduce(function (n, k) { return n + checked.additions[k]; }, 0);
      } else return fail('Unsupported request type.');
    }
    r.status = choice === 'approve' ? 'approved' : 'rejected'; r.reviewedBy = me.username; r.reviewedAt = V.nowStr(); r.note = note;
    log('workflow.' + r.status, r.summary, r.summary + ' ' + r.status, me); return save();
  };
  V.refundsBetween = function (from, to) { return V.db.workflowRequests.filter(function (r) { return r.kind === 'reversal' && r.status === 'approved' && r.reviewedAt.slice(0, 10) >= from && r.reviewedAt.slice(0, 10) <= to; }); };
  V.activeStay = function (petId) { return V.db.clinicStays.filter(function (s) { return s.petId === petId && (s.status === 'in_clinic' || s.status === 'awaiting_pickup'); })[0] || null; };
  V.admitPet = function (petId, reason, confined) {
    var me = user('pets.status'), pet = V.findPet(petId); if (!me || !pet || pet.status === 'Deceased' || !text(reason, 200)) return fail('Choose a living pet and enter a reason for check-in.');
    if (V.activeStay(petId)) return fail('This pet is already in the clinic.');
    var stay = { id: V.uid('stay'), petId: petId, admittedAt: V.nowStr(), reason: reason.trim(), by: me.username, status: 'in_clinic', confined: confined === true, confinementAt: confined === true ? V.nowStr() : '', confinementId: confined === true ? V.uid('confine') : null, confinementBy: confined === true ? me.username : '', confinementReason: confined === true ? reason.trim() : '' };
    V.db.clinicStays.push(stay); log('clinic.admit', pet.name, confined === true ? 'Pet admitted for confinement: ' + reason.trim() : 'Pet checked in for a visit', me); V.save(); return { ok: true, stay: stay };
  };
  V.confinePet = function (petId, reason) {
    var me = user('pets.status'), pet = V.findPet(petId), stay = V.activeStay(petId);
    if (!me || !pet || pet.status === 'Deceased' || !text(reason, 200)) return fail('Choose a living pet and enter the reason for confinement.');
    if (!stay) return V.admitPet(petId, reason, true);
    if (stay.confined) return fail('This pet is already confined in the clinic.');
    stay.confined = true; stay.confinementId = V.uid('confine'); stay.confinementBy = me.username; stay.confinementAt = V.nowStr(); stay.confinementReason = reason.trim(); stay.status = 'in_clinic'; delete stay.readyAt;
    log('clinic.confine', pet.name, 'Pet admitted for confinement: ' + reason.trim(), me); return save();
  };
  V.petLocation = function (petId) {
    var stay = V.activeStay(petId), pet = V.findPet(petId);
    return { confined: !!(stay && stay.confined), label: stay && stay.confined ? 'Confined in clinic' : 'Not confined', cls: stay && stay.confined ? 'chip-blue' : 'chip-grey', detail: stay ? (stay.status === 'awaiting_pickup' ? 'Awaiting pickup' : stay.confined ? 'Staying for observation or treatment' : 'In clinic for a visit') : pet && pet.status === 'Deceased' ? 'Deceased · no active clinic stay' : 'Not currently in clinic' };
  };
  V.markReadyForPickup = function (petId) {
    var me = user('medical.edit'), stay = V.activeStay(petId); if (!me || !stay || stay.status !== 'in_clinic') return fail('Only an admin can mark an in-clinic pet ready for pickup.');
    stay.status = 'awaiting_pickup'; stay.readyAt = V.nowStr(); log('clinic.ready', V.findPet(petId).name, 'Pet ready for pickup', me); return save();
  };
  V.closeClinicForDeath = function (petId) {
    var stay = V.activeStay(petId); if (stay) { stay.status = 'deceased'; stay.closedAt = V.nowStr(); }
    V.db.appointments.filter(function (a) { return a.petId === petId && a.status === 'scheduled'; }).forEach(function (a) { a.status = 'cancelled'; a.reason = 'Pet deceased'; a.updatedAt = V.nowStr(); });
  };
  function appointmentData(d, ignoreId) {
    var pet = V.findPet(d.petId); if (!pet || pet.status === 'Deceased' || !V.validDate(d.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time || '') || !text(d.purpose, 80) || (d.date + 'T' + d.time + ':00') < V.nowStr()) return fail('Choose a living pet, purpose and an appointment time in the future.');
    if (V.db.appointments.some(function (a) { return a.id !== ignoreId && a.petId === d.petId && a.date === d.date && a.time === d.time && a.status === 'scheduled'; })) return fail('This pet already has an appointment at that time.');
    return { ok: true };
  }
  V.bookAppointment = function (d) {
    var me = user('pets.status'); if (!me) return fail('Sign in to book an appointment.'); var check = appointmentData(d); if (!check.ok) return check;
    var oldPlan = V.checkupAppointment(d.petId);
    var a = { id: V.uid('apt'), petId: d.petId, date: d.date, time: d.time, purpose: d.purpose.trim(), status: 'scheduled', by: me.username, at: V.nowStr(), sourceRecordId: d.purpose === 'Checkup' && oldPlan ? oldPlan.recordId : null };
    V.db.appointments.push(a); log('appointment.book', V.findPet(d.petId).name, 'Appointment booked for ' + d.date + ' ' + d.time, me); V.save(); return { ok: true, appointment: a };
  };
  V.calendarCheckup = function (petId, sourceId) {
    var a = V.db.appointments.filter(function (a) { return a.petId === petId && a.sourceRecordId === sourceId && a.status !== 'rescheduled' && a.status !== 'cancelled'; }).slice(-1)[0];
    return a ? { recordId: sourceId, date: a.status === 'attended' ? null : a.date, missed: a.status === 'missed', appointmentId: a.id } : null;
  };
  V.validateAppointmentEvent = function (petId, d, ignoreRecordId) {
    var a = V.db.appointments.filter(function (a) { return a.id === d.appointmentId; })[0];
    if (!a || a.petId !== petId || a.status !== 'scheduled' || a.date !== d.date || a.date + 'T' + a.time + ':00' > V.nowStr() || (a.pendingRecordId && a.pendingRecordId !== ignoreRecordId)) return 'This appointment is unavailable, changed, or has not occurred yet.';
    if (d.nextDue) { var check = appointmentData({ petId: petId, date: d.nextDue, time: a.time, purpose: a.purpose }); if (!check.ok) return check.error; }
    return '';
  };
  V.markCareEventPending = function (rec) { if (rec.appointmentId) { var a = V.db.appointments.filter(function (a) { return a.id === rec.appointmentId; })[0]; if (a) a.pendingRecordId = rec.id; } };
  V.syncCareEvent = function (rec) {
    if (rec.type === 'release') { var stay = V.activeStay(rec.petId); if (stay) { stay.status = 'released'; stay.closedAt = rec.reviewedAt || rec.ts; stay.releaseRecordId = rec.id; } }
    if (rec.type === 'missed_checkup' && rec.appointmentId) {
      var a = V.db.appointments.filter(function (a) { return a.id === rec.appointmentId; })[0];
      if (a) {
        a.status = 'missed'; delete a.pendingRecordId; a.updatedAt = V.nowStr();
        if (rec.nextDue) {
          var next = { id: V.uid('apt'), petId: a.petId, date: rec.nextDue, time: a.time, purpose: a.purpose, status: 'scheduled', by: rec.by, at: V.nowStr(), previousId: a.id, sourceRecordId: a.sourceRecordId };
          a.nextId = next.id; V.db.appointments.push(next);
        }
      }
    }
  };
  V.rejectCareEvent = function (rec) { if (rec.appointmentId) { var a = V.db.appointments.filter(function (a) { return a.id === rec.appointmentId; })[0]; if (a && a.pendingRecordId === rec.id) delete a.pendingRecordId; } };
  V.changeAppointment = function (id, action, d) {
    var me = user('pets.status'), a = V.db.appointments.filter(function (a) { return a.id === id; })[0]; d = d || {};
    if (!me || !a || a.status !== 'scheduled' || a.pendingRecordId) return fail('Choose a scheduled appointment without a pending attendance review.');
    if (action === 'reschedule') {
      var next = { petId: a.petId, date: d.date, time: d.time, purpose: a.purpose }, check = appointmentData(next, a.id); if (!check.ok) return check;
      if (next.date === a.date && next.time === a.time) return fail('Choose a different appointment time.');
      var copy = Object.assign({}, a, { id: V.uid('apt'), date: next.date, time: next.time, status: 'scheduled', at: V.nowStr(), by: me.username, previousId: a.id });
      a.status = 'rescheduled'; a.nextId = copy.id; V.db.appointments.push(copy);
    } else if (action === 'cancel') { if (!text(d.reason, 200)) return fail('Enter the cancellation reason.'); a.status = 'cancelled'; a.reason = d.reason.trim(); }
    else if (action === 'attended') {
      if (a.date + 'T' + a.time + ':00' > V.nowStr() || V.findPet(a.petId).status === 'Deceased') return fail('This appointment has not occurred yet or the pet is deceased.');
      if (!V.activeStay(a.petId)) { var admitted = V.admitPet(a.petId, a.purpose); if (!admitted.ok) return admitted; }
      a.status = 'attended';
    } else if (action === 'missed') {
      var result = V.addPetEvent(a.petId, 'missed_checkup', { date: a.date, notes: d.notes || 'Owner did not attend the scheduled appointment.', appointmentId: a.id });
      if (!result.ok) return result;
      if (result.pending) a.pendingRecordId = result.record.id;
    } else return fail('Choose a valid attendance action.');
    a.updatedAt = V.nowStr(); log('appointment.' + action, V.findPet(a.petId).name, 'Appointment ' + action, me); return save();
  };
  var oldNotifications = V.notifications;
  V.notifications = function () {
    var list = oldNotifications(); if (!V.currentUser()) return list;
    V.db.appointments.filter(function (a) { return a.status === 'scheduled' && a.date <= V.addDays(V.today(), 7); }).forEach(function (a) {
      var pet = V.findPet(a.petId); if (!pet || pet.status === 'Deceased') return;
      list.push({ kind: 'appointment', key: 'appointment:' + a.id, sig: a.date + a.time + (a.pendingRecordId ? ':review' : ''), level: a.date < V.today() ? 'red' : 'amber', sev: 3, title: pet.name + ': ' + a.purpose, text: V.fmtDate(a.date) + ' at ' + a.time, label: a.pendingRecordId ? 'Pending review' : a.date < V.today() ? 'Overdue' : 'Scheduled', href: 'clinic.html?date=' + a.date });
    }); return list;
  };
  V.overdueVaccinations = function (petId) {
    var latest = {};
    V.petRecords(petId).filter(function (r) { return r.type === 'vaccination'; }).forEach(function (r) { if (!latest[r.title.toLowerCase()]) latest[r.title.toLowerCase()] = r; });
    return Object.keys(latest).map(function (k) { return latest[k]; }).filter(function (r) { return r.nextDue && r.nextDue <= V.today(); });
  };
  V.validateMissedVaccination = function (petId, d, ignoreId) {
    var pet = V.findPet(petId), source = V.overdueVaccinations(petId).filter(function (r) { return r.id === d.sourceRecordId; })[0];
    if (!pet || pet.status === 'Deceased' || !source || !V.validDate(d.date) || d.date !== source.nextDue) return fail('This vaccination schedule is unavailable, changed or not due yet. Refresh the pet profile.');
    if (d.nextDue && (!V.validDate(d.nextDue) || d.nextDue <= d.date || d.nextDue < V.today())) return fail('Choose a valid reschedule date after the missed date, today or later.');
    if (String(d.notes || '').length > 500) return fail('Keep notes within 500 characters.');
    if (V.db.records.some(function (r) { return r.id !== ignoreId && r.petId === petId && r.type === 'missed_vaccination' && r.sourceRecordId === source.id && r.date === d.date && r.status !== 'rejected'; })) return fail('This missed vaccination is already recorded or awaiting approval.');
    return { ok: true, source: source };
  };
  V.addMissedVaccination = function (petId, d) {
    var me = user('medical.submit'); if (!me) return fail('Sign in to record missed vaccination attendance.');
    var check = V.validateMissedVaccination(petId, d); if (!check.ok) return check;
    var direct = me.role === 'admin', rec = { id: V.uid('r'), petId: petId, type: 'missed_vaccination', title: 'Missed vaccination: ' + check.source.title, date: d.date, sourceRecordId: d.sourceRecordId, notes: String(d.notes || '').trim(), nextDue: d.nextDue || '', by: me.username, ts: V.nowStr(), status: direct ? 'approved' : 'pending', reviewedBy: direct ? me.username : '', reviewedAt: direct ? V.nowStr() : '', auto: direct };
    V.db.records.push(rec); V.audit(direct ? 'medical.direct' : 'medical.submit', rec.title, 'No dose given; original vaccination due date retained', me); V.log('pet', rec.title + (direct ? '' : ' (waiting for approval)'), me); V.save();
    return { ok: true, record: rec, pending: !direct };
  };
  V.setPetPhoto = function (petId, photo) {
    var me = user('pets.status'), pet = V.findPet(petId);
    if (!me || !pet) return fail('Sign in and choose an existing pet to change its picture.');
    if (typeof photo !== 'string' || (photo && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo) || photo.length > 200000))) return fail('Choose a supported pet picture. It must fit within browser storage.');
    var before = { photo: pet.photo, photoUpdatedAt: pet.photoUpdatedAt, photoUpdatedBy: pet.photoUpdatedBy }, audit = V.db.audit.slice(), activity = V.db.activity.slice();
    pet.photo = photo; pet.photoUpdatedAt = V.nowStr(); pet.photoUpdatedBy = me.username;
    V.audit(photo ? 'pet.photo.updated' : 'pet.photo.removed', pet.name, photo ? 'Pet picture updated' : 'Pet picture removed', me); V.log('pet', 'Picture ' + (photo ? 'updated' : 'removed') + ' for ' + pet.name, me);
    var result = V.trySave();
    if (!result.ok) { Object.keys(before).forEach(function (key) { if (before[key] === undefined) delete pet[key]; else pet[key] = before[key]; }); V.db.audit = audit; V.db.activity = activity; }
    return result;
  };
  V.petPhotoHTML = function (pet) { return pet.photo && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(pet.photo) && pet.photo.length <= 200000 ? '<img src="' + V.esc(pet.photo) + '" alt="' + V.esc(pet.name) + '">' : pet.species === 'Cat' ? '🐈' : '🐕'; };
})();
