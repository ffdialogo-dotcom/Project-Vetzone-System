(function () {
  'use strict';
  var V = window.VZ, E = V.esc;
  if (!V.init('clinic', { title: 'Clinic', subtitle: 'Appointments, clinic stays, and pet handovers.', icon: 'calendar' })) return;
  var query = new URLSearchParams(location.search), day = V.validDate(query.get('date')) ? query.get('date') : V.today(), month = day.slice(0, 7) + '-01', view = 'appointments', page = 1;
  var head = document.getElementById('clinic-head'), body = document.getElementById('clinic-body');
  function pill(status) { var labels = { scheduled: 'Scheduled', attended: 'Attended', missed: 'Did not attend', cancelled: 'Cancelled', rescheduled: 'Rescheduled', in_clinic: 'In clinic', awaiting_pickup: 'Awaiting pickup' }; return '<span class="chip ' + (status === 'missed' ? 'chip-red' : status === 'attended' || status === 'awaiting_pickup' ? 'chip-green' : status === 'scheduled' ? 'chip-amber' : status === 'in_clinic' ? 'chip-blue' : 'chip-grey') + '">' + E(labels[status] || status) + '</span>'; }
  function render() {
    document.querySelectorAll('[data-clinic-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.clinicTab === view)); });
    if (view === 'appointments') {
      var first = V.parse(month), start = V.addDays(month, -((first.getDay() + 6) % 7));
      head.innerHTML = '<div><h2>' + first.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) + '</h2><small class="caption">Calendar counts show scheduled appointments.</small></div><div class="compact-actions"><button type="button" class="btn btn-ghost btn-sm" data-month="-1" aria-label="Previous month">‹</button><button type="button" class="btn btn-ghost btn-sm" data-month="1" aria-label="Next month">›</button><button type="button" class="btn btn-sm" data-new-appointment>New appointment</button></div>';
      var calendar = '<div class="clinic-calendar">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (label) { return '<div class="calendar-weekday">' + label + '</div>'; }).join('');
      for (var i = 0; i < 42; i++) { var date = V.addDays(start, i), count = V.db.appointments.filter(function (a) { return a.date === date && a.status === 'scheduled'; }).length; calendar += '<button type="button" class="calendar-day' + (date.slice(0, 7) !== month.slice(0, 7) ? ' other-month' : '') + '" data-calendar-date="' + date + '" aria-pressed="' + (date === day) + '" aria-label="' + V.fmtDate(date) + ', ' + count + ' scheduled"><span>' + Number(date.slice(8)) + '</span>' + (count ? '<small>' + count + ' booked</small>' : '<small>&nbsp;</small>') + '</button>'; }
      calendar += '</div><div class="section-title"><h3>' + V.fmtDate(day) + '</h3><span class="caption">Clinic local time</span></div>';
      var appointments = V.db.appointments.filter(function (a) { return a.date === day; }).sort(function (a, b) { return a.time.localeCompare(b.time); });
      body.innerHTML = calendar + V.ui.table(appointments, ['Time', 'Pet / owner', 'Purpose', 'Status', 'Action'], function (a) { var p = V.findPet(a.petId); return '<tr><td>' + E(a.time) + '</td><td><b>' + E(p.name) + '</b><br><small>' + E(V.findOwner(p.ownerId).name) + '</small></td><td>' + E(a.purpose) + '</td><td>' + (a.pendingRecordId ? '<span class="chip chip-amber">Pending review</span>' : pill(a.status)) + '</td><td><button type="button" class="btn btn-ghost btn-sm" data-manage-appointment="' + a.id + '">View</button></td></tr>'; }, page);
    } else if (view === 'board') {
      var stays = V.db.clinicStays.filter(function (s) { return s.status === 'in_clinic' || s.status === 'awaiting_pickup'; });
      head.innerHTML = '<div><h2>Pets in clinic</h2><small class="caption">' + stays.length + ' current stays · location is separate from treatment status</small></div><button type="button" class="btn btn-sm" data-check-in>Check in pet</button>';
      body.innerHTML = V.ui.table(stays, ['Pet', 'Owner', 'Checked in', 'Clinic status', 'Treatment', 'Action'], function (s) { var p = V.findPet(s.petId); return '<tr><td><b>' + E(p.name) + '</b></td><td>' + E(V.findOwner(p.ownerId).name) + '</td><td>' + V.fmtDate(s.admittedAt.slice(0, 10)) + '<br><small>' + V.fmtTime(s.admittedAt) + '</small></td><td>' + pill(s.status) + '<br><small>' + (s.confined ? 'Confined' : 'Visit only · not confined') + '</small></td><td>' + E(p.status) + '</td><td><button type="button" class="btn btn-ghost btn-sm" data-manage-stay="' + s.id + '">Manage</button></td></tr>'; }, page);
    } else {
      var seen = {}, released = V.db.records.filter(function (r) { return r.type === 'release' && V.isApproved(r); }).sort(function (a, b) { return b.date.localeCompare(a.date) || (b.ts || '').localeCompare(a.ts || ''); }).filter(function (r) { var p = V.findPet(r.petId); if (seen[r.petId] || !p || p.status === 'Deceased' || V.activeStay(r.petId)) return false; seen[r.petId] = true; return true; });
      head.innerHTML = '<h2>Released pets</h2><small class="caption">Latest confirmed handover for each pet</small>';
      body.innerHTML = V.ui.table(released, ['Pet', 'Release date', 'Received by', 'Action'], function (r) { return '<tr><td>' + E(V.findPet(r.petId).name) + '</td><td>' + V.fmtDate(r.date) + '</td><td>' + E(r.receivedBy) + '</td><td><a class="btn btn-ghost btn-sm" href="pet.html?id=' + encodeURIComponent(r.petId) + '">Open record</a></td></tr>'; }, page);
    }
  }
  function manageAppointment(a) {
    var p = V.findPet(a.petId), available = a.status === 'scheduled' && !a.pendingRecordId, due = a.date + 'T' + a.time + ':00' <= V.nowStr();
    var m = V.modal('Appointment for ' + p.name, '<p>' + V.fmtDate(a.date) + ' · ' + E(a.time) + ' · ' + E(a.purpose) + '</p><p>' + pill(a.status) + '</p><div class="manage-list">' +
      (available ? (due ? '<button type="button" class="btn btn-ghost btn-block" data-appointment-action="attended">Mark attended</button><button type="button" class="btn btn-ghost btn-block" data-appointment-action="missed">Owner did not attend</button>' : '') + '<button type="button" class="btn btn-ghost btn-block" data-appointment-action="reschedule">Reschedule</button><button type="button" class="btn btn-ghost btn-block" data-appointment-action="cancel">Cancel appointment</button>' : '') + '<a class="btn btn-ghost btn-block" href="pet.html?id=' + encodeURIComponent(p.id) + '">Open pet record</a></div>');
    m.body.querySelectorAll('[data-appointment-action]').forEach(function (b) { b.addEventListener('click', function () {
      var action = b.dataset.appointmentAction; m.close();
      if (action === 'reschedule') V.ui.form('Reschedule appointment', '<div class="form-grid">' + V.ui.field('New date', 'date', V.ui.input('date', a.date >= V.today() ? a.date : V.today(), 'date', 'min="' + V.today() + '"')) + V.ui.field('New time', 'time', V.ui.input('time', a.time, 'time')) + '</div>', function (d) { return V.changeAppointment(a.id, action, d); }, 'Confirm reschedule', render);
      else if (action === 'cancel') V.ui.form('Cancel appointment', V.ui.field('Reason', 'reason', '<textarea class="textarea" name="reason" maxlength="200"></textarea>'), function (d) { return V.changeAppointment(a.id, action, d); }, 'Confirm cancellation', render);
      else if (action === 'missed') V.ui.form('Owner did not attend', V.ui.field('Notes', 'notes', '<textarea class="textarea" name="notes" maxlength="500"></textarea>'), function (d) { return V.changeAppointment(a.id, action, d); }, V.can('medical.review') ? 'Record missed appointment' : 'Send for approval', render);
      else V.confirm('Mark appointment attended', 'Confirm the owner and pet arrived. The pet will appear on the clinic board; clinical notes can be added in the pet record.', 'Mark attended', false).then(function (yes) { if (yes) { var r = V.changeAppointment(a.id, action); V.toast(r.ok ? 'Attendance recorded.' : r.error, r.ok ? '' : 'error'); render(); } });
    }); });
  }
  function click(event) {
    var b = event.target.closest('button'); if (!b) return;
    if (b.dataset.clinicTab) { view = b.dataset.clinicTab; page = 1; render(); }
    if (b.dataset.calendarDate) { day = b.dataset.calendarDate; month = day.slice(0, 7) + '-01'; page = 1; render(); }
    if (b.dataset.month) { var current = V.parse(month); current.setMonth(current.getMonth() + Number(b.dataset.month)); month = V.dstr(current); day = month; page = 1; render(); }
    if (b.dataset.page) { page = Number(b.dataset.page); render(); }
    if (b.hasAttribute('data-new-appointment')) V.ui.bookAppointment(day, null, render);
    if (b.hasAttribute('data-check-in')) V.ui.admit(null, render);
    if (b.dataset.manageAppointment) manageAppointment(V.db.appointments.filter(function (a) { return a.id === b.dataset.manageAppointment; })[0]);
    if (b.dataset.manageStay) {
      var stay = V.db.clinicStays.filter(function (s) { return s.id === b.dataset.manageStay; })[0], pet = V.findPet(stay.petId);
      var m = V.modal('Clinic stay: ' + pet.name, '<p><b>' + (stay.confined ? 'Confined in clinic' : 'Ordinary clinic visit') + '</b><br>' + E(stay.confined ? stay.confinementReason || stay.reason : stay.reason) + '</p><div class="manage-list">' + (!stay.confined ? '<button type="button" class="btn btn-ghost btn-block" data-confine>Admit for confinement</button>' : '') + (stay.status === 'in_clinic' && V.can('medical.edit') ? '<button type="button" class="btn btn-ghost btn-block" data-ready>Ready for pickup</button>' : '') + '<a class="btn btn-ghost btn-block" href="pet.html?id=' + encodeURIComponent(pet.id) + '&action=release">' + (V.can('medical.edit') ? 'Release pet home' : 'Request pet release') + '</a><a class="btn btn-ghost btn-block" href="pet.html?id=' + encodeURIComponent(pet.id) + '">Open pet record</a></div>');
      var confine = m.body.querySelector('[data-confine]'); if (confine) confine.addEventListener('click', function () { m.close(); V.ui.confine(pet.id, render); });
      var ready = m.body.querySelector('[data-ready]'); if (ready) ready.addEventListener('click', function () { var r = V.markReadyForPickup(pet.id); if (!r.ok) V.toast(r.error, 'error'); m.close(); render(); });
    }
  }
  document.querySelector('#main').addEventListener('click', click); render();
})();
