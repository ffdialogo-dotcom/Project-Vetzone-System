/* Inventory: list, search, add item, add stock, edit details, correct stock, batches, archive.
   An admin's change is applied at once. A staff member's change is sent to the admin and does not
   change the official inventory until it is approved. */
(function () {
  'use strict';
  var ctx = VZ.init('inventory', { title: 'Inventory', subtitle: 'Keep track of your stock, expiration dates, and supply.', icon: 'box' });
  if (!ctx) return;
  var user = ctx.user, isAdmin = VZ.can('inventory.direct'), main = ctx.main;
  var PAGE_SIZE = 8;
  var qs = new URLSearchParams(location.search);
  var state = { q: qs.get('q') || '', cat: 'All', status: ['low', 'expiring', 'out', 'in'].indexOf(qs.get('status')) >= 0 ? qs.get('status') : 'All', sort: 'name', page: 1, view: 'active' };
  var field = VZ.field;
  var staffNote = isAdmin ? '' : '<p class="note">Your change will be sent to the admin for approval. The official stock and item details stay the same until it is approved.</p>';
  var reasonField = function (required) {
    return field(required ? 'Reason for the change' : 'Reason for the change (optional)', 'reason', '<textarea class="textarea" name="reason" maxlength="200" style="min-height:64px"></textarea>',
      required ? 'For example: damaged, expired, or counted wrongly.' : 'The admin will see this when reviewing.');
  };

  // The page's static layout lives in inventory.html. JavaScript handles behavior and data.
  if (!main.children.length) {
    // Fallback for older HTML copies.
    main.innerHTML = '<div class="stat-grid" id="inv-stats"></div><div id="proposals"></div>' +
    '<div class="inventory-view-tabs status-tabs no-print" role="tablist" aria-label="Inventory views"><button type="button" role="tab" id="inv-active-tab" aria-selected="true" aria-controls="inv-table-region" data-view="active">Active Items</button><button type="button" role="tab" id="inv-archived-tab" aria-selected="false" aria-controls="inv-table-region" data-view="archived">Archived Items</button></div>' +
    '<div class="toolbar no-print">' +
    '<label class="search">' + VZ.icon('search', 18) + '<span class="sr-only">Search items</span><input id="q" type="search" placeholder="Search items" value="' + VZ.esc(state.q) + '"></label>' +
    '<label><span class="sr-only">Category</span><select class="select" id="cat"><option value="All">All categories</option>' + VZ.CATEGORIES.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></label>' +
    '<label><span class="sr-only">Status</span><select class="select" id="status"><option value="All">All statuses</option><option value="in">In stock</option><option value="low">Low stock</option><option value="expiring">Expiring or expired</option><option value="out">Out of stock</option></select></label>' +
    '<label><span class="sr-only">Sort by</span><select class="select" id="sort"><option value="name">Name A-Z</option><option value="name-desc">Name Z-A</option><option value="qty">Lowest stock first</option><option value="expiry">Soonest expiry first</option><option value="price">Highest price first</option></select></label>' +
    '<button type="button" class="btn" id="add-item">' + VZ.icon('plus', 18) + ' Add item</button></div>' +
    '<div id="inv-table-region" role="tabpanel" aria-labelledby="inv-active-tab"><div class="table-wrap"><table class="table"><caption class="sr-only">Official inventory</caption><thead><tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col" class="num">Price</th><th scope="col" class="num">In stock</th><th scope="col">Next expiry</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody id="rows"></tbody></table></div>' +
    '<div class="table-foot"><span id="showing"></span><div class="pager" id="pager"></div></div></div>';
  }
  main.querySelectorAll('[data-icon]').forEach(function (node) {
    node.outerHTML = VZ.icon(node.getAttribute('data-icon'), Number(node.getAttribute('data-size')) || 18);
  });

  var el = {
    q: document.getElementById('q'), cat: document.getElementById('cat'), status: document.getElementById('status'),
    sort: document.getElementById('sort'), rows: document.getElementById('rows'), stats: document.getElementById('inv-stats'),
    showing: document.getElementById('showing'), pager: document.getElementById('pager'), proposals: document.getElementById('proposals'), tabs: document.querySelector('.inventory-view-tabs'), region: document.getElementById('inv-table-region'), add: document.getElementById('add-item')
  };
  el.status.value = state.status;

  function statCards() {
    var infos = VZ.products().map(function (p) { return VZ.info(p); });
    var low = infos.filter(function (i) { return i.low; }).length, exp = infos.filter(function (i) { return i.expiring; }).length;
    function card(cls, icon, title, num, sub) {
      return '<div class="stat ' + cls + '"><span class="stat-top"><span class="stat-ico">' + VZ.icon(icon, 22) + '</span>' + title + '</span><span class="stat-num">' + num + '</span><span class="stat-sub">' + sub + '</span></div>';
    }
    el.stats.innerHTML = card('stat-plain', 'box', 'Total items', infos.length, 'active items') +
      card('stat-amber', 'alert', 'Low stock', low, 'items running low') +
      card('stat-red', 'calendar', 'Expiring', exp, 'within ' + VZ.EXPIRY_DAYS + ' days or expired') +
      card('stat-green', 'peso', 'Stock value', VZ.money(VZ.stockValue()), 'at selling price');
  }

  // Proposed changes are shown apart from the official inventory, because they are not applied yet.
  function renderProposals() {
    var list = VZ.inventoryRequests('pending');
    if (!list.length) { el.proposals.innerHTML = ''; return; }
    el.proposals.innerHTML = '<section class="card proposal-card" aria-label="Proposed changes"><div class="card-head"><h2>Proposed changes <span class="chip chip-amber">Not applied yet</span></h2>' +
      (isAdmin ? '<a class="btn btn-sm" href="approvals.html">Review ' + list.length + '</a>' : '<a class="btn btn-ghost btn-sm" href="approvals.html">My submissions</a>') + '</div>' +
      '<p class="caption" style="margin:0 0 10px">' + (isAdmin ? 'These changes from staff are waiting for your decision.' : 'These changes are waiting for admin approval.') + ' The inventory below does not include them yet.</p>' +
      '<div class="table-wrap"><table class="table" style="min-width:560px"><thead><tr><th scope="col">Proposed change</th><th scope="col">Submitted by</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr class="proposed-row"><td><b>' + VZ.esc(VZ.requestSummary(r)) + '</b>' + (r.reason ? '<br><small>Reason: ' + VZ.esc(r.reason) + '</small>' : '') + '</td><td>' + VZ.esc(VZ.userName(r.by)) + '</td><td class="nowrap">' + VZ.fmtDate(r.at) + '</td><td><span class="chip chip-amber">Pending Admin Approval</span></td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var list = VZ.products(true).filter(function (p) { return state.view === 'archived' ? !!p.archived : !p.archived; }).map(function (p) { return { p: p, i: VZ.info(p) }; }).filter(function (x) {
      if (q && x.p.name.toLowerCase().indexOf(q) < 0 && x.p.category.toLowerCase().indexOf(q) < 0) return false;
      if (state.cat !== 'All' && x.p.category !== state.cat) return false;
      if (state.status === 'in') return !x.i.low && !x.i.expiring && !x.i.out;
      if (state.status === 'low') return x.i.low;
      if (state.status === 'expiring') return x.i.expiring;
      if (state.status === 'out') return x.i.out;
      return true;
    });
    list.sort(function (a, b) {
      if (state.sort === 'name-desc') return b.p.name.localeCompare(a.p.name);
      if (state.sort === 'qty') return a.i.sellable - b.i.sellable || a.p.name.localeCompare(b.p.name);
      if (state.sort === 'price') return b.p.price - a.p.price || a.p.name.localeCompare(b.p.name);
      if (state.sort === 'expiry') {
        if (a.i.nextExpiry === b.i.nextExpiry) return a.p.name.localeCompare(b.p.name);
        if (!a.i.nextExpiry) return 1;
        if (!b.i.nextExpiry) return -1;
        return a.i.nextExpiry < b.i.nextExpiry ? -1 : 1;
      }
      return a.p.name.localeCompare(b.p.name);
    });
    return list;
  }

  function render() {
    statCards();
    renderProposals();
    el.tabs.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-view') === state.view)); });
    el.region.setAttribute('aria-labelledby', state.view === 'active' ? 'inv-active-tab' : 'inv-archived-tab');
    el.add.hidden = state.view === 'archived';
    var pendingBy = {};
    VZ.inventoryRequests('pending').forEach(function (r) { if (r.productId) pendingBy[r.productId] = (pendingBy[r.productId] || 0) + 1; });
    var list = filtered(), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE, slice = list.slice(start, start + PAGE_SIZE);
    if (!slice.length) {
      el.rows.innerHTML = '<tr><td colspan="7" class="empty">' + (state.view === 'archived' ? 'No archived items match your search.' : 'No items match your search. Clear the filters or add a new item.') + '</td></tr>';
    } else {
      el.rows.innerHTML = slice.map(function (x) {
        var p = x.p, i = x.i;
        var exp = i.nextExpiry ? VZ.fmtDate(i.nextExpiry) : (i.expired ? 'Expired' : 'No expiry');
        var pend = pendingBy[p.id] ? ' <span class="chip chip-grey" title="A change to this item is waiting for admin approval">Change pending</span>' : '';
        return '<tr><td><span class="item-cell"><span class="thumb" aria-hidden="true">' + p.emoji + '</span><span>' + VZ.esc(p.name) + '<br><small>' + VZ.esc(p.displayId || p.id) + '</small>' + pend + '</span></span></td>' +
          '<td>' + VZ.esc(p.category) + '</td><td class="num nowrap">' + VZ.money(p.price) + '</td><td class="num">' + i.sellable + '</td><td class="nowrap">' + exp + '</td>' +
          '<td>' + (state.view === 'archived' ? '<span class="chip chip-grey">Archived</span>' : VZ.chipsHTML(VZ.chips(i))) + '</td>' +
          '<td><span class="row-actions">' + (state.view === 'archived' ?
            '<button type="button" class="btn btn-ghost btn-sm" data-act="batches" data-id="' + p.id + '">Batches</button>' + (VZ.can('inventory.restore') ? '<button type="button" class="btn btn-sm" data-act="restore" data-id="' + p.id + '">' + VZ.icon('archive', 14) + ' Restore</button>' : '') :
            '<button type="button" class="btn btn-ghost btn-sm" data-act="restock" data-id="' + p.id + '">' + VZ.icon('plus', 14) + ' Stock</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="batches" data-id="' + p.id + '">Batches</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="manage" data-id="' + p.id + '" aria-label="Manage ' + VZ.esc(p.name) + '">Manage</button>') + '</span></td></tr>';
      }).join('');
    }
    el.showing.textContent = list.length ? 'Showing ' + (start + 1) + ' to ' + (start + slice.length) + ' of ' + list.length + ' items' : 'Showing 0 items';
    var btns = '<button type="button" data-page="' + (state.page - 1) + '" aria-label="Previous page"' + (state.page === 1 ? ' disabled' : '') + '>&lsaquo;</button>';
    for (var n = 1; n <= pages; n++) btns += '<button type="button" data-page="' + n + '"' + (n === state.page ? ' aria-current="page"' : '') + ' aria-label="Page ' + n + '">' + n + '</button>';
    btns += '<button type="button" data-page="' + (state.page + 1) + '" aria-label="Next page"' + (state.page === pages ? ' disabled' : '') + '>&rsaquo;</button>';
    el.pager.innerHTML = btns;
    VZ.refreshBell();
  }

  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (!b || b.getAttribute('data-view') === state.view) return;
    state.view = b.getAttribute('data-view');
    state.page = 1;
    state.status = 'All';
    el.status.value = 'All';
    render();
  });

  el.q.addEventListener('input', function () { state.q = el.q.value; state.page = 1; render(); });
  el.cat.addEventListener('change', function () { state.cat = el.cat.value; state.page = 1; render(); });
  el.status.addEventListener('change', function () { state.status = el.status.value; state.page = 1; render(); });
  el.sort.addEventListener('change', function () { state.sort = el.sort.value; render(); });
  el.pager.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-page]');
    if (b && !b.disabled) { state.page = +b.getAttribute('data-page'); render(); }
  });

  // What to tell the person after a change: applied now, or sent for approval.
  function done(m, r, appliedMsg, pendingMsg) {
    m.close();
    VZ.toast(r.pending ? pendingMsg : appliedMsg);
    render();
  }
  function bind(m, formSel, call, appliedMsg, pendingMsg) {
    var form = m.body.querySelector(formSel);
    var cancel = m.body.querySelector('[data-cancel]');
    if (cancel) cancel.addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = call(VZ.formData(form));
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      done(m, r, appliedMsg, pendingMsg);
    });
    return form;
  }
  var SENT = 'Sent to the admin for approval. Nothing changes until it is approved.';

  /* ---- add item ---- */
  document.getElementById('add-item').addEventListener('click', function () {
    var today = VZ.today();
    var m = VZ.modal('Add item',
      '<form id="item-form" novalidate>' + staffNote + '<div class="form-grid">' +
      '<div style="grid-column:1/-1">' + field('Item name', 'name', '<input class="input" name="name" maxlength="60" autocomplete="off">') + '</div>' +
      field('Category', 'category', '<select class="select" name="category">' + VZ.CATEGORIES.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select>') +
      field('Price (₱)', 'price', '<input class="input" name="price" type="number" min="0" step="0.01" inputmode="decimal">') +
      field('Starting stock', 'qty', '<input class="input" name="qty" type="number" min="0" step="1" value="0" inputmode="numeric">') +
      field('Low-stock level', 'reorder', '<input class="input" name="reorder" type="number" min="0" step="1" value="5" inputmode="numeric">', 'Warn me when stock falls to this number.') +
      '<div style="grid-column:1/-1">' + field('Expiry date', 'expiry', '<input class="input" name="expiry" type="date" min="' + today + '">', 'Required for medicines and vaccines. Leave empty for items that do not expire.') + '</div>' +
      '<div style="grid-column:1/-1">' + reasonField(false) + '</div>' +
      '</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + (isAdmin ? 'Save item' : 'Send for approval') + '</button></div></form>');
    bind(m, 'form', function (d) { return VZ.addProduct(d); }, 'Item added.', SENT);
  });

  /* ---- row actions ---- */
  el.rows.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var p = VZ.findProduct(b.getAttribute('data-id'));
    if (!p) return;
    var act = b.getAttribute('data-act');
    if (act === 'restore') restore(p);
    else if (act === 'restock') restock(p);
    else if (act === 'batches') batches(p);
    else if (act === 'manage') manage(p);
  });

  function manage(p) {
    var m = VZ.modal('Manage: ' + p.name,
      '<p class="caption" style="margin-top:0">Current stock: <b>' + VZ.info(p).sellable + '</b>. ' + (isAdmin ? 'Changes you make here are applied at once.' : 'Changes are sent to the admin for approval.') + '</p>' +
      '<div class="manage-list"><button type="button" class="btn btn-ghost btn-block" data-do="edit">' + VZ.icon('edit', 18) + ' Edit item details</button>' +
      '<button type="button" class="btn btn-ghost btn-block" data-do="correct">' + VZ.icon('alert', 18) + ' Correct the stock count</button>' +
      (VZ.can('inventory.archive') ? '<button type="button" class="btn btn-ghost btn-block" data-do="archive">' + VZ.icon('archive', 18) + ' Archive this item</button>' : '') + '</div>' +
      '<div class="modal-actions"><button type="button" class="btn" data-cancel>Close</button></div>');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.body.querySelectorAll('[data-do]').forEach(function (b) {
      b.addEventListener('click', function () {
        var what = b.getAttribute('data-do');
        m.close();
        if (what === 'edit') editItem(p); else if (what === 'correct') correctStock(p); else archive(p);
      });
    });
  }

  function restore(p) {
    VZ.confirm('Restore archived item', 'Restore "' + p.name + '" to active inventory? Check the stock batches and expiration dates before selling it.', 'Restore', false).then(function (yes) {
      if (!yes) return;
      var r = VZ.restoreProduct(p.id);
      if (r.ok) { VZ.toast(p.name + ' was restored. Review its stock and expiry dates.'); render(); }
      else VZ.toast(r.error || 'Could not restore this item.', 'error');
    });
  }

  function archive(p) {
    VZ.confirm('Archive item', 'Archive "' + p.name + '"? It will be hidden from inventory and sales. Past sales stay in the reports.', 'Archive', true).then(function (yes) {
      if (!yes) return;
      var r = VZ.archiveProduct(p.id);
      if (r.ok) { VZ.toast(p.name + ' was archived.'); render(); } else VZ.toast(r.error || 'Could not archive this item.', 'error');
    });
  }

  function editItem(p) {
    var m = VZ.modal('Edit item: ' + p.name,
      '<form id="edit-form" novalidate>' + staffNote + '<div class="form-grid">' +
      '<div style="grid-column:1/-1">' + field('Item name', 'name', '<input class="input" name="name" maxlength="60" autocomplete="off" value="' + VZ.esc(p.name) + '">') + '</div>' +
      field('Category', 'category', '<select class="select" name="category">' + VZ.CATEGORIES.map(function (c) { return '<option' + (c === p.category ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>') +
      field('Price (₱)', 'price', '<input class="input" name="price" type="number" min="0" step="0.01" inputmode="decimal" value="' + p.price + '">') +
      field('Low-stock level', 'reorder', '<input class="input" name="reorder" type="number" min="0" step="1" inputmode="numeric" value="' + p.reorder + '">', 'Warn me when stock falls to this number.') + '<span></span>' +
      '<div style="grid-column:1/-1">' + reasonField(false) + '</div>' +
      '</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + (isAdmin ? 'Save changes' : 'Send for approval') + '</button></div></form>');
    bind(m, 'form', function (d) { return VZ.updateProduct(p.id, d); }, 'Item details saved.', SENT);
  }

  function correctStock(p) {
    var cur = VZ.info(p).sellable, today = VZ.today(), needs = VZ.EXPIRY_REQUIRED.indexOf(p.category) >= 0;
    var m = VZ.modal('Correct stock: ' + p.name,
      '<form id="correct-form" novalidate>' + staffNote +
      '<p class="note">The system shows <b>' + cur + '</b> in stock. Enter how many to add (for example 5) or remove (for example -3), such as for damaged items or a miscount.</p><div class="form-grid">' +
      field('Change in quantity', 'delta', '<input class="input" name="delta" type="number" step="1" inputmode="numeric">') +
      field('Expiry date (only when adding)', 'expiry', '<input class="input" name="expiry" type="date" min="' + today + '">', needs ? 'Required when adding ' + p.category.toLowerCase() + ' stock.' : 'Leave empty if the item does not expire.') +
      '<div style="grid-column:1/-1">' + reasonField(true) + '</div>' +
      '</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + (isAdmin ? 'Save correction' : 'Send for approval') + '</button></div></form>');
    bind(m, 'form', function (d) { return VZ.correctStock(p.id, d); }, 'Stock corrected.', SENT);
  }

  function restock(p) {
    var today = VZ.today(), needs = VZ.EXPIRY_REQUIRED.indexOf(p.category) >= 0;
    var m = VZ.modal('Add stock: ' + p.name,
      '<form id="stock-form" novalidate>' + staffNote + '<p class="note">Each delivery is saved as its own batch, so every batch keeps its own expiry date. Current stock: <b>' + VZ.info(p).sellable + '</b>.</p>' +
      field('Quantity received', 'qty', '<input class="input" name="qty" type="number" min="1" step="1" inputmode="numeric">') +
      field('Expiry date', 'expiry', '<input class="input" name="expiry" type="date" min="' + today + '">', needs ? 'Required for ' + p.category.toLowerCase() + ' items.' : 'Leave empty if this item does not expire.') +
      reasonField(false) +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">' + (isAdmin ? 'Save stock' : 'Send for approval') + '</button></div></form>');
    bind(m, 'form', function (d) { return VZ.restock(p.id, d); }, 'Stock added for ' + p.name + '.', SENT);
  }

  function batches(p) {
    var today = VZ.today();
    var list = VZ.db.batches.filter(function (b) { return b.productId === p.id && b.qty > 0; }).sort(function (a, b) {
      if (a.expiry === b.expiry) return 0; if (!a.expiry) return 1; if (!b.expiry) return -1; return a.expiry < b.expiry ? -1 : 1;
    });
    var body = list.length ? '<div class="table-wrap"><table class="table" style="min-width:0"><thead><tr><th>Quantity</th><th>Expiry</th><th>Received</th><th>State</th></tr></thead><tbody>' +
      list.map(function (b) {
        var state;
        if (b.expiry && b.expiry < today) state = '<span class="chip chip-red">Expired</span>';
        else if (b.expiry && VZ.diffDays(today, b.expiry) <= VZ.EXPIRY_DAYS) state = '<span class="chip chip-amber">Expires in ' + VZ.diffDays(today, b.expiry) + ' day(s)</span>';
        else state = '<span class="chip chip-green">Good</span>';
        return '<tr><td>' + b.qty + '</td><td>' + (b.expiry ? VZ.fmtDate(b.expiry) : 'No expiry') + '</td><td>' + VZ.fmtDate(b.received) + '</td><td>' + state + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="caption">Sales take stock from the batch that expires first. Expired batches cannot be sold.</p>' :
      '<p class="empty">There is no stock for this item yet.</p>';
    var m = VZ.modal('Batches: ' + p.name, body + '<div class="modal-actions"><button type="button" class="btn" data-cancel>Close</button></div>');
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  render();
})();
