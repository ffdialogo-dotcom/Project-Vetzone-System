/* Focused dialogs shared by the V13 tabs; brand styles stay in styles.css. */
(function () {
  'use strict';
  var V = window.VZ, E = V.esc;
  var U = V.ui = {};
  U.table = function (rows, headers, row, page) {
    page = Math.min(page || 1, Math.max(1, Math.ceil(rows.length / 8)));
    var from = (page - 1) * 8;
    return '<div class="table-wrap"><table class="table"><thead><tr>' + headers.map(function (h) { return '<th scope="col">' + E(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.slice(from, from + 8).map(row).join('') : '<tr><td colspan="' + headers.length + '" class="empty workflow-empty">Nothing to show here yet.</td></tr>') + '</tbody></table></div><div class="table-foot"><span>' + (rows.length ? (from + 1) + '–' + Math.min(from + 8, rows.length) : '0') + ' of ' + rows.length + '</span><div class="pager"><button type="button" data-page="' + (page - 1) + '"' + (page === 1 ? ' disabled' : '') + '>Previous</button><button type="button" data-page="' + (page + 1) + '"' + (from + 8 >= rows.length ? ' disabled' : '') + '>Next</button></div></div>';
  };
  U.field = function (label, name, input, hint) { return V.field(label, name, input, hint); };
  U.input = function (name, value, type, attrs) { return '<input class="input" name="' + name + '" type="' + (type || 'text') + '" value="' + E(value == null ? '' : value) + '" ' + (attrs || '') + '>'; };
  U.select = function (name, items, selected) { return '<select class="select" name="' + name + '">' + items.map(function (x) { var value = typeof x === 'string' ? x : x.value, label = typeof x === 'string' ? x : x.label; return '<option value="' + E(value) + '"' + (value === selected ? ' selected' : '') + '>' + E(label) + '</option>'; }).join('') + '</select>'; };
  U.form = function (title, content, submit, label, done, wide) {
    var m = V.modal(title, '<form id="workflow-form" novalidate>' + content + '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + E(label || 'Save') + '</button></div></form>', { wide: !!wide });
    var f = m.body.querySelector('form'), busy = false;
    f.querySelector('[data-cancel]').addEventListener('click', m.close);
    f.addEventListener('submit', function (event) { event.preventDefault(); if (busy) return; busy = true; var r = submit(V.formData(f), f); if (!r.ok) { busy = false; V.showFormError(f, r.error || 'Check the form details.'); return; } m.close(); V.toast(r.pending ? 'Sent for admin approval.' : 'Saved.'); V.refreshNavBadges(); V.refreshBell(); if (done) done(r); });
    return m;
  };
  U.petOptions = function () { return V.db.pets.filter(function (p) { return p.status !== 'Deceased'; }).map(function (p) { return { value: p.id, label: p.name + ' — ' + V.findOwner(p.ownerId).name }; }); };
  U.editPet = function (petId, done) {
    var p = V.findPet(petId), s = V.petSnapshot(p);
    U.form('Edit pet and owner details', '<p class="caption">Owner contact changes apply to all pets with this owner. Medical history is preserved.</p><div class="form-grid">' +
      U.field('Pet name', 'name', U.input('name', s.name, 'text', 'maxlength="40"')) + U.field('Species', 'species', U.select('species', ['Dog', 'Cat'], s.species)) +
      U.field('Breed', 'breed', U.input('breed', s.breed, 'text', 'maxlength="40"')) + U.field('Sex', 'sex', U.select('sex', [{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }], s.sex)) +
      U.field('Birth date', 'birth', U.input('birth', s.birth, 'date', 'max="' + V.today() + '"')) + '<span></span>' +
      U.field('Owner name', 'ownerName', U.input('ownerName', s.ownerName, 'text', 'maxlength="60"')) + U.field('Owner phone', 'ownerPhone', U.input('ownerPhone', s.ownerPhone, 'tel', 'maxlength="25"')) + '</div>',
      function (d) { return V.editPetDetails(petId, d); }, V.can('medical.edit') ? 'Save details' : 'Send for approval', done, true);
  };
  U.bookAppointment = function (date, petId, done) {
    date = date && date >= V.today() ? date : V.today();
    var now = new Date(), minutes = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 15) * 15, time = '09:00';
    if (date === V.today()) { if (minutes >= 1440) date = V.addDays(date, 1); else time = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0'); }
    U.form('Book appointment', '<div class="form-grid">' + U.field('Pet', 'petId', U.select('petId', U.petOptions(), petId)) + U.field('Purpose', 'purpose', U.select('purpose', ['Checkup', 'Vaccination', 'Consultation', 'Grooming', 'Procedure'], 'Checkup')) +
      U.field('Date', 'date', U.input('date', date, 'date', 'min="' + V.today() + '"')) + U.field('Time', 'time', U.input('time', time, 'time'), 'Clinic local time.') + '</div>', function (d) { return V.bookAppointment(d); }, 'Book appointment', done);
  };
  U.admit = function (petId, done) { U.form('Check in pet', U.field('Pet', 'petId', U.select('petId', U.petOptions(), petId)) + U.field('Reason for clinic stay', 'reason', U.input('reason', '', 'text', 'maxlength="200"')), function (d) { return V.admitPet(d.petId, d.reason); }, 'Confirm check-in', done); };
  U.service = function (service, done) {
    service = service || { name: '', price: '', active: true };
    U.form(service.id ? 'Edit service' : 'Add service', U.field('Service name', 'name', U.input('name', service.name, 'text', 'maxlength="60"')) + U.field('Price', 'price', U.input('price', service.price, 'number', 'min="0" step="0.01"')) + '<label class="radio"><input type="checkbox" name="active"' + (service.active ? ' checked' : '') + '> Available for billing</label>',
      function (d, f) { d.active = f.elements.active.checked; return V.saveService(service.id, d); }, 'Save service', done);
  };
  U.receive = function (done) {
    var products = V.products().map(function (p) { return { value: p.id, label: p.displayId + ' — ' + p.name }; });
    var m = U.form('Receive supplier delivery', '<div class="form-grid">' + U.field('Supplier', 'supplier', U.input('supplier', '', 'text', 'maxlength="80" list="supplier-names"')) + U.field('Delivery reference', 'reference', U.input('reference', '', 'text', 'maxlength="60"')) + U.field('Received date', 'date', U.input('date', V.today(), 'date', 'max="' + V.today() + '"')) + '</div><datalist id="supplier-names">' + Array.from(new Set(V.db.receivings.map(function (r) { return r.supplier; }))).map(function (s) { return '<option value="' + E(s) + '">'; }).join('') + '</datalist><div id="delivery-lines"></div><button class="btn btn-ghost btn-sm" type="button" id="delivery-add-line">+ Add line</button><p class="delivery-total caption" aria-live="polite"></p>',
      function (d, f) {
        d.lines = Array.from(f.querySelectorAll('[data-delivery-line]')).map(function (row) { var l = {}; row.querySelectorAll('[data-line-field]').forEach(function (el) { l[el.dataset.lineField] = el.value; }); return l; }); return V.receiveDelivery(d);
      }, V.can('inventory.direct') ? 'Confirm receipt' : 'Send for approval', done, true);
    var host = m.body.querySelector('#delivery-lines');
    function total() { var sum = 0; host.querySelectorAll('[data-delivery-line]').forEach(function (row) { sum += (Number(row.querySelector('[data-line-field=qty]').value) || 0) * (Number(row.querySelector('[data-line-field=unitCost]').value) || 0); }); m.body.querySelector('.delivery-total').textContent = 'Delivery purchase cost: ' + V.money(sum); }
    function add() {
      if (host.children.length >= 50) return;
      var row = document.createElement('div'); row.className = 'delivery-line'; row.setAttribute('data-delivery-line', '');
      row.innerHTML = '<label class="field"><span>Item</span>' + U.select('lineProduct', products).replace('name="lineProduct"', 'data-line-field="productId"') + '</label>' +
        ['qty', 'unitCost', 'lot', 'expiry'].map(function (key) { var label = { qty: 'Quantity', unitCost: 'Unit cost', lot: 'Batch reference', expiry: 'Expiry' }[key]; return '<label class="field"><span>' + label + '</span><input class="input" data-line-field="' + key + '" type="' + (key === 'expiry' ? 'date' : key === 'lot' ? 'text' : 'number') + '"' + (key === 'qty' ? ' min="1" step="1"' : key === 'unitCost' ? ' min="0" step="0.01"' : key === 'lot' ? ' maxlength="60"' : '') + '></label>'; }).join('') + '<button type="button" class="icon-btn" data-remove-line aria-label="Remove delivery line">×</button>';
      row.querySelector('[data-remove-line]').addEventListener('click', function () { if (host.children.length > 1) row.remove(); total(); }); host.appendChild(row); total();
    }
    m.body.querySelector('#delivery-add-line').addEventListener('click', add); host.addEventListener('input', total); add();
  };
  U.loss = function (done) {
    var batches = V.db.batches.filter(function (b) { return b.qty > 0; }).map(function (b) { var p = V.findProduct(b.productId); return { value: b.id, label: p.name + ' / ' + (b.lot || b.id) + ' — ' + b.qty + ' units' }; });
    U.form('Record stock loss', U.field('Batch', 'batchId', U.select('batchId', batches)) + '<div class="form-grid">' + U.field('Quantity lost', 'qty', U.input('qty', '', 'number', 'min="1" step="1"')) + U.field('Reason', 'reason', U.select('reason', ['Damaged', 'Expired', 'Missing'])) + U.field('Loss date', 'date', U.input('date', V.today(), 'date', 'max="' + V.today() + '"')) + '</div>' + U.field('Explanation', 'notes', '<textarea class="textarea" name="notes" maxlength="200"></textarea>'), function (d) { return V.recordStockLoss(d); }, V.can('inventory.direct') ? 'Confirm loss' : 'Send for approval', done);
  };
  U.reversal = function (sale, done) {
    U.form('Reverse entire sale ' + sale.no, '<p class="note">Total refund: ' + V.money(sale.total) + '. The original sale remains in history.</p>' + U.field('Reason for reversal', 'reason', '<textarea class="textarea" name="reason" maxlength="200"></textarea>'), function (d) { return V.requestSaleReversal(sale.id, d.reason); }, V.can('inventory.review') ? 'Continue to confirmation' : 'Request reversal', function (r) { if (V.can('inventory.review')) U.reviewRequest(r.request, done); else if (done) done(); });
  };
  U.reviewRequest = function (r, done) {
    var details = '<p class="caption">Submitted by ' + E(V.userName(r.by)) + ' · ' + V.fmtDate(r.at.slice(0, 10)) + '</p>', extra = '';
    if (r.kind === 'receiving') details += '<p><b>' + E(r.payload.supplier) + '</b> · ' + E(r.payload.reference) + ' · ' + V.fmtDate(r.payload.date) + '</p><ul class="receipt-list">' + r.payload.lines.map(function (l) { return '<li><span>' + E(V.findProduct(l.productId).name) + ' · ' + l.qty + ' units · ' + E(l.lot) + (l.expiry ? ' · ' + V.fmtDate(l.expiry) : '') + '</span><span>' + V.money(Number(l.unitCost) * Number(l.qty)) + '</span></li>'; }).join('') + '</ul>';
    else if (r.kind === 'pet_edit') details += '<dl class="detail-list">' + ['name', 'species', 'breed', 'sex', 'birth', 'ownerName', 'ownerPhone'].map(function (key) { return '<div><dt>' + E({ name: 'Pet name', species: 'Species', breed: 'Breed', sex: 'Sex', birth: 'Birth date', ownerName: 'Owner name', ownerPhone: 'Owner phone' }[key]) + '</dt><dd>' + E(r.before[key]) + ' → ' + E(r.payload[key]) + '</dd></div>'; }).join('') + '</dl>';
    else if (r.kind === 'loss') details += '<p>' + r.payload.qty + ' units · ' + E(r.payload.reason) + '</p><p>' + E(r.payload.notes) + '</p>';
    else if (r.kind === 'reversal') {
      var sale = V.db.sales.filter(function (s) { return s.id === r.payload.saleId; })[0];
      details += '<p><b>' + E(sale.no) + '</b> · Full refund ' + V.money(sale.total) + '</p><p>' + E(r.payload.reason) + '</p>';
      extra = '<p class="note">Return stock only for items physically returned unopened, unexpired and with verified storage conditions. Leave quantities at zero for services or unusable returns.</p><div class="return-lines">' + sale.items.filter(function (l) { return l.kind !== 'service'; }).map(function (l) { var index = sale.items.indexOf(l), trace = !!(l.allocations && l.allocations.length); return '<div data-return-line="' + index + '"><label class="field"><span>' + E(l.name) + ' (sold ' + l.qty + ')</span><input class="input" type="number" data-return-qty min="0" max="' + l.qty + '" step="1" value="0"' + (trace ? '' : ' disabled') + '></label>' + (trace ? '<label class="radio"><input type="checkbox" data-return-usable> Returned and usable</label>' : '<small class="hint">Stock return is unavailable for this older sale. Record a verified return separately.</small>') + '</div>'; }).join('') + '</div>' + U.field('Refund method', 'refundMethod', U.select('refundMethod', V.PAYMENT_METHODS, sale.method)) + '<label class="radio"><input type="checkbox" name="refundConfirmed"> The full refund has been recorded</label>';
    }
    var m = V.modal('Review ' + r.summary, '<form id="workflow-review" novalidate>' + details + extra + U.field('Review note (required for rejection)', 'note', '<textarea class="textarea" name="note" maxlength="200"></textarea>') + '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn btn-danger" data-wf-choice="reject">Reject</button><button type="button" class="btn" data-wf-choice="approve">' + (r.kind === 'reversal' ? 'Confirm reversal' : 'Approve') + '</button></div></form>', { wide: true });
    var form = m.body.querySelector('form'), busy = false; form.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.querySelectorAll('[data-wf-choice]').forEach(function (button) { button.addEventListener('click', function () {
      if (busy) return; busy = true;
      var decision = r.kind === 'reversal' ? { refundConfirmed: form.elements.refundConfirmed.checked, refundMethod: form.elements.refundMethod.value, returns: Array.from(form.querySelectorAll('[data-return-line]')).map(function (row) { return { lineIndex: Number(row.dataset.returnLine), qty: row.querySelector('[data-return-qty]').value, usableConfirmed: !!row.querySelector('[data-return-usable]') && row.querySelector('[data-return-usable]').checked }; }) } : null;
      var result = V.reviewWorkflow(r.id, button.dataset.wfChoice, form.elements.note.value, decision);
      if (!result.ok) { busy = false; V.showFormError(form, result.error); return; } m.close(); V.toast('Decision saved.'); V.refreshNavBadges(); V.refreshBell(); if (done) done();
    }); });
  };
})();
