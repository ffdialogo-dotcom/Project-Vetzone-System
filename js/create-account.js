/* Admin account creation. Public registration is closed. */
(function () {
  'use strict';
  var page = document.getElementById('page');
  function authorize() {
    var user = VZ.currentUser();
    if (!user || user.pending) { page.hidden = true; location.replace('index.html'); return false; }
    if (user.role !== 'admin') { page.hidden = true; location.replace('dashboard.html'); return false; }
    return true;
  }
  if (!authorize()) return;
  document.title = 'Create account | VetZone VetCare System';

  function renderForm() {
    document.getElementById('create-art-icon').innerHTML = VZ.icon('users', 56);
    document.getElementById('create-art-title').textContent = 'Add someone to your team';
    document.getElementById('create-art-text').textContent = 'Give each person their own account, so you can see who recorded each sale and visit.';
    document.getElementById('admin-back').hidden = false;
    document.getElementById('back-icon').innerHTML = VZ.icon('back', 18);
    document.getElementById('create-logo').innerHTML = VZ.logoHTML('dashboard.html');
    document.getElementById('create-description').textContent = 'Only the admin can create accounts here. Full name, username, password, and role are required. The other details are optional.';
    document.getElementById('admin-role').hidden = false;
    document.getElementById('password-hint').textContent = 'At least 8 characters. Ask the person to change it after signing in.';
    document.getElementById('password-eye').innerHTML = VZ.icon('eye', 20);
    document.querySelector('#create-form [name="dob"]').max = VZ.today();
    var form = document.getElementById('create-form');
    var toggle = document.getElementById('toggle-pw');
    toggle.addEventListener('click', function () {
      var inp = form.elements.password, show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      toggle.innerHTML = VZ.icon(show ? 'eyeoff' : 'eye', 20);
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!authorize()) return;
      var d = VZ.formData(form), r = VZ.addUser(d);
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      VZ.flash('Account created for ' + d.name.trim() + '.');
      location.href = 'staff.html';
    });
  }

  renderForm();
  page.hidden = false;
  // Hide cached forms and clear the temporary password when leaving the page.
  window.addEventListener('pagehide', function () {
    page.hidden = true;
    document.querySelector('#create-form [name="password"]').value = '';
  });
  window.addEventListener('pageshow', function (event) {
    // Reload cached pages so role/account changes use the latest saved data.
    if (event.persisted) location.reload();
  });
})();
