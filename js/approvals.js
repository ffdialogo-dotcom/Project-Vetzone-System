/* Approvals.
   Admin: review staff inventory changes and pet medical history entries, approve or reject each one, and see the audit trail.
   Staff: "My submissions" shows the status of everything they sent (pending, approved, or rejected). */
(function () {
  'use strict';
  var isAdmin = VZ.can('inventory.review');
  var ctx = VZ.init('approvals', {
    title: isAdmin ? 'Approvals' : 'My submissions',
    subtitle: isAdmin ? 'Review changes from staff before they become official records.' : 'See whether the admin has approved what you sent.',
    icon: 'check'
  });
  if (!ctx) return;
  var main = ctx.main;
  var operationPage = 1;
  var tab = isAdmin ? 'inventory' : 'all';

  var STATUS = {
    pending: { text: 'Pending Admin Approval', cls: 'chip-amber' },
    approved: { text: 'Approved', cls: 'chip-green' },
    rejected: { text: 'Rejected', cls: 'chip-red' }
  };
  function chip(status) { var s = STATUS[status] || STATUS.pending; return '<span class="chip ' + s.cls + '">' + s.text + '</span>'; }
  function when(ts) { return ts ? VZ.fmtDate(ts) + ', ' + VZ.fmtTime(ts) : ''; }
  var KIND = { vaccination: 'Vaccination', medical: 'Sick or injured visit', checkup: 'Routine checkup', release: 'Pet release home', missed_checkup: 'Missed checkup' };

  // One shape for both kinds of submission, so they can share a table.
  function fromRequest(r) {
    return { kind: 'Inventory', id: r.id, source: 'inventory', at: r.at, by: r.by, summary: VZ.requestSummary(r), detail: r.reason ? 'Reason: ' + r.reason : '', status: r.status,
      reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, note: r.note, href: 'inventory.html' };
  }
  function fromRecord(r) {
    var pet = VZ.findPet(r.petId);
    return { kind: 'Medical history', id: r.id, source: 'medical', at: r.ts || r.date + 'T00:00:00', by: r.by, summary: (pet ? pet.name : 'Unknown pet') + ': ' + r.title + ' (' + KIND[r.type] + ')',
      detail: 'Entry date: ' + VZ.fmtDate(r.date), status: r.status, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, note: r.reviewNote, href: 'pet.html?id=' + encodeURIComponent(r.petId) };
  }
  function fromDeath(r) {
    var pet = VZ.findPet(r.petId);
    return { kind: 'Deceased status', id: r.id, source: 'death', at: r.at, by: r.by,
      summary: (pet ? pet.name : 'Unknown pet') + ': deceased status request', detail: 'Date: ' + VZ.fmtDate(r.date) + '; location: ' + r.location,
      status: r.status, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, note: r.note, href: 'pet.html?id=' + encodeURIComponent(r.petId) };
  }
  function allSubmissions() {
    var list = VZ.inventoryRequests().map(fromRequest);
    VZ.workflowRequests().forEach(function (r) { list.push({ kind: { receiving: 'Supplier delivery', pet_edit: 'Pet details', reversal: 'Sale reversal', loss: 'Stock loss' }[r.kind], id: r.id, source: 'workflow', at: r.at, by: r.by, summary: r.summary, detail: r.payload.reason || '', status: r.status, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, note: r.note, href: 'approvals.html' }); });
    VZ.petDeathRequests().forEach(function (r) { list.push(fromDeath(r)); });
    var seen = {};
    VZ.recordsByStatus('pending').concat(VZ.reviewedRecords()).forEach(function (r) { if (!seen[r.id]) { seen[r.id] = 1; list.push(fromRecord(r)); } });
    return list.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  }

  /* ---------------- staff: My submissions ---------------- */
  function renderStaff() {
    var all = allSubmissions();
    var counts = { pending: 0, approved: 0, rejected: 0 };
    all.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
    var shown = tab === 'all' ? all : all.filter(function (x) { return x.status === tab; });
    var tabs = [['all', 'All (' + all.length + ')'], ['pending', 'Pending (' + counts.pending + ')'], ['approved', 'Approved (' + counts.approved + ')'], ['rejected', 'Rejected (' + counts.rejected + ')']].map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
    }).join('');
    document.getElementById('approvals-account-alert').hidden = true;
    document.getElementById('approvals-staff-help').hidden = false;
    document.getElementById('approvals-tabs').innerHTML = tabs;
    document.getElementById('approvals-body').innerHTML = shown.length ?
      '<div class="table-wrap"><table class="table" style="min-width:720px"><caption class="sr-only">My submissions</caption><thead><tr><th scope="col">Sent</th><th scope="col">Type</th><th scope="col">What you sent</th><th scope="col">Status</th><th scope="col">Decision</th></tr></thead><tbody>' +
        shown.map(function (x) {
          var decision = x.status === 'pending' ? '<span class="caption">Waiting for an admin</span>' :
            VZ.esc(VZ.userName(x.reviewedBy)) + '<br><small>' + when(x.reviewedAt) + '</small>' + (x.note ? '<br><small>Note: ' + VZ.esc(x.note) + '</small>' : '');
          var fix = x.status === 'rejected' && x.source === 'medical' ? '<br><a href="' + x.href + '">Open the pet to fix and send again</a>' : '';
          return '<tr><td class="nowrap">' + when(x.at) + '</td><td>' + x.kind + '</td><td><b>' + VZ.esc(x.summary) + '</b>' + (x.detail ? '<br><small>' + VZ.esc(x.detail) + '</small>' : '') + fix + '</td><td>' + chip(x.status) + '</td><td>' + decision + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nothing to show here yet.</p>';
    main.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); renderStaff(); }); });
  }

  /* ---------------- admin: review queue ---------------- */
  function reviewForm() {
    return '<form id="review-form" novalidate>' + VZ.field('Note (needed when rejecting)', 'note', '<textarea class="textarea" name="note" maxlength="200" style="min-height:64px"></textarea>', 'The person who sent it will see this note.') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn btn-danger" data-decide="reject">Reject</button><button type="button" class="btn" data-decide="approve">Approve</button></div></form>';
  }
  function openReview(title, detailHTML, decide) {
    var m = VZ.modal(title, detailHTML + reviewForm(), { wide: true });
    var form = m.body.querySelector('#review-form'), busy = false;
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.querySelectorAll('[data-decide]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (busy) return;                       // one decision per request
        busy = true;
        var r = decide(b.getAttribute('data-decide'), form.elements.note.value);
        if (!r.ok) { busy = false; VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
        m.close();
        VZ.toast(b.getAttribute('data-decide') === 'approve' ? 'Approved and applied.' : 'Rejected. Nothing was changed.');
        render(); VZ.refreshNavBadges();
      });
    });
  }
  function dl(rows) { return '<dl class="detail-list">' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl>'; }

  function reviewInventory(rq) {
    var lines = VZ.requestChanges(rq);
    var change = lines.map(function (l) {
      return '<div><dt>' + VZ.esc(l.label) + '</dt><dd>' + (l.from !== undefined ? VZ.esc(l.from) + ' <span class="arrow-to">to</span> ' : '') + '<b>' + VZ.esc(l.to) + '</b></dd></div>';
    }).join('');
    var by = VZ.userName(rq.by);
    openReview('Review inventory change',
      dl([['Type', VZ.REQUEST_TYPES[rq.type]], ['Item', VZ.esc(rq.productName)], ['Submitted by', VZ.esc(by) + ' (' + VZ.esc(rq.by) + ')'], ['Submitted', when(rq.at)], ['Reason', rq.reason ? VZ.esc(rq.reason) : 'Not given']]) +
      '<h3 style="font-size:.95rem;margin:6px 0 0">Proposed change <span class="chip chip-amber">Not applied yet</span></h3><dl class="detail-list">' + change + '</dl>',
      function (decision, note) { return VZ.reviewInventory(rq.id, decision, note); });
  }
  function reviewRecord(rec) {
    var pet = VZ.findPet(rec.petId) || { name: 'Unknown pet', species: '', breed: '', ownerId: '' }, owner = VZ.findOwner(pet.ownerId);
    var rows = [['Pet', '<a href="pet.html?id=' + encodeURIComponent(rec.petId) + '">' + VZ.esc(pet.name) + '</a> (' + VZ.esc(pet.species) + ', ' + VZ.esc(pet.breed) + ')'], ['Owner', VZ.esc(owner.name)],
      ['Entry type', KIND[rec.type]], [rec.type === 'vaccination' ? 'Date given' : rec.type === 'release' ? 'Release date' : rec.type === 'missed_checkup' ? 'Scheduled checkup date' : 'Visit date', VZ.fmtDate(rec.date)], [rec.type === 'vaccination' ? 'Vaccine' : rec.type === 'release' ? 'Action' : rec.type === 'missed_checkup' ? 'Attendance record' : 'Reason for visit', VZ.esc(rec.title)]];
    if (rec.type === 'release') rows.push(['Received by', VZ.esc(rec.receivedBy)], ['Home-care notes', VZ.esc(rec.notes || 'None')]);
    else if (rec.type === 'missed_checkup') rows.push(['Attendance', 'Owner did not attend; no completed visit.'], ['Notes', VZ.esc(rec.notes || 'None')]);
    else if (rec.type === 'vaccination') rows.push(['Notes', rec.notes ? VZ.esc(rec.notes) : 'None']);
    else rows.push(['What happened', VZ.esc(rec.happened || '')], ['Examination or procedures', VZ.esc(rec.exam || '')], ['Treatments or medications', VZ.esc(rec.treatment || '')], ['Result or outcome', VZ.esc(rec.outcome || '')]);
    rows.push([rec.type === 'missed_checkup' ? 'Rescheduled checkup' : rec.type === 'checkup' ? 'Next checkup' : rec.type === 'vaccination' ? 'Next due' : 'Follow-up', rec.nextDue ? VZ.fmtDate(rec.nextDue) : 'None'], ['Submitted by', VZ.esc(VZ.userName(rec.by)) + ' (' + VZ.esc(rec.by) + ')'], ['Submitted', when(rec.ts)]);
    openReview('Review medical history entry', dl(rows), function (decision, note) { return VZ.reviewRecord(rec.id, decision, note); });
  }

  function renderAdmin() {
    var inv = VZ.inventoryRequests('pending'), med = VZ.recordsByStatus('pending'), deaths = VZ.petDeathRequests('pending'), accounts = VZ.pendingCount();
    var reviewed = VZ.inventoryRequests().filter(function (r) { return r.status !== 'pending'; }).map(fromRequest).concat(VZ.reviewedRecords().map(fromRecord)).concat(VZ.petDeathRequests().filter(function (r) { return r.status !== 'pending'; }).map(fromDeath))
      .sort(function (a, b) { return a.reviewedAt < b.reviewedAt ? 1 : -1; }).slice(0, 40);
    var operations = VZ.workflowRequests().filter(function (r) { return r.status === 'pending'; });
    reviewed = reviewed.concat(VZ.workflowRequests().filter(function (r) { return r.status !== 'pending'; }).map(function (r) { return { kind: 'Operation', summary: r.summary, status: r.status, by: r.by, reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, note: r.note }; })).sort(function (a, b) { return b.reviewedAt.localeCompare(a.reviewedAt); }).slice(0, 40);
    var tabs = [['operations', 'Other requests (' + operations.length + ')'], ['inventory', 'Inventory changes (' + inv.length + ')'], ['medical', 'Medical history (' + med.length + ')'], ['death', 'Deceased requests (' + deaths.length + ')'], ['reviewed', 'Reviewed'], ['audit', 'Audit trail']].map(function (t) {
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
    }).join('');
    var body;
    if (tab === 'operations') {
      body = VZ.ui.table(operations, ['Submitted', 'By', 'Request', 'Action'], function (r) { return '<tr><td>' + when(r.at) + '</td><td>' + VZ.esc(VZ.userName(r.by)) + '</td><td>' + VZ.esc(r.summary) + '</td><td><button type="button" class="btn btn-sm" data-review-operation="' + r.id + '">Review</button></td></tr>'; }, operationPage);
    } else if (tab === 'inventory') {
      body = inv.length ? '<div class="table-wrap"><table class="table" style="min-width:720px"><caption class="sr-only">Inventory changes waiting for review</caption><thead><tr><th scope="col">Submitted</th><th scope="col">Submitted by</th><th scope="col">Item and requested change</th><th scope="col">Reason</th><th scope="col"><span class="sr-only">Review</span></th></tr></thead><tbody>' +
        inv.map(function (r) {
          return '<tr><td class="nowrap">' + when(r.at) + '</td><td>' + VZ.esc(VZ.userName(r.by)) + '</td><td><b>' + VZ.esc(VZ.requestSummary(r)) + '</b><br><small>' + VZ.REQUEST_TYPES[r.type] + '</small></td><td>' + (r.reason ? VZ.esc(r.reason) : '<span class="caption">Not given</span>') + '</td>' +
            '<td><button type="button" class="btn btn-sm" data-review-inv="' + r.id + '">Review</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No inventory changes are waiting. Everything has been reviewed.</p>';
    } else if (tab === 'medical') {
      body = med.length ? '<div class="table-wrap"><table class="table" style="min-width:720px"><caption class="sr-only">Medical history entries waiting for review</caption><thead><tr><th scope="col">Submitted</th><th scope="col">Submitted by</th><th scope="col">Pet and entry</th><th scope="col">Type</th><th scope="col"><span class="sr-only">Review</span></th></tr></thead><tbody>' +
        med.map(function (r) {
          var pet = VZ.findPet(r.petId) || { name: 'Unknown pet', ownerId: '' };
          return '<tr><td class="nowrap">' + when(r.ts) + '</td><td>' + VZ.esc(VZ.userName(r.by)) + '</td><td><b>' + VZ.esc(pet.name) + '</b> (owner: ' + VZ.esc(VZ.findOwner(pet.ownerId).name) + ')<br><small>' + VZ.esc(r.title) + ', ' + VZ.fmtDate(r.date) + '</small></td><td>' + KIND[r.type] + '</td>' +
            '<td><button type="button" class="btn btn-sm" data-review-rec="' + r.id + '">Review</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">No medical history entries are waiting.</p>';
    } else if (tab === 'death') {
      body = deaths.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Submitted</th><th>Staff</th><th>Pet</th><th>Date of death</th><th>Location</th><th>Action</th></tr></thead><tbody>' +
        deaths.map(function (r) { var pet = VZ.findPet(r.petId); return '<tr><td>' + when(r.at) + '</td><td>' + VZ.esc(VZ.userName(r.by)) + '</td><td>' + VZ.esc(pet ? pet.name : 'Unknown pet') + '</td><td>' + VZ.fmtDate(r.date) + '</td><td>' + VZ.esc(r.location) + '</td><td><button type="button" class="btn btn-sm" data-review-death="' + r.id + '">Review</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">No deceased status requests are pending.</p>';
    } else if (tab === 'reviewed') {
      body = reviewed.length ? '<div class="table-wrap"><table class="table" style="min-width:720px"><caption class="sr-only">Reviewed submissions</caption><thead><tr><th scope="col">Reviewed</th><th scope="col">Type</th><th scope="col">What</th><th scope="col">Status</th><th scope="col">Submitted by</th><th scope="col">Reviewed by</th></tr></thead><tbody>' +
        reviewed.map(function (x) {
          return '<tr><td class="nowrap">' + when(x.reviewedAt) + '</td><td>' + x.kind + '</td><td><b>' + VZ.esc(x.summary) + '</b>' + (x.note ? '<br><small>Note: ' + VZ.esc(x.note) + '</small>' : '') + '</td><td>' + chip(x.status) + '</td><td>' + VZ.esc(VZ.userName(x.by)) + '</td><td>' + VZ.esc(VZ.userName(x.reviewedBy)) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="empty">Nothing has been reviewed yet.</p>';
    } else {
      var trail = VZ.auditTrail(60);
      body = trail.length ? '<ul class="audit-list">' + trail.map(function (a) {
        return '<li><time>' + when(a.ts) + '</time><div><b>' + VZ.esc(VZ.AUDIT_LABELS[a.action] || a.action) + '</b>: ' + VZ.esc(a.target) + '<br><small>By ' + VZ.esc(VZ.userName(a.by)) + (a.details ? '. ' + VZ.esc(a.details) : '') + '</small></div></li>';
      }).join('') + '</ul>' : '<p class="empty">No activity has been recorded yet.</p>';
    }
    document.getElementById('approvals-staff-help').hidden = true;
    document.getElementById('approvals-account-alert').hidden = !accounts;
    document.getElementById('approvals-account-count').innerHTML = '<b>' + accounts + '</b> account request' + (accounts === 1 ? ' is' : 's are') + ' also waiting for approval.';
    document.getElementById('approvals-tabs').innerHTML = tabs;
    document.getElementById('approvals-body').innerHTML = body;
    main.querySelectorAll('[data-tab]').forEach(function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); renderAdmin(); }); });
    main.querySelectorAll('[data-review-operation]').forEach(function (b) { b.addEventListener('click', function () { var r = VZ.workflowRequests().filter(function (r) { return r.id === b.dataset.reviewOperation; })[0]; VZ.ui.reviewRequest(r, render); }); });
    main.querySelectorAll('[data-page]').forEach(function (b) { b.addEventListener('click', function () { operationPage = Number(b.dataset.page); render(); }); });
    main.querySelectorAll('[data-review-inv]').forEach(function (b) {
      b.addEventListener('click', function () { var rq = VZ.db.requests.filter(function (r) { return r.id === b.getAttribute('data-review-inv'); })[0]; if (rq) reviewInventory(rq); });
    });
    main.querySelectorAll('[data-review-death]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = VZ.petDeathRequests('pending').filter(function (x) { return x.id === b.getAttribute('data-review-death'); })[0];
        if (!r) return;
        var pet = VZ.findPet(r.petId);
        openReview('Review deceased status request', dl([
          ['Pet', VZ.esc(pet ? pet.name : 'Unknown pet')], ['Submitted by', VZ.esc(VZ.userName(r.by))],
          ['Date of death', VZ.fmtDate(r.date)], ['Location', VZ.esc(r.location)], ['Notes', VZ.esc(r.notes || 'None')],
          ['Current status', VZ.esc(pet ? pet.status : 'Unknown')]
        ]), function (decision, note) { return VZ.reviewPetDeath(r.id, decision, note); });
      });
    });
    main.querySelectorAll('[data-review-rec]').forEach(function (b) {
      b.addEventListener('click', function () { var rec = VZ.db.records.filter(function (r) { return r.id === b.getAttribute('data-review-rec'); })[0]; if (rec) reviewRecord(rec); });
    });
  }

  function render() { if (isAdmin) renderAdmin(); else renderStaff(); }
  render();
})();
