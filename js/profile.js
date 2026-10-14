/* Profile: personal information, profile picture, change password */
(function () {
  'use strict';
  var ctx = VZ.init('profile', { title: 'Profile', subtitle: 'Manage your personal information and account settings.', icon: 'user' });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;

  function refreshChip() {
    var chip = document.getElementById('user-btn');
    chip.querySelector('.who b').textContent = user.name;
    chip.querySelector('.avatar').outerHTML = VZ.avatarHTML(user);
  }

  // Shrink the chosen picture to a small square so it fits in browser storage.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('read')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('image')); };
        img.onload = function () {
          var canvas = document.createElement('canvas'), c = canvas.getContext && canvas.getContext('2d');
          if (!c) { reject(new Error('canvas')); return; }
          var size = Math.min(img.width, img.height);
          canvas.width = canvas.height = 220;
          c.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 220, 220);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function pwField(label, name, auto) {
    return VZ.field(label, name, '<span class="pw-wrap2"><input class="input" name="' + name + '" type="password" autocomplete="' + auto + '">' +
      '<button type="button" class="icon-btn" data-toggle-pw aria-label="Show password" aria-pressed="false">' + VZ.icon('eye', 20) + '</button></span>');
  }

  function render() {
    var initial = user.name.trim().charAt(0).toUpperCase();
    document.getElementById('me-avatar').innerHTML = user.photo ? '<img src="' + VZ.esc(user.photo) + '" alt="Your profile picture">' : VZ.esc(initial);
    document.getElementById('me-name').textContent = user.name;
    document.getElementById('me-role').innerHTML = '<span class="chip ' + (user.role === 'admin' ? 'chip-blue' : 'chip-green') + '">' + (user.role === 'admin' ? 'Admin' : 'Staff') + '</span>';
    document.getElementById('me-email').textContent = user.email || 'Not added';
    document.getElementById('me-phone').textContent = user.phone || 'Not added';
    document.getElementById('me-role-text').textContent = user.role === 'admin' ? 'Admin' : 'Staff';
    document.getElementById('remove-photo').hidden = !user.photo;
    var profileForm = document.getElementById('profile-form');
    ['name', 'username', 'email', 'phone', 'dob', 'gender', 'address'].forEach(function (key) { profileForm.elements[key].value = user[key] || ''; });
    profileForm.elements.startDate.value = VZ.fmtDate(user.startDate || user.created);
    profileForm.elements.dob.max = VZ.today();

    // picture
    var input = document.getElementById('photo-input');
    document.getElementById('pick-photo').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { VZ.toast('Choose a PNG, JPG, or WebP picture.', 'error'); input.value = ''; return; }
      if (f.size > 5 * 1024 * 1024) { VZ.toast('Choose a picture smaller than 5 MB.', 'error'); input.value = ''; return; }
      shrink(f).then(function (url) {
        var r = VZ.setPhoto(user, url);
        if (!r.ok) { VZ.toast(r.error, 'error'); return; }
        VZ.toast('Profile picture updated.');
        render(); refreshChip();
      }).catch(function () { VZ.toast('This picture could not be used. Try another one.', 'error'); });
    });
    var rm = document.getElementById('remove-photo');
    if (rm) rm.addEventListener('click', function () { VZ.setPhoto(user, ''); VZ.toast('Profile picture removed.'); render(); refreshChip(); });

    // personal information
    var form = document.getElementById('profile-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = VZ.updateProfile(VZ.formData(form), user);
      if (!r.ok) { VZ.showErrors(form, r.errors); return; }
      VZ.toast('Your profile was saved.');
      render(); refreshChip();
    });

    // password
    var pw = document.getElementById('pw-form');
    pw.querySelectorAll('[data-toggle-pw]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.innerHTML = VZ.icon(show ? 'eyeoff' : 'eye', 20);
        b.setAttribute('aria-pressed', String(show));
        b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
    pw.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = VZ.formData(pw), r = VZ.changePassword(user, d.current, d.next, d.confirm);
      if (!r.ok) { VZ.showErrors(pw, r.errors); return; }
      pw.reset();
      VZ.showErrors(pw, {});
      VZ.toast('Your password was updated.');
    });
  }
  render();
})();
