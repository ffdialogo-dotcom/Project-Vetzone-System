/* Top sellers: only the best-selling products, ranked, with quantity sold and total sales */
(function () {
  'use strict';
  var ctx = VZ.init('dashboard', { title: 'Top sellers', subtitle: 'Best-selling products ranked by sales performance.', icon: 'star' });
  if (!ctx) return;
  var main = ctx.main, today = VZ.today();
  var LIMIT = 10;
  var state = { days: 30, by: 'qty' };

  function render() {
    var from = VZ.addDays(today, -(state.days - 1));
    var list = VZ.topSellers(from, today, state.by).slice(0, LIMIT);
    var rows = list.map(function (x, i) {
      return '<tr><td><span class="rank rank-' + (i + 1) + '" aria-label="Rank ' + (i + 1) + '">' + (i + 1) + '</span></td>' +
        '<td><span class="item-cell"><span class="thumb" aria-hidden="true">' + x.emoji + '</span>' + VZ.esc(x.name) + '</span></td>' +
        '<td class="num">' + x.qty + '</td><td class="num"><b>' + VZ.money(x.total) + '</b></td></tr>';
    }).join('');
    document.getElementById('top-heading').textContent = 'Top ' + LIMIT + ' products, last ' + state.days + ' days';
    document.getElementById('top-rows').innerHTML = rows;
    document.getElementById('top-table').hidden = !list.length;
    document.getElementById('top-caption').hidden = !list.length;
    document.getElementById('top-empty').hidden = !!list.length;
    document.getElementById('top-caption').textContent = 'Ranked by ' + (state.by === 'qty' ? 'quantity sold, then total sales' : 'total sales, then quantity sold') + '. Total sales are after discounts.';
    main.querySelectorAll('[data-days]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-days') === state.days)); });
    main.querySelectorAll('[data-by]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-by') === state.by)); });
    main.querySelectorAll('[data-days]').forEach(function (b) {
      b.addEventListener('click', function () { state.days = +b.getAttribute('data-days'); render(); });
    });
    main.querySelectorAll('[data-by]').forEach(function (b) {
      b.addEventListener('click', function () { state.by = b.getAttribute('data-by'); render(); });
    });
  }
  render();
})();
