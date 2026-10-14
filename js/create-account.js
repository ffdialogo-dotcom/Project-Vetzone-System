/* Create account.
   Admin signed in: creates an active account and can pick the role.
   Not signed in: sends a staff account request that the admin must approve before it can sign in. */
(function () {
  'use strict';
  var user = VZ.currentUser();
  if (user && user.role !== 'admin') { location.replace('dashboard.html'); return; }
  var isAdmin = !!user;
  document.title = 'Create account | VetZone VetCare System';

  function renderForm() {
    document.getElementById('create-art-icon').innerHTML = VZ.icon('users', 56);
    document.getElementById('create-art-title').textContent = isAdmin ? 'Add someone to your team' : 'Join the VetZone team';
    document.getElementById('create-art-text').textContent = isAdmin ? 'Give each person their own account, so you can see who recorded each sale and visit.' : 'Send your details. The clinic admin will approve your account before you can sign in.';
    document.getElementById('admin-back').hidden = !isAdmin;
    document.getElementById('guest-top').hidden = isAdmin;
    document.getElementById('back-icon').innerHTML = VZ.icon('back', 18);
    document.getElementById('create-logo').innerHTML = VZ.logoHTML(isAdmin ? 'dashboard.html' : 'index.html');
    document.getElementById('create-description').textContent = (isAdmin ? 'Only the admin can create accounts here. ' : 'The admin must approve your account before you can sign in. ') + 'Full name, username, and password are required' + (isAdmin ? ', and so is the role' : '') + '. The other details are optional.';
    document.getElementById('admin-role').hidden = !isAdmin;
    document.getElementById('guest-role').hidden = isAdmin;
    document.getElementById('password-hint').textContent = 'At least 8 characters.' + (isAdmin ? ' Ask the person to change it after signing in.' : '');
    document.getElementById('password-eye').innerHTML = VZ.icon('eye', 20);
    document.querySelector('#create-form [name="dob"]').max = VZ.today();
    document.getElementById('login-link').href = isAdmin ? 'staff.html' : 'index.html';
    document.getElementById('login-link').textContent = isAdmin ? 'Cancel' : 'Log in';
    if (isAdmin) document.querySelector('#create-form [name="name"]').autocomplete = 'off';
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
      var d = VZ.formData(form);
      if (isAdmin) {
        var r = VZ.addUser(d);
        if (!r.ok) { VZ.showErrors(form, r.errors); return; }
        VZ.flash('Account created for ' + d.name.trim() + '.');
        location.href = 'staff.html';
      } else {
        var q = VZ.register(d);
        if (!q.ok) { VZ.showErrors(form, q.errors); return; }
        renderSent(d.name.trim());
      }
    });
  }

  // Shown after someone sends an account request.
  function renderSent(name) {
    var side = document.getElementById('create-side');
    side.style.justifyContent = 'center';
    side.innerHTML = '<div class="center" role="status"><div class="success-mark">' + VZ.icon('check', 30) + '</div><h1 style="font-size:1.6rem;color:var(--green-text)">Request sent</h1>' +
      '<p style="margin:10px 0 18px">Thank you, ' + VZ.esc(name) + '. The clinic admin needs to approve your account first. After that, you can sign in with your username and password.</p>' +
      '<a class="btn" href="index.html" id="back-login">Back to log in</a></div>';
    document.getElementById('back-login').focus();
  }

  renderForm();
})();
