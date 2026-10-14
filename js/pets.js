/* Pet records: list, search, filters, add a pet and its owner */
(function () {
  'use strict';
  var ctx = VZ.init('pets', { title: 'Pet records', subtitle: 'Profiles, vaccinations, and medical history for every pet.', icon: 'paw' });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;
  var state = { q: '', species: 'All', status: 'All', sort: 'name', view: 'grid' };

  // The page's static layout lives in pets.html. JavaScript handles behavior and data.
  if (!main.children.length) {
    // Fallback for older HTML copies.
    main.innerHTML = '<div class="toolbar"><label class="search">' + VZ.icon('search', 18) + '<span class="sr-only">Search pets or owners</span><input id="q" type="search" placeholder="Search by pet or owner name"></label>' +
    '<label><span class="sr-only">Species</span><select class="select" id="species"><option value="All">All pets</option><option>Dog</option><option>Cat</option></select></label>' +
    '<label><span class="sr-only">Status</span><select class="select" id="status"><option value="All">All statuses</option><option>Healthy</option><option>Vaccination Due</option><option>Checkup Due</option><option>In Treatment</option><option>Deceased</option></select></label>' +
    '<label><span class="sr-only">Sort by</span><select class="select" id="sort"><option value="name">Name A-Z</option><option value="owner">Owner A-Z</option><option value="age">Oldest first</option></select></label>' +
    '<span class="view-toggle" role="group" aria-label="View"><button type="button" data-view="grid" aria-pressed="true">Cards</button><button type="button" data-view="list" aria-pressed="false">List</button></span>' +
    '<button type="button" class="btn" id="add-pet">' + VZ.icon('plus', 18) + ' Add pet</button></div>' +
    '<div class="stat-grid" id="pet-stats"></div><div id="pets"></div>';
  }
  main.querySelectorAll('[data-icon]').forEach(function (node) {
    node.outerHTML = VZ.icon(node.getAttribute('data-icon'), Number(node.getAttribute('data-size')) || 18);
  });

  var el = { q: document.getElementById('q'), species: document.getElementById('species'), status: document.getElementById('status'), sort: document.getElementById('sort'), stats: document.getElementById('pet-stats'), list: document.getElementById('pets') };

  function all() { return VZ.db.pets.map(function (p) { return { p: p, s: VZ.petState(p), o: VZ.findOwner(p.ownerId) }; }); }

  function renderStats() {
    var a = all(), healthy = a.filter(function (x) { return x.s.label === 'Healthy'; }).length;
    var vax = a.filter(function (x) { return x.s.vaxDue; }).length, chk = a.filter(function (x) { return x.s.checkDue; }).length;
    function card(cls, icon, title, num, sub) { return '<div class="stat ' + cls + '"><span class="stat-top"><span class="stat-ico">' + VZ.icon(icon, 22) + '</span>' + title + '</span><span class="stat-num">' + num + '</span><span class="stat-sub">' + sub + '</span></div>'; }
    el.stats.innerHTML = card('stat-plain', 'paw', 'Total pets', a.length, 'registered pets') +
      card('stat-amber', 'calendar', 'Vaccines due', vax, 'due within ' + VZ.DUE_DAYS + ' days or overdue') +
      card('stat-amber', 'clock', 'Checkups due', chk, 'due within ' + VZ.DUE_DAYS + ' days or overdue') +
      card('stat-green', 'heart', 'Healthy pets', healthy, a.length ? Math.round(healthy / a.length * 100) + '% of all pets' : 'No pets yet');
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var l = all().filter(function (x) {
      if (q && x.p.name.toLowerCase().indexOf(q) < 0 && x.o.name.toLowerCase().indexOf(q) < 0) return false;
      if (state.species !== 'All' && x.p.species !== state.species) return false;
      if (state.status !== 'All' && x.s.label !== state.status) return false;
      return true;
    });
    l.sort(function (a, b) {
      if (state.sort === 'owner') return a.o.name.localeCompare(b.o.name) || a.p.name.localeCompare(b.p.name);
      if (state.sort === 'age') return a.p.birth < b.p.birth ? -1 : a.p.birth > b.p.birth ? 1 : 0;
      return a.p.name.localeCompare(b.p.name);
    });
    return l;
  }

  function lastVisitText(p) {
    var d = VZ.lastVisit(p.id);
    return d ? 'Last visit: ' + VZ.fmtDate(d) : 'No visits recorded yet';
  }
  function sexMark(s) { return s === 'F' ? '<span aria-label="Female" style="color:#c8266f">&#9792;</span>' : '<span aria-label="Male" style="color:#1d3f8f">&#9794;</span>'; }

  function render() {
    renderStats();
    var l = filtered();
    if (!l.length) { el.list.innerHTML = '<div class="card empty">No pets match your search. Clear the filters or add a new pet.</div>'; return; }
    if (state.view === 'grid') {
      el.list.innerHTML = '<div class="pet-grid">' + l.map(function (x) {
        var p = x.p, cat = p.species === 'Cat';
        return '<article class="pet-card"><div class="pet-pic' + (cat ? ' cat' : '') + '" aria-hidden="true">' + (cat ? '🐈' : '🐕') + '<span class="chip ' + x.s.cls + '">' + x.s.label + '</span></div>' +
          '<div><h3>' + VZ.esc(p.name) + ' ' + sexMark(p.sex) + '</h3><div class="sub">' + VZ.esc(p.breed) + ' &bull; ' + VZ.ageText(p.birth) + '</div><div class="last">' + lastVisitText(p) + '</div></div>' +
          '<div class="owner"><span>' + VZ.esc(x.o.name) + '</span><a class="btn btn-ghost btn-sm" href="pet.html?id=' + encodeURIComponent(p.id) + '" aria-label="View ' + VZ.esc(p.name) + '">View</a></div></article>';
      }).join('') + '</div>';
    } else {
      el.list.innerHTML = '<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Pet</th><th scope="col">Species</th><th scope="col">Breed</th><th scope="col">Age</th><th scope="col">Owner</th><th scope="col">Last visit</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>' +
        l.map(function (x) {
          var p = x.p;
          return '<tr><td><b>' + VZ.esc(p.name) + '</b> ' + sexMark(p.sex) + '</td><td>' + p.species + '</td><td>' + VZ.esc(p.breed) + '</td><td>' + VZ.ageText(p.birth) + '</td><td>' + VZ.esc(x.o.name) + '</td><td class="nowrap">' + (VZ.lastVisit(p.id) ? VZ.fmtDate(VZ.lastVisit(p.id)) : 'None yet') + '</td>' +
            '<td><span class="chip ' + x.s.cls + '">' + x.s.label + '</span></td><td><a class="btn btn-ghost btn-sm" href="pet.html?id=' + encodeURIComponent(p.id) + '" aria-label="View ' + VZ.esc(p.name) + '">View</a></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
  }

  el.q.addEventListener('input', function () { state.q = el.q.value; render(); });
  el.species.addEventListener('change', function () { state.species = el.species.value; render(); });
  el.status.addEventListener('change', function () { state.status = el.status.value; render(); });
  el.sort.addEventListener('change', function () { state.sort = el.sort.value; render(); });
  main.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view');
      main.querySelectorAll('[data-view]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      render();
    });
  });

  var field = VZ.field;
  // After the pet is saved, offer to record the first visit right away.
  function savedStep(m, pet) {
    var owner = VZ.findOwner(pet.ownerId);
    m.el.querySelector('h2').textContent = 'Pet saved';
    m.body.innerHTML =
      '<div class="center"><div class="success-mark">' + VZ.icon('check', 30) + '</div><h3>' + VZ.esc(pet.name) + ' was added</h3>' +
      '<p class="caption">Owner: ' + VZ.esc(owner.name) + '. Do you want to record a visit now? You can also do this later from the pet profile.' + (VZ.can('medical.review') ? '' : ' Your entry will be sent to the admin for approval.') + '</p></div>' +
      '<div class="modal-actions stack"><button type="button" class="btn btn-ghost" data-done>Not now</button>' +
      '<a class="btn btn-ghost" href="pet.html?id=' + encodeURIComponent(pet.id) + '">View profile</a>' +
      '<button type="button" class="btn" data-visit>Add visit record</button></div>';
    m.body.querySelector('[data-done]').addEventListener('click', m.close);
    m.body.querySelector('[data-visit]').addEventListener('click', function () {
      m.close();
      VZ.openVisitForm(pet, user, {
        onSaved: function (r) { VZ.flash(r.pending ? 'Sent to the admin for approval. It will appear in ' + pet.name + '\'s medical history once approved.' : 'Visit record saved for ' + pet.name + '.'); location.href = 'pet.html?id=' + encodeURIComponent(pet.id); }
      });
    });
    var first = m.body.querySelector('[data-visit]');
    if (first) first.focus();
  }

  document.getElementById('add-pet').addEventListener('click', function () {
    var m = VZ.modal('Add pet',
      '<form id="pet-form" novalidate><div class="form-grid">' +
      field('Pet name', 'name', '<input class="input" name="name" maxlength="40" autocomplete="off">') +
      field('Species', 'species', '<select class="select" name="species"><option value="">Choose</option><option>Dog</option><option>Cat</option></select>') +
      field('Breed', 'breed', '<input class="input" name="breed" maxlength="40" autocomplete="off">', 'Write "Mixed breed" if unsure.') +
      field('Sex', 'sex', '<select class="select" name="sex"><option value="">Choose</option><option value="F">Female</option><option value="M">Male</option></select>') +
      field('Birth date', 'birth', '<input class="input" name="birth" type="date" max="' + VZ.today() + '">', 'An estimate is fine.') +
      '<span></span>' +
      field('Owner name', 'ownerName', '<input class="input" name="ownerName" maxlength="60" autocomplete="off" list="owner-names">', 'Pick an existing owner or type a new one.') +
      field('Owner phone', 'ownerPhone', '<input class="input" name="ownerPhone" type="tel" inputmode="tel" autocomplete="off" placeholder="0917 000 0000">') +
      '</div><datalist id="owner-names">' + VZ.db.owners.map(function (o) { return '<option value="' + VZ.esc(o.name) + '"></option>'; }).join('') + '</datalist>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">Save pet</button></div></form>', { wide: true });
    var form = m.body.querySelector('form');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    // Picking an existing owner fills in their phone. Wait a moment so it never mixes with what the person is typing.
    form.elements.ownerName.addEventListener('change', function () {
      var o = VZ.db.owners.filter(function (x) { return x.name.toLowerCase() === form.elements.ownerName.value.trim().toLowerCase(); })[0];
      if (!o) return;
      setTimeout(function () {
        var phone = form.elements.ownerPhone;
        if (phone.value) return;
        phone.value = o.phone;
        if (document.activeElement === phone) phone.select();
      }, 0);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = VZ.addPet(VZ.formData(form));
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      render();
      savedStep(m, r.pet);
    });
  });

  render();
})();
