/* Internal sales recording: select products, quantities, discounts, and payment method.
   This is not a receipt-issuing POS. Stock is deducted when a sale is recorded. */
(function () {
  'use strict';
  var ctx = VZ.init('sales', { title: 'Record sales', subtitle: 'Pick items, check the total, and record the payment.', icon: 'cart' });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;
  var state = { q: '', cat: 'All', cart: [], catalog: 'products', method: '', discount: '' };

  // The page's static layout lives in sales.html. JavaScript handles behavior and data.
  if (!main.children.length) {
    // Fallback for older HTML copies.
    main.innerHTML = '<div class="pos"><section aria-label="Items for sale"><div class="toolbar">' +
    '<label class="search">' + VZ.icon('search', 18) + '<span class="sr-only">Search items</span><input id="q" type="search" placeholder="Search items"></label></div>' +
    '<div class="chip-row" id="cats" role="group" aria-label="Category"></div><div class="product-grid" id="grid"></div></section>' +
    '<aside class="card order" aria-label="Current order"><h2>Current order <span class="chip chip-grey" id="count">0 items</span></h2>' +
    '<div id="cart-wrap"></div>' +
    '<form id="pay-form" novalidate><fieldset><legend>Payment method</legend>' +
    '<label class="radio"><input type="radio" name="method" value="Cash"> Cash</label>' +
    '<label class="radio"><input type="radio" name="method" value="Online payment"> Online payment</label>' +
    '<small class="hint caption">Online payment only marks how the customer paid. The system does not process payments.</small></fieldset>' +
    '<div class="totals"><div><span>Subtotal</span><b id="sub"></b></div>' +
    '<div><label for="disc">Discount (%)</label><input class="input" id="disc" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="0"></div>' +
    '<div><span>Discount amount</span><span id="disc-amt"></span></div>' +
    '<div class="grand"><span>Total</span><span id="total"></span></div></div>' +
    '<div class="form-error" id="pay-error" role="alert" hidden style="margin-top:10px"></div>' +
    '<button class="btn btn-block" type="submit" id="pay-btn" style="margin-top:12px">Review sale</button></form></aside></div>';
  }
  main.querySelectorAll('[data-icon]').forEach(function (node) {
    node.outerHTML = VZ.icon(node.getAttribute('data-icon'), Number(node.getAttribute('data-size')) || 18);
  });

  var el = { q: document.getElementById('q'), cats: document.getElementById('cats'), grid: document.getElementById('grid'), wrap: document.getElementById('cart-wrap'),
    count: document.getElementById('count'), sub: document.getElementById('sub'), disc: document.getElementById('disc'), discAmt: document.getElementById('disc-amt'),
    total: document.getElementById('total'), err: document.getElementById('pay-error'), form: document.getElementById('pay-form') };

  function renderCats() {
    el.cats.innerHTML = (state.catalog === 'services' ? ['All'] : ['All'].concat(VZ.CATEGORIES)).map(function (c) {
      return '<button type="button" class="cat-chip" data-cat="' + c + '" aria-pressed="' + (state.cat === c) + '">' + c + '</button>';
    }).join('');
  }

  function cartQty(id) {
    var l = state.cart.filter(function (x) { return x.productId === id; })[0];
    return l ? l.qty : 0;
  }

  function renderGrid() {
    var q = state.q.trim().toLowerCase();
    var list = (state.catalog === 'services' ? VZ.db.services.filter(function (s) { return s.active; }).map(function (s) { return VZ.findBillable(s.id); }) : VZ.products()).filter(function (p) {
      return (state.cat === 'All' || p.category === state.cat) && (!q || p.name.toLowerCase().indexOf(q) >= 0 || (p.displayId || '').toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) { el.grid.innerHTML = '<p class="empty" style="grid-column:1/-1">No items match your search.</p>'; return; }
    el.grid.innerHTML = list.map(function (p) {
      var i = p.isService ? { sellable: 1000, out: false, low: false } : VZ.info(p), inCart = cartQty(p.id), left = i.sellable - inCart;
      var stockCls = i.out ? 'none' : i.low ? 'low' : '';
      var stockText = p.isService ? 'Clinic service' : i.out ? 'Out of stock' : (i.low ? 'Low: ' : 'In stock: ') + i.sellable;
      var tag = i.soon ? '<span class="chip chip-amber">Expiring</span>' : '';
      return '<div class="product"><div class="pic" aria-hidden="true">' + tag + p.emoji + '</div><h3>' + VZ.esc(p.name) + '</h3>' +
        '<small class="item-code">Item code: ' + VZ.esc(p.displayId || p.id) + '</small>' +
        '<span class="chip chip-grey" style="align-self:flex-start">' + VZ.esc(p.category) + '</span>' +
        '<span class="price">' + VZ.money(p.price) + '</span><span class="stock ' + stockCls + '">' + stockText + '</span>' +
        '<button type="button" class="btn btn-sm btn-block" data-add="' + p.id + '"' + (left <= 0 ? ' disabled' : '') + ' aria-label="Add ' + VZ.esc(p.name) + ' to order">' + VZ.icon('cart', 16) + ' ' + (i.out ? 'Unavailable' : left <= 0 ? 'All in order' : 'Add to order') + '</button></div>';
    }).join('');
  }

  function lines() {
    return state.cart.map(function (c) {
      var p = VZ.findBillable(c.productId);
      return { productId: c.productId, name: p.name, price: p.price, qty: c.qty, emoji: p.emoji, max: p.isService ? 1000 : VZ.info(p).sellable };
    });
  }

  function renderCart() {
    var ls = lines(), n = 0;
    ls.forEach(function (l) { n += l.qty; });
    el.count.textContent = n + (n === 1 ? ' item' : ' items');
    if (!ls.length) {
      el.wrap.innerHTML = '<p class="empty">The order is empty. Choose an item from the list.</p>';
    } else {
      el.wrap.innerHTML = '<ul class="cart">' + ls.map(function (l) {
        return '<li><span class="thumb" aria-hidden="true">' + l.emoji + '</span><div><div class="nm">' + VZ.esc(l.name) + '</div><div class="qty">' +
          '<button type="button" data-dec="' + l.productId + '" aria-label="Decrease quantity of ' + VZ.esc(l.name) + '">' + VZ.icon('minus', 14) + '</button><output aria-label="Quantity">' + l.qty + '</output>' +
          '<button type="button" data-inc="' + l.productId + '" aria-label="Increase quantity of ' + VZ.esc(l.name) + '"' + (l.qty >= l.max ? ' disabled' : '') + '>' + VZ.icon('plus', 14) + '</button></div></div>' +
          '<div class="line-right"><div class="pr">' + VZ.money(l.price * l.qty) + '</div><button type="button" class="btn btn-ghost btn-sm remove" data-del="' + l.productId + '" aria-label="Remove ' + VZ.esc(l.name) + '">' + VZ.icon('trash', 14) + '</button></div></li>';
      }).join('') + '</ul>';
    }
    totals();
  }

  function totals() {
    var t = VZ.cartTotals(lines(), el.disc.value);
    el.sub.textContent = VZ.money(t.subtotal);
    el.discAmt.textContent = '- ' + VZ.money(t.discount);
    el.total.textContent = VZ.money(t.total);
  }

  function refresh() { renderGrid(); renderCart(); }

  el.q.addEventListener('input', function () { state.q = el.q.value; renderGrid(); });
  el.cats.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (b) { state.cat = b.getAttribute('data-cat'); renderCats(); renderGrid(); }
  });
  el.grid.addEventListener('click', function (e) {
    var b = e.target.closest('[data-add]');
    if (!b) return;
    var id = b.getAttribute('data-add'), p = VZ.findBillable(id), left = (p.isService ? 1000 : VZ.info(p).sellable) - cartQty(id);
    if (left <= 0) return;
    var l = state.cart.filter(function (x) { return x.productId === id; })[0];
    if (l) l.qty++; else state.cart.push({ productId: id, qty: 1 });
    el.err.hidden = true;
    refresh();
  });
  el.wrap.addEventListener('click', function (e) {
    var inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), del = e.target.closest('[data-del]');
    var btn = inc || dec || del;
    if (!btn) return;
    var id = btn.getAttribute(inc ? 'data-inc' : dec ? 'data-dec' : 'data-del');
    var l = state.cart.filter(function (x) { return x.productId === id; })[0];
    if (!l) return;
    if (inc && l.qty < (VZ.findBillable(id).isService ? 1000 : VZ.info(VZ.findBillable(id)).sellable)) l.qty++;
    if (dec) l.qty--;
    if (del || l.qty <= 0) state.cart = state.cart.filter(function (x) { return x.productId !== id; });
    refresh();
  });
  el.disc.addEventListener('input', totals);

  function showRecorded(s) {
    var m = VZ.modal('Sale recorded',
      '<p><b>Sale ' + VZ.esc(s.no) + '</b> was saved and stock was updated.</p><ul class="receipt-list">' +
      s.items.map(function (l) { return '<li><span>' + l.qty + ' x ' + VZ.esc(l.name) + '</span><span>' + VZ.money(l.price * l.qty) + '</span></li>'; }).join('') +
      '</ul><ul class="receipt-list"><li><span>Subtotal</span><span>' + VZ.money(s.subtotal) + '</span></li>' +
      (s.discount ? '<li><span>Discount (' + s.discountPct + '%)</span><span>- ' + VZ.money(s.discount) + '</span></li>' : '') +
      '<li><b>Total</b><b>' + VZ.money(s.total) + '</b></li><li><span>Paid by</span><span>' + VZ.esc(s.method) + '</span></li>' +
      (s.method === 'Cash' ? '<li><span>Cash received</span><span>' + VZ.money(s.cashReceived) + '</span></li><li><b>Customer change</b><b id="recorded-change">' + VZ.money(s.change) + '</b></li>' : '') + '</ul>' +
      '<p class="note">This is an internal sales record. It is not an official receipt.</p>' +
      '<div class="modal-actions"><button type="button" class="btn" data-done>Start a new sale</button></div>');
    m.body.querySelector('[data-done]').addEventListener('click', m.close);
  }

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    el.err.hidden = true;
    var picked = el.form.querySelector('input[name="method"]:checked');
    var cart = state.cart.map(function (l) { return { productId: l.productId, qty: l.qty }; });
    var prepared = VZ.prepareSale(cart, el.disc.value, picked ? picked.value : '');
    if (!prepared.ok) { el.err.textContent = prepared.error; el.err.hidden = false; refresh(); return; }
    var t = prepared.totals, isCash = prepared.method === 'Cash';
    var m = VZ.modal('Confirm sale record', '<form id="confirm-sale-form" novalidate>' +
      '<p class="caption">Check the items and payment before recording this sale.</p><ul class="receipt-list">' +
      prepared.lines.map(function (l) { return '<li><span>' + l.qty + ' x ' + VZ.esc(l.name) + '</span><span>' + VZ.money(l.price * l.qty) + '</span></li>'; }).join('') +
      '</ul><ul class="receipt-list"><li><span>Subtotal</span><span>' + VZ.money(t.subtotal) + '</span></li>' +
      '<li><span>Discount (' + prepared.discountPct + '%)</span><span>- ' + VZ.money(t.discount) + '</span></li>' +
      '<li><b>Total</b><b id="confirmation-total">' + VZ.money(t.total) + '</b></li>' +
      '<li><span>Payment method</span><span>' + VZ.esc(prepared.method) + '</span></li></ul>' +
      (isCash ? VZ.field('Cash received from customer', 'cashReceived', '<input class="input" id="cash-received" name="cashReceived" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00">') +
        '<div class="change-summary"><span>Customer change</span><strong id="change-due" aria-live="polite">—</strong></div>' :
        '<p class="note">Confirm that the online payment has been received.</p>') +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-back>Back to order</button><button type="submit" class="btn" id="confirm-sale">Confirm and record sale</button></div></form>');
    var form = m.body.querySelector('form'), busy = false;
    m.body.querySelector('[data-back]').addEventListener('click', m.close);
    if (isCash) {
      form.elements.cashReceived.addEventListener('input', function () {
        var payment = VZ.cashPayment(t.total, form.elements.cashReceived.value);
        m.body.querySelector('#change-due').textContent = payment.ok ? VZ.money(payment.change) : '—';
      });
    }
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      busy = true;
      var options = { expectedTotal: t.total, cashReceived: isCash ? form.elements.cashReceived.value : null };
      var r = VZ.recordSale(cart, prepared.discountPct, prepared.method, options);
      if (!r.ok) { busy = false; VZ.showFormError(form, r.error); return; }
      form.querySelector('#confirm-sale').disabled = true;
      m.close();
      state.cart = [];
      el.disc.value = '';
      Array.prototype.forEach.call(el.form.querySelectorAll('input[name="method"]'), function (x) { x.checked = false; });
      refresh();
      VZ.refreshBell();
      showRecorded(r.sale);
    });
  });

  var view = 'record', historyPage = 1, secondary = document.getElementById('sales-secondary-panel');
  document.getElementById('service-admin-tab').hidden = !VZ.can('users.manage');
  function renderView() {
    document.querySelectorAll('[data-sales-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.salesTab === view)); });
    document.getElementById('sales-record-panel').hidden = view !== 'record'; secondary.hidden = view === 'record';
    if (view === 'history') {
      var sales = VZ.visibleSales();
      secondary.innerHTML = '<div class="card-head"><h2>Sales history</h2><span class="caption">Original records are retained after reversal.</span></div>' + VZ.ui.table(sales, ['Sale', 'Date', 'Payment', 'Total', 'Status', 'Action'], function (s) {
        var pending = VZ.db.workflowRequests.some(function (r) { return r.kind === 'reversal' && r.status === 'pending' && r.payload.saleId === s.id; });
        return '<tr><td><b>' + VZ.esc(s.no) + '</b></td><td>' + VZ.fmtDate(s.ts.slice(0, 10)) + '</td><td>' + VZ.esc(s.method) + '</td><td>' + VZ.money(s.total) + '</td><td><span class="chip ' + (s.status === 'voided' ? 'chip-grey' : pending ? 'chip-amber' : 'chip-green') + '">' + (s.status === 'voided' ? 'Reversed' : pending ? 'Pending review' : 'Recorded') + '</span></td><td><button type="button" class="btn btn-ghost btn-sm" data-sale-view="' + s.id + '">View</button></td></tr>';
      }, historyPage);
    } else if (view === 'services') {
      secondary.innerHTML = '<div class="card-head"><h2>Service prices</h2><button type="button" class="btn btn-sm" data-service-add>Add service</button></div><p class="caption">Sample prices can be edited for your clinic.</p>' + VZ.ui.table(VZ.db.services, ['Code', 'Service', 'Price', 'Status', 'Action'], function (s) { return '<tr><td>' + VZ.esc(s.displayId) + '</td><td>' + VZ.esc(s.name) + '</td><td>' + VZ.money(s.price) + '</td><td>' + (s.active ? 'Available' : 'Unavailable') + '</td><td><button type="button" class="btn btn-ghost btn-sm" data-service-edit="' + s.id + '">Edit</button></td></tr>'; }, historyPage);
    }
  }
  document.querySelectorAll('[data-sales-tab]').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.salesTab; historyPage = 1; renderView(); }); });
  document.querySelectorAll('[data-catalog]').forEach(function (b) { b.addEventListener('click', function () { state.catalog = b.dataset.catalog; state.cat = 'All'; document.querySelectorAll('[data-catalog]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderCats(); renderGrid(); }); });
  secondary.addEventListener('click', function (event) {
    var b = event.target.closest('button'); if (!b) return;
    if (b.dataset.page) { historyPage = Number(b.dataset.page); renderView(); }
    if (b.hasAttribute('data-service-add')) VZ.ui.service(null, renderView);
    if (b.dataset.serviceEdit) VZ.ui.service(VZ.db.services.filter(function (s) { return s.id === b.dataset.serviceEdit; })[0], renderView);
    if (b.dataset.saleView) {
      var sale = VZ.db.sales.filter(function (s) { return s.id === b.dataset.saleView; })[0];
      var pending = VZ.db.workflowRequests.some(function (r) { return r.kind === 'reversal' && r.status === 'pending' && r.payload.saleId === sale.id; });
      var m = VZ.modal('Sale ' + sale.no, '<ul class="receipt-list">' + sale.items.map(function (l) { return '<li><span>' + l.qty + ' × ' + VZ.esc(l.name) + '</span><span>' + VZ.money(l.price * l.qty) + '</span></li>'; }).join('') + '</ul><p><b>Total: ' + VZ.money(sale.total) + '</b> · ' + VZ.esc(sale.method) + '</p><div class="modal-actions">' + (sale.status !== 'voided' && !pending ? '<button type="button" class="btn btn-danger" data-reverse-sale>Reverse entire sale</button>' : '') + '<button type="button" class="btn" data-close-sale>Close</button></div>');
      m.body.querySelector('[data-close-sale]').addEventListener('click', m.close);
      var reverse = m.body.querySelector('[data-reverse-sale]'); if (reverse) reverse.addEventListener('click', function () { m.close(); VZ.ui.reversal(sale, renderView); });
    }
  });
  renderView();

  renderCats();
  refresh();
})();
