/* Pet profile: details, finalized visit and vaccination history, entries waiting for approval.
   Only approved entries are finalized history. Staff entries start as Pending Admin Approval.
   Only an admin can edit an approved entry or delete any entry. */
(function () {
  'use strict';
  var ctx = VZ.init('pets', { title: 'Pet profile', subtitle: 'Owner details, vaccinations, and visit history.', icon: 'paw' });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;
  var id = new URLSearchParams(location.search).get('id');
  var pet = id ? VZ.findPet(id) : null;
  if (!pet) {
    main.innerHTML = '<div class="card empty">This pet could not be found. <a href="pets.html">Go back to pet records</a>.</div>';
    return;
  }
  document.title = pet.name + ' | VetZone VetCare System';
  var field = VZ.field, isAdmin = VZ.can('medical.delete');
  var SENT = 'Sent to the admin for approval. It will appear in the medical history once approved.';
  function sexText(s) { return s === 'F' ? 'Female' : 'Male'; }
  function dueChip(nextDue) {
    var d = VZ.diffDays(VZ.today(), nextDue);
    return d < 0 ? ' <span class="chip chip-red">Overdue</span>' : d <= VZ.DUE_DAYS ? ' <span class="chip chip-amber">Due soon</span>' : '';
  }
  function dd(v) { return v ? VZ.esc(v) : '<span class="caption">Not recorded</span>'; }
  function statusChip(r) {
    return r.status === 'rejected' ? '<span class="chip chip-red">Rejected</span>' : '<span class="chip chip-amber">Pending Admin Approval</span>';
  }
  function trail(r) {
    var parts = ['Submitted by ' + VZ.esc(VZ.userName(r.by))];
    if (r.status === 'approved' && r.auto) parts = ['Entered by ' + VZ.esc(VZ.userName(r.by))];
    else if (r.status === 'approved' && r.reviewedBy) parts.push('Approved by ' + VZ.esc(VZ.userName(r.reviewedBy)) + (r.reviewedAt ? ' on ' + VZ.fmtDate(r.reviewedAt) : ''));
    else if (r.status === 'rejected') parts.push('Rejected by ' + VZ.esc(VZ.userName(r.reviewedBy)) + (r.reviewedAt ? ' on ' + VZ.fmtDate(r.reviewedAt) : ''));
    if (r.updated) parts.push('Edited ' + VZ.fmtDate(r.updated) + ' by ' + VZ.esc(VZ.userName(r.updatedBy)));
    return parts.map(function (x) { return '<span>' + x + '</span>'; }).join('');
  }
  function actions(r) {
    var b = '';
    if (VZ.canEditRecord(r) && r.type !== 'vaccination' && r.type !== 'missed_vaccination') b += '<button type="button" class="btn btn-ghost btn-sm" data-edit="' + r.id + '" aria-label="Edit visit ' + VZ.esc(r.title) + '">' + VZ.icon('edit', 14) + ' Edit</button>';
    if (isAdmin) b += '<button type="button" class="btn btn-ghost btn-sm" data-del="' + r.id + '" aria-label="Delete entry ' + VZ.esc(r.title) + '">' + VZ.icon('trash', 14) + ' Delete</button>';
    return b;
  }

  function vaccinationTable(recs, withStatus) {
    if (!recs.length) return '<p class="empty">No vaccinations recorded yet.</p>';
    return '<div class="table-wrap"><table class="table" style="min-width:520px"><thead><tr><th scope="col">Date</th><th scope="col">Vaccine</th><th scope="col">Notes</th><th scope="col">Next due</th>' + (withStatus ? '<th scope="col">Status</th>' : '') + '<th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      recs.map(function (r) {
        return '<tr><td style="white-space:nowrap">' + VZ.fmtDate(r.date) + '</td><td><b>' + VZ.esc(r.title) + '</b></td><td>' + (r.notes ? VZ.esc(r.notes) : '-') + '</td>' +
          '<td>' + (r.nextDue ? VZ.fmtDate(r.nextDue) + (withStatus ? '' : dueChip(r.nextDue)) : '-') + '</td>' + (withStatus ? '<td>' + statusChip(r) + (r.reviewNote ? '<br><small>Note: ' + VZ.esc(r.reviewNote) + '</small>' : '') + '</td>' : '') +
          '<td>' + actions(r) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // Older records may only have a title and notes, so fall back to those.
  function visitCard(r, pending) {
    if (r.type === 'release' || r.type === 'missed_checkup' || r.type === 'missed_vaccination') {
      var release = r.type === 'release';
      return '<article class="visit"><div class="visit-head"><div><h3>' + VZ.esc(r.title) + '</h3><small>' + VZ.fmtDate(r.date) + '</small></div>' +
        '<span class="chips"><span class="chip ' + (release ? 'chip-green' : 'chip-red') + '">' + (release ? 'Release home' : 'Did not attend') + '</span>' + (pending ? statusChip(r) : '') + actions(r) + '</span></div>' +
        '<dl>' + (release ? '<div><dt>Received by</dt><dd>' + dd(r.receivedBy) + '</dd></div>' : '<div><dt>Attendance</dt><dd>Owner did not bring the pet to the clinic. No examination or treatment took place.</dd></div>') +
        '<div><dt>' + (release ? 'Home-care notes' : 'Notes') + '</dt><dd>' + dd(r.notes) + '</dd></div>' +
        (r.nextDue ? '<div><dt>' + (r.type === 'missed_vaccination' ? 'Rescheduled vaccination appointment (dose still due)' : 'Rescheduled checkup') + '</dt><dd>' + VZ.fmtDate(r.nextDue) + '</dd></div>' : '') +
        (r.reviewNote && r.status === 'rejected' ? '<div><dt>Admin note</dt><dd>' + VZ.esc(r.reviewNote) + '</dd></div>' : '') + '</dl><div class="foot">' + trail(r) + '</div></article>';
    }
    var appointment = r.type === 'checkup' ? VZ.checkupAppointment(pet.id) : null;
    var attendanceRecorded = !!(appointment && appointment.recordId === r.id && (appointment.missed || appointment.date !== r.nextDue));
    var nextLabel = r.type === 'checkup' ? (attendanceRecorded ? 'Originally scheduled checkup' : 'Next checkup') : 'Follow-up';
    return '<article class="visit"><div class="visit-head"><div><h3>' + VZ.esc(r.title) + '</h3><small>' + VZ.fmtDate(r.date) + '</small></div>' +
      '<span class="chips"><span class="chip ' + (r.type === 'checkup' ? 'chip-green' : 'chip-blue') + '">' + (r.type === 'checkup' ? 'Routine checkup' : 'Sick or injured') + '</span>' + (pending ? statusChip(r) : '') + actions(r) + '</span></div>' +
      '<dl><div><dt>What happened</dt><dd>' + dd(r.happened || r.notes) + '</dd></div>' +
      '<div><dt>Examination or procedures performed</dt><dd>' + dd(r.exam) + '</dd></div>' +
      '<div><dt>Treatments or medications given</dt><dd>' + dd(r.treatment) + '</dd></div>' +
      '<div><dt>Result or outcome</dt><dd>' + dd(r.outcome) + '</dd></div>' +
      (r.nextDue ? '<div><dt>' + nextLabel + '</dt><dd>' + VZ.fmtDate(r.nextDue) + (r.type === 'checkup' && !pending && !attendanceRecorded ? dueChip(r.nextDue) : '') + '</dd></div>' : '') +
      (r.reviewNote && r.status === 'rejected' ? '<div><dt>Admin note</dt><dd>' + VZ.esc(r.reviewNote) + '</dd></div>' : '') + '</dl>' +
      '<div class="foot">' + trail(r) + '</div></article>';
  }

  function render() {
    var st = VZ.petState(pet), owner = VZ.findOwner(pet.ownerId), cat = pet.species === 'Cat';
    var recs = VZ.petRecords(pet.id);
    var vax = recs.filter(function (r) { return r.type === 'vaccination'; });
    var missedVax = recs.filter(function (r) { return r.type === 'missed_vaccination'; });
    var visits = recs.filter(function (r) { return r.type !== 'vaccination' && r.type !== 'missed_vaccination'; });
    var subs = VZ.petSubmissions(pet.id);
    var subVax = subs.filter(function (r) { return r.type === 'vaccination'; }), subVisits = subs.filter(function (r) { return r.type !== 'vaccination'; });
    var last = VZ.lastVisit(pet.id);
    var dueNote = '';
    if (st.dueItems.length) {
      dueNote = '<div class="due-note"><b>Needs attention</b><br>' + st.dueItems.map(function (d) {
        return VZ.esc(d.title) + ': ' + (d.days < 0 ? 'overdue since ' : 'due ') + VZ.fmtDate(d.due);
      }).join('<br>') + '</div>';
    }
    var waiting = '';
    if (subs.length) {
      waiting = '<section class="card submissions-card" aria-label="Waiting for approval"><div class="card-head"><h2>' + (isAdmin ? 'Entries waiting for review' : 'Your entries waiting for approval') + ' <span class="chip chip-amber">Not finalized</span></h2>' +
        '<a class="btn btn-sm btn-ghost" href="approvals.html">' + (isAdmin ? 'Open approvals' : 'My submissions') + '</a></div>' +
        '<p class="caption" style="margin:0 0 10px">These are not part of the medical history until an admin approves them.</p>' +
        (subVisits.length ? '<div class="visit-list">' + subVisits.map(function (r) { return visitCard(r, true); }).join('') + '</div>' : '') +
        (subVax.length ? '<div style="margin-top:12px">' + vaccinationTable(subVax, true) + '</div>' : '') + '</section>';
    }
    document.getElementById('pet-avatar').className = 'big' + (cat ? ' cat' : '');
    document.getElementById('pet-avatar').textContent = cat ? '🐈' : '🐕';
    document.getElementById('pet-name').textContent = pet.name;
    document.getElementById('pet-state').innerHTML = '<span class="chip ' + st.cls + '">' + st.label + '</span>';
    document.getElementById('pet-facts').innerHTML =
      '<div><dt>Species</dt><dd>' + VZ.esc(pet.species) + '</dd></div><div><dt>Breed</dt><dd>' + VZ.esc(pet.breed) + '</dd></div>' +
      '<div><dt>Sex</dt><dd>' + sexText(pet.sex) + '</dd></div><div><dt>Age</dt><dd>' + VZ.ageText(pet.birth) + '</dd></div><div><dt>Birth date</dt><dd>' + VZ.fmtDate(pet.birth) + '</dd></div>' +
      '<div><dt>Owner</dt><dd>' + VZ.esc(owner.name) + '</dd></div><div><dt>Owner phone</dt><dd>' + VZ.esc(owner.phone) + '</dd></div>' +
      '<div><dt>Visits recorded</dt><dd>' + VZ.visitCount(pet.id) + '</dd></div><div><dt>Last visit</dt><dd>' + (last ? VZ.fmtDate(last) : 'None yet') + '</dd></div>';
    var stay = VZ.activeStay(pet.id);
    document.getElementById('pet-clinic-status').innerHTML = '<span class="chip chip-blue">' + (stay ? (stay.status === 'awaiting_pickup' ? 'Awaiting pickup' : 'In clinic') : pet.status === 'Deceased' ? 'Deceased' : 'No active clinic stay') + '</span>';
    var latestRelease = recs.filter(function (r) { return r.type === 'release'; })[0];
    document.getElementById('pet-release-details').innerHTML = latestRelease ? '<p class="note"><b>Last release home:</b> ' + VZ.fmtDate(latestRelease.date) + '<br>Received by ' + VZ.esc(latestRelease.receivedBy) + '.</p>' : '';
    document.getElementById('release-pet').textContent = isAdmin ? 'Release pet home' : 'Request pet release';
    document.getElementById('release-pet').hidden = pet.status === 'Deceased';
    document.getElementById('missed-checkup').hidden = pet.status === 'Deceased';
    var scheduled = VZ.checkupAppointment(pet.id);
    document.getElementById('missed-checkup').disabled = !!(scheduled && !scheduled.missed && scheduled.date > VZ.today());
    document.getElementById('missed-checkup').title = scheduled && scheduled.date > VZ.today() ? 'This scheduled checkup has not occurred yet.' : '';
    document.getElementById('pet-status').value = pet.status;
    document.getElementById('pet-status').disabled = pet.status === 'Deceased';
    var death = pet.deceased;
    document.getElementById('pet-deceased-details').innerHTML = death ? '<p class="note"><b>Deceased:</b> ' + VZ.fmtDate(death.date) + ' (' + VZ.esc(death.location) + '). Approved by ' + VZ.esc(VZ.userName(death.approvedBy)) + '.</p>' : '';
    var requests = VZ.petDeathRequests().filter(function (r) { return r.petId === pet.id; });
    var pendingDeath = requests.some(function (r) { return r.status === 'pending'; });
    document.getElementById('pet-death-requests').innerHTML = pendingDeath ? '<p class="note">Deceased status request is pending admin approval. The pet status has not changed.</p>' : '';
    document.getElementById('request-deceased').textContent = isAdmin ? 'Mark as deceased' : 'Request deceased status';
    document.getElementById('request-deceased').hidden = pet.status === 'Deceased' || pendingDeath;

    document.getElementById('pet-due-note').innerHTML = dueNote;
    document.getElementById('pet-waiting').innerHTML = waiting;
    document.getElementById('pet-visits').innerHTML = visits.length ? '<div class="visit-list">' + visits.map(function (r) { return visitCard(r, false); }).join('') + '</div>' : '<p class="empty">No approved visits yet. Add a visit record to start this pet\'s medical history.</p>';
    document.getElementById('pet-vaccinations').innerHTML = vaccinationTable(vax, false) + missedVax.map(function (r) { return visitCard(r, false); }).join('');
    document.getElementById('missed-vaccination').disabled = pet.status === 'Deceased';

    main.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = VZ.db.records.filter(function (r) { return r.id === b.getAttribute('data-edit'); })[0];
        VZ.openVisitForm(pet, user, { record: rec, onSaved: saved });
      });
    });
    main.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var rec = VZ.db.records.filter(function (r) { return r.id === b.getAttribute('data-del'); })[0];
        if (!rec) return;
        VZ.confirm('Delete this entry?', 'Delete "' + rec.title + '" (' + VZ.fmtDate(rec.date) + ') from ' + pet.name + '\'s records? Only this entry is removed. ' + pet.name + '\'s profile and other entries stay. This cannot be undone.', 'Delete entry', true).then(function (yes) {
          if (!yes) return;
          var r = VZ.deleteRecord(rec.id);
          if (r.ok) { VZ.toast('The entry was deleted.'); render(); VZ.refreshNavBadges(); } else VZ.toast(r.error || 'The entry could not be deleted.', 'error');
        });
      });
    });
  }
  // Staff entries wait for approval. An admin's entries are final at once.
  function saved(r) {
    VZ.toast(r.pending ? SENT : 'Visit record saved for ' + pet.name + '.');
    render(); VZ.refreshNavBadges();
  }

  function openVaccination() {
    var today = VZ.today();
    var m = VZ.modal('Add vaccination for ' + pet.name,
      '<form id="rec-form" novalidate><p class="note">Use this only after a vaccine dose was given. For an owner who did not attend, use Record missed vaccination.</p>' + (VZ.can('medical.review') ? '' : '<p class="note">This entry will be marked Pending Admin Approval. It becomes part of the medical history only after the admin approves it.</p>') +
      '<input type="hidden" name="type" value="vaccination"><div class="form-grid">' +
      field('Date given', 'date', '<input class="input" name="date" type="date" max="' + today + '" value="' + today + '">') +
      field('Next due date', 'nextDue', '<input class="input" name="nextDue" type="date">', 'Optional. Used for reminders.') +
      '<div style="grid-column:1/-1">' + field('Vaccine', 'title', '<input class="input" name="title" maxlength="80" autocomplete="off" placeholder="Rabies vaccine, 5-in-1 vaccine">', 'Use the same name each time, so the next due date updates correctly.') + '</div>' +
      '<div style="grid-column:1/-1">' + field('Notes', 'notes', '<textarea class="textarea" name="notes" maxlength="500"></textarea>') + '</div>' +
      '</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">Save vaccination</button></div></form>', { wide: true });
    var form = m.body.querySelector('form');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = VZ.addRecord(pet.id, VZ.formData(form));
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      m.close();
      VZ.toast(r.pending ? SENT : 'Vaccination saved for ' + pet.name + '.');
      render(); VZ.refreshNavBadges();
    });
  }

  function openPetEvent(type) {
    var release = type === 'release', owner = VZ.findOwner(pet.ownerId);
    var appointment = release ? null : VZ.checkupAppointment(pet.id);
    var linked = !!(appointment && appointment.date && !appointment.missed);
    var date = linked ? appointment.date : VZ.today();
    var m = VZ.modal(release ? 'Release ' + pet.name + ' home' : 'Record missed checkup for ' + pet.name,
      '<form id="pet-event-form" novalidate><p class="note">' +
      (release ? 'Record who takes the pet home and any home-care instructions. Treatment status and existing history are preserved.' : 'Record that the owner did not attend. This does not count as a completed visit.') +
      (isAdmin ? ' This is finalized when you confirm.' : ' An admin must approve your submission.') + '</p>' +
      (linked ? '<input type="hidden" name="sourceRecordId" value="' + VZ.esc(appointment.recordId) + '">' : '') +
      VZ.field(release ? 'Release date' : 'Scheduled checkup date', 'date', '<input class="input" name="date" type="date" min="' + VZ.esc(pet.birth || '') + '" max="' + VZ.today() + '" value="' + date + '"' + (linked ? ' readonly' : '') + '>') +
      (release ? VZ.field('Person taking the pet home', 'receivedBy', '<input class="input" name="receivedBy" maxlength="80" value="' + VZ.esc(owner.name) + '">') : '') +
      VZ.field(release ? 'Home-care notes (optional)' : 'Notes (optional)', 'notes', '<textarea class="textarea" name="notes" maxlength="500"></textarea>') +
      (linked ? VZ.field('Rescheduled checkup date (optional)', 'nextDue', '<input class="input" name="nextDue" type="date" min="' + VZ.today() + '">', 'Leave empty to keep the missed appointment visible as overdue. A confirmed reschedule updates the reminder.') : '') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + (isAdmin ? (release ? 'Confirm release' : 'Record missed checkup') : 'Send for approval') + '</button></div></form>');
    var form = m.body.querySelector('form'), busy = false;
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (event) {
      event.preventDefault(); if (busy) return; busy = true;
      var result = VZ.addPetEvent(pet.id, type, VZ.formData(form));
      if (!result.ok) { busy = false; VZ.showErrors(form, result.errors || {}); if (result.error) VZ.showFormError(form, result.error); return; }
      m.close(); VZ.toast(result.pending ? 'Sent to admin for approval.' : (release ? 'Pet release recorded.' : 'Missed checkup recorded.'));
      render(); VZ.refreshNavBadges();
    });
  }

  // These controls survive rendering; bind them once to avoid duplicate actions.
  document.getElementById('pet-more-actions').addEventListener('click', function () {
    var m = VZ.modal('Pet actions', '<div class="manage-list"><button class="btn btn-ghost btn-block" data-pet-action="edit">Edit pet and owner details</button>' + (pet.status !== 'Deceased' ? '<button class="btn btn-ghost btn-block" data-pet-action="book">Book appointment</button>' + (!VZ.activeStay(pet.id) ? '<button class="btn btn-ghost btn-block" data-pet-action="admit">Check in to clinic</button>' : '') : '') + '</div>');
    m.body.querySelectorAll('[data-pet-action]').forEach(function (b) { b.addEventListener('click', function () { m.close(); if (b.dataset.petAction === 'edit') VZ.ui.editPet(pet.id, render); else if (b.dataset.petAction === 'book') VZ.ui.bookAppointment(VZ.today(), pet.id, render); else VZ.ui.admit(pet.id, render); }); });
  });
  document.getElementById('release-pet').addEventListener('click', function () { openPetEvent('release'); });
  document.getElementById('missed-vaccination').addEventListener('click', function () {
    var sources = VZ.overdueVaccinations(pet.id);
    if (!sources.length) { VZ.toast('There is no due or overdue vaccination to mark missed.', 'error'); return; }
    var m = VZ.ui.form('Record missed vaccination', '<p class="note">No vaccine dose was given. The original vaccination remains due, even after rescheduling.</p>' + VZ.ui.field('Vaccine / scheduled date', 'sourceRecordId', VZ.ui.select('sourceRecordId', sources.map(function (r) { return { value: r.id, label: r.title + ' — ' + VZ.fmtDate(r.nextDue) }; }))) + VZ.ui.field('Rescheduled appointment (optional)', 'nextDue', VZ.ui.input('nextDue', '', 'date', 'min="' + VZ.today() + '"')) + VZ.ui.field('Notes (optional)', 'notes', '<textarea class="textarea" name="notes" maxlength="500"></textarea>'), function (d) { var source = sources.filter(function (r) { return r.id === d.sourceRecordId; })[0]; d.date = source ? source.nextDue : ''; return VZ.addMissedVaccination(pet.id, d); }, isAdmin ? 'Record missed vaccination' : 'Send for approval', render);
  });
  document.getElementById('missed-checkup').addEventListener('click', function () { openPetEvent('missed_checkup'); });
  document.getElementById('pet-status').addEventListener('change', function (e) {
    var r = VZ.setPetStatus(pet.id, e.target.value);
    VZ.toast(r.ok ? pet.name + ' is now marked as ' + e.target.value + '.' : (r.error || 'This could not be saved.'), r.ok ? '' : 'error');
    render();
  });
  document.getElementById('request-deceased').onclick = function () {
    var m = VZ.modal((isAdmin ? 'Confirm deceased status for ' : 'Request deceased status for ') + pet.name,
      '<form id="death-request-form" novalidate><p class="note">' + (isAdmin ? 'Confirming marks this pet as deceased immediately. Existing records are preserved.' : 'An admin must approve this request. Existing records are preserved.') + '</p>' +
      VZ.field('Date of death', 'date', '<input class="input" type="date" name="date" min="' + VZ.esc(pet.birth || '') + '" max="' + VZ.today() + '" value="' + VZ.today() + '">') +
      VZ.field('Location', 'location', '<select class="select" name="location"><option value="">Select location</option><option>At clinic</option><option>Outside clinic</option><option>Unknown</option></select>') +
      VZ.field('Notes (optional)', 'notes', '<textarea class="textarea" name="notes" maxlength="500"></textarea>', 'Record only confirmed details; do not guess the cause of death.') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button class="btn" type="submit">' + (isAdmin ? 'Confirm deceased status' : 'Send for approval') + '</button></div></form>');
    var form = m.body.querySelector('form');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); var result = VZ.requestPetDeath(pet.id, VZ.formData(form));
      if (!result.ok) { VZ.showErrors(form, result.errors || {}); if (result.error) VZ.showFormError(form, result.error); return; }
      m.close(); VZ.toast(result.pending ? 'Request sent to admin for approval.' : pet.name + ' was marked as deceased.'); render(); VZ.refreshNavBadges();
    });
  };
  document.getElementById('add-rec').addEventListener('click', openVaccination);
  document.getElementById('add-visit').addEventListener('click', function () {
    VZ.openVisitForm(pet, user, { onSaved: saved });
  });

  render();
  if (new URLSearchParams(location.search).get('action') === 'release' && pet.status !== 'Deceased') openPetEvent('release');
})();
