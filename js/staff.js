/* Staff accounts (admin only): create accounts, approve or reject account requests, change roles, turn accounts on or off */
(function () {
  'use strict';
  var ctx = VZ.init('staff', { title: 'Staff accounts', subtitle: 'Create accounts for your team and control who can sign in.', icon: 'users', roles: ['admin'] });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;

  function render() {
    document.getElementById('staff-summary').innerHTML = '<b>' + VZ.db.users.length + '</b> accounts' + (VZ.pendingCount() ? ', <b>' + VZ.pendingCount() + '</b> waiting for your approval' : '') + '. Staff can use inventory, sales, and pet records. Only admins can see income and manage accounts.';
    document.getElementById('staff-rows').innerHTML =
      VZ.db.users.map(function (u) {
        var self = u.id === user.id;
        return '<tr><td><b>' + VZ.esc(u.name) + '</b>' + (self ? ' <span class="chip chip-grey">You</span>' : '') + '</td><td>' + VZ.esc(u.username) + '</td><td><span class="chip ' + (u.role === 'admin' ? 'chip-blue' : 'chip-grey') + '">' + (u.role === 'admin' ? 'Admin' : 'Staff') + '</span></td>' +
          '<td><span class="chip ' + (u.pending ? 'chip-amber' : u.active ? 'chip-green' : 'chip-grey') + '">' + (u.pending ? 'Waiting for approval' : u.active ? 'Active' : 'Turned off') + '</span></td><td>' + VZ.fmtDate(u.created) + '</td>' +
          (u.pending
            ? '<td><span class="row-actions wrap"><button type="button" class="btn btn-sm" data-approve="' + u.id + '">Approve</button><button type="button" class="btn btn-ghost btn-sm" data-reject="' + u.id + '">Reject</button></span></td></tr>'
            : '<td><span class="row-actions wrap"><button type="button" class="btn btn-ghost btn-sm" data-reset="' + u.id + '">Reset password</button>' +
              (self ? '' : '<button type="button" class="btn btn-ghost btn-sm" data-role="' + u.id + '">Change role</button>' + '<button type="button" class="btn btn-ghost btn-sm" data-toggle="' + u.id + '">' + (u.active ? 'Turn off' : 'Turn on') + '</button>') + '</span></td></tr>');
      }).join('');

    main.querySelectorAll('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = VZ.toggleUser(b.getAttribute('data-toggle'));
        if (r.ok) { VZ.toast('Account ' + (r.active ? 'turned on.' : 'turned off.')); render(); } else VZ.toast(r.error, 'error');
      });
    });
    main.querySelectorAll('[data-approve]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = VZ.approveUser(b.getAttribute('data-approve'));
        if (r.ok) { VZ.toast('Account approved. The person can now sign in.'); render(); VZ.refreshNavBadges(); } else VZ.toast(r.error, 'error');
      });
    });
    main.querySelectorAll('[data-reject]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = VZ.db.users.filter(function (x) { return x.id === b.getAttribute('data-reject'); })[0];
        if (!u) return;
        VZ.confirm('Reject account request', 'Reject the request from ' + u.name + '? The request will be removed.', 'Reject request', true).then(function (yes) {
          if (!yes) return;
          var r = VZ.rejectUser(u.id);
          if (r.ok) { VZ.toast('Request rejected.'); render(); VZ.refreshNavBadges(); } else VZ.toast(r.error, 'error');
        });
      });
    });
    main.querySelectorAll('[data-role]').forEach(function (b) {
      b.addEventListener('click', function () { roleForm(b.getAttribute('data-role')); });
    });
    main.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function () { resetForm(b.getAttribute('data-reset')); });
    });
    document.getElementById('reset-demo').addEventListener('click', function () {
      VZ.confirm('Reset demo data', 'This replaces all data in this browser with the original sample data and signs you out. Continue?', 'Reset data', true).then(function (yes) {
        if (!yes) return;
        VZ.resetDemo();
        VZ.logout();
      });
    });
  }

  function roleForm(id) {
    var u = VZ.db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var to = u.role === 'admin' ? 'staff' : 'admin';
    var m = VZ.modal('Change role: ' + u.name,
      '<form id="role-form" novalidate><p class="note">' + VZ.esc(u.name) + ' is now <b>' + (u.role === 'admin' ? 'an admin' : 'staff') + '</b>. ' +
      (to === 'admin' ? 'Admins can approve changes, see income, delete medical entries, and manage accounts.' : 'Staff lose these admin powers right away.') + '</p>' +
      VZ.field('New role', 'role', '<select class="select" name="role"><option value="staff"' + (to === 'staff' ? ' selected' : '') + '>Staff</option><option value="admin"' + (to === 'admin' ? ' selected' : '') + '>Admin</option></select>') +
      VZ.field('Confirm with your password', 'password', '<input class="input" name="password" type="password" autocomplete="current-password">', 'Enter your own password to confirm this change.') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">Change role</button></div></form>');
    var form = m.body.querySelector('form');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = VZ.formData(form), r = VZ.changeRole(id, d.role, d.password);
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      m.close();
      VZ.toast(u.name + ' is now ' + (d.role === 'admin' ? 'an admin.' : 'staff.'));
      render();
    });
  }

  function resetForm(id) {
    var u = VZ.db.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var m = VZ.modal('Reset password for ' + u.name,
      '<form id="pw-form" novalidate>' + VZ.field('New temporary password', 'password', '<input class="input" name="password" type="text" autocomplete="off" spellcheck="false">', 'At least 8 characters.') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">Save password</button></div></form>');
    var form = m.body.querySelector('form');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = VZ.resetPassword(id, form.elements.password.value);
      if (!r.ok) { VZ.showErrors(form, r.errors || { password: r.error }); return; }
      m.close();
      VZ.toast('Password updated.');
    });
  }

  render();
})();
