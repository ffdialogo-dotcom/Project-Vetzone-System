/* Internal sales recording: select products, quantities, discounts, and payment method.
   This is not a receipt-issuing POS. Stock is deducted when a sale is recorded. */
(function () {
  'use strict';
  var ctx = VZ.init('sales', { title: 'Record sales', subtitle: 'Pick items, check the total, and record the payment.', icon: 'cart' });
  if (!ctx) return;
  var user = ctx.user, main = ctx.main;
  var state = { q: '', cat: 'All', cart: [], method: '', discount: '' };

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
    '<button class="btn btn-block" type="submit" id="pay-btn" style="margin-top:12px">Record payment</button></form></aside></div>';
  }
  main.querySelectorAll('[data-icon]').forEach(function (node) {
    node.outerHTML = VZ.icon(node.getAttribute('data-icon'), Number(node.getAttribute('data-size')) || 18);
  });

  var el = { q: document.getElementById('q'), cats: document.getElementById('cats'), grid: document.getElementById('grid'), wrap: document.getElementById('cart-wrap'),
    count: document.getElementById('count'), sub: document.getElementById('sub'), disc: document.getElementById('disc'), discAmt: document.getElementById('disc-amt'),
    total: document.getElementById('total'), err: document.getElementById('pay-error'), form: document.getElementById('pay-form') };

  function renderCats() {
    el.cats.innerHTML = ['All'].concat(VZ.CATEGORIES).map(function (c) {
      return '<button type="button" class="cat-chip" data-cat="' + c + '" aria-pressed="' + (state.cat === c) + '">' + c + '</button>';
    }).join('');
  }

  function cartQty(id) {
    var l = state.cart.filter(function (x) { return x.productId === id; })[0];
    return l ? l.qty : 0;
  }

  function renderGrid() {
    var q = state.q.trim().toLowerCase();
    var list = VZ.products().filter(function (p) {
      return (state.cat === 'All' || p.category === state.cat) && (!q || p.name.toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) { el.grid.innerHTML = '<p class="empty" style="grid-column:1/-1">No items match your search.</p>'; return; }
    el.grid.innerHTML = list.map(function (p) {
      var i = VZ.info(p), inCart = cartQty(p.id), left = i.sellable - inCart;
      var stockCls = i.out ? 'none' : i.low ? 'low' : '';
      var stockText = i.out ? 'Out of stock' : (i.low ? 'Low: ' : 'In stock: ') + i.sellable;
      var tag = i.soon ? '<span class="chip chip-amber">Expiring</span>' : '';
      return '<div class="product"><div class="pic" aria-hidden="true">' + tag + p.emoji + '</div><h3>' + VZ.esc(p.name) + '</h3>' +
        '<span class="chip chip-grey" style="align-self:flex-start">' + VZ.esc(p.category) + '</span>' +
        '<span class="price">' + VZ.money(p.price) + '</span><span class="stock ' + stockCls + '">' + stockText + '</span>' +
        '<button type="button" class="btn btn-sm btn-block" data-add="' + p.id + '"' + (left <= 0 ? ' disabled' : '') + ' aria-label="Add ' + VZ.esc(p.name) + ' to order">' + VZ.icon('cart', 16) + ' ' + (i.out ? 'Unavailable' : left <= 0 ? 'All in order' : 'Add to order') + '</button></div>';
    }).join('');
  }

  function lines() {
    return state.cart.map(function (c) {
      var p = VZ.findProduct(c.productId);
      return { productId: c.productId, name: p.name, price: p.price, qty: c.qty, emoji: p.emoji, max: VZ.info(p).sellable };
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
    var id = b.getAttribute('data-add'), p = VZ.findProduct(id), left = VZ.info(p).sellable - cartQty(id);
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
    if (inc && l.qty < VZ.info(VZ.findProduct(id)).sellable) l.qty++;
    if (dec) l.qty--;
    if (del || l.qty <= 0) state.cart = state.cart.filter(function (x) { return x.productId !== id; });
    refresh();
  });
  el.disc.addEventListener('input', totals);

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    el.err.hidden = true;
    var picked = el.form.querySelector('input[name="method"]:checked');
    var r = VZ.recordSale(state.cart, el.disc.value, picked ? picked.value : '', user);
    if (!r.ok) { el.err.textContent = r.error; el.err.hidden = false; refresh(); return; }
    var s = r.sale;
    state.cart = [];
    el.disc.value = '';
    Array.prototype.forEach.call(el.form.querySelectorAll('input[name="method"]'), function (x) { x.checked = false; });
    refresh();
    VZ.refreshBell();
    var m = VZ.modal('Payment recorded',
      '<p><b>Sale ' + VZ.esc(s.no) + '</b> was saved and stock was updated.</p><ul class="receipt-list">' +
      s.items.map(function (l) { return '<li><span>' + l.qty + ' x ' + VZ.esc(l.name) + '</span><span>' + VZ.money(l.price * l.qty) + '</span></li>'; }).join('') +
      '</ul><ul class="receipt-list"><li><span>Subtotal</span><span>' + VZ.money(s.subtotal) + '</span></li>' +
      (s.discount ? '<li><span>Discount (' + s.discountPct + '%)</span><span>- ' + VZ.money(s.discount) + '</span></li>' : '') +
      '<li><b>Total</b><b>' + VZ.money(s.total) + '</b></li><li><span>Paid by</span><span>' + VZ.esc(s.method) + '</span></li></ul>' +
      '<p class="note">This is an internal sales record. It is not an official receipt.</p>' +
      '<div class="modal-actions"><button type="button" class="btn" data-done>Start a new sale</button></div>');
    m.body.querySelector('[data-done]').addEventListener('click', m.close);
  });

  renderCats();
  refresh();
})();
