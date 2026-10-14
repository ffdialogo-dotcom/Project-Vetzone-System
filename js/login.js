/* Login page */
(function () {
  'use strict';
  if (VZ.currentUser()) { location.replace('dashboard.html'); return; }
  var form = document.getElementById('login-form');
  var user = document.getElementById('username');
  var pw = document.getElementById('password');
  var err = document.getElementById('login-error');
  var toggle = document.getElementById('toggle-pw');
  toggle.innerHTML = VZ.icon('eye', 22);

  toggle.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.innerHTML = VZ.icon(show ? 'eyeoff' : 'eye', 22);
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  function showError(msg) { err.textContent = msg; err.hidden = false; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;
    if (!user.value.trim() || !pw.value) { showError('Enter your username and password.'); (user.value.trim() ? pw : user).focus(); return; }
    var r = VZ.login(user.value, pw.value);
    if (r.ok) { location.href = 'dashboard.html'; return; }
    showError(r.error);
    pw.value = '';
    pw.focus();
  });

  document.getElementById('fill-admin').addEventListener('click', function () { user.value = 'admin'; pw.value = 'admin123'; pw.focus(); });
  document.getElementById('fill-staff').addEventListener('click', function () { user.value = 'staff1'; pw.value = 'staff123'; pw.focus(); });
})();
