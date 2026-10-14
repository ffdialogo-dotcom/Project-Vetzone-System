/* Income report: daily, weekly, and monthly totals built from recorded sales (admin only) */
(function () {
  'use strict';
  var ctx = VZ.init('income', { title: 'Income report', subtitle: 'Totals built from every recorded sale.', icon: 'chart', roles: ['admin'] });
  if (!ctx) return;
  var main = ctx.main, today = VZ.today(), mode = 'daily';

  function shortDate(s) { return VZ.parse(s).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }

  function periods(kind) {
    var out = [], i, from, to;
    if (kind === 'daily') {
      for (i = 0; i < 14; i++) {
        from = to = VZ.addDays(today, -i);
        out.push({ label: VZ.parse(from).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), from: from, to: to, now: i === 0 });
      }
    } else if (kind === 'weekly') {
      var ws = VZ.weekStart(today);
      for (i = 0; i < 8; i++) {
        from = VZ.addDays(ws, -7 * i);
        to = VZ.addDays(from, 6);
        out.push({ label: shortDate(from) + ' to ' + shortDate(to) + ', ' + VZ.parse(to).getFullYear(), from: from, to: to, now: i === 0 });
      }
    } else {
      var d = VZ.parse(today);
      for (i = 0; i < 6; i++) {
        var first = new Date(d.getFullYear(), d.getMonth() - i, 1), last = new Date(d.getFullYear(), d.getMonth() - i + 1, 0);
        out.push({ label: first.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }), from: VZ.dstr(first), to: VZ.dstr(last), now: i === 0 });
      }
    }
    return out;
  }

  function render() {
    var ps = periods(mode), rows = ps.map(function (p) { return { p: p, a: VZ.aggregate(VZ.salesBetween(p.from, p.to)) }; });
    var sum = VZ.aggregate(VZ.salesBetween(ps[ps.length - 1].from, ps[0].to));
    var todayA = VZ.aggregate(VZ.salesBetween(today, today));
    var weekA = VZ.aggregate(VZ.salesBetween(VZ.weekStart(today), today));
    var monthA = VZ.aggregate(VZ.salesBetween(today.slice(0, 8) + '01', today));
    function card(cls, title, a, sub) {
      return '<div class="stat ' + cls + '"><span class="stat-top">' + title + '</span><span class="stat-num sm">' + VZ.money(a.net) + '</span><span class="stat-sub">' + a.n + ' sale' + (a.n === 1 ? '' : 's') + sub + '</span></div>';
    }
    var unit = mode === 'daily' ? 'last 14 days' : mode === 'weekly' ? 'last 8 weeks' : 'last 6 months';
    document.getElementById('income-stats').innerHTML = card('stat-green', 'Today', todayA, '') + card('stat-pink', 'This week', weekA, ' since Monday') + card('stat-plain', 'This month', monthA, ' so far');
    document.getElementById('income-description').textContent = 'Showing the ' + unit + '. Net income is the total after discounts. Online payment only means the customer paid that way.';
    document.getElementById('income-table-caption').textContent = mode + ' income report';
    main.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-mode') === mode)); });
    document.getElementById('income-rows').innerHTML = rows.map(function (r) {
      return '<tr><td>' + VZ.esc(r.p.label) + (r.p.now ? ' <span class="tag-now">(' + (mode === 'daily' ? 'today' : mode === 'weekly' ? 'this week' : 'this month') + ')</span>' : '') + '</td><td class="num">' + r.a.n + '</td><td class="num">' + r.a.items + '</td><td class="num">' + VZ.money(r.a.gross) + '</td><td class="num">' + VZ.money(r.a.discount) + '</td><td class="num"><b>' + VZ.money(r.a.net) + '</b></td><td class="num">' + VZ.money(r.a.cash) + '</td><td class="num">' + VZ.money(r.a.online) + '</td></tr>';
    }).join('');
    document.getElementById('income-total').innerHTML = '<tr><td>Total</td><td class="num">' + sum.n + '</td><td class="num">' + sum.items + '</td><td class="num">' + VZ.money(sum.gross) + '</td><td class="num">' + VZ.money(sum.discount) + '</td><td class="num">' + VZ.money(sum.net) + '</td><td class="num">' + VZ.money(sum.cash) + '</td><td class="num">' + VZ.money(sum.online) + '</td></tr>';
    main.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { mode = b.getAttribute('data-mode'); render(); });
    });
    document.getElementById('print').addEventListener('click', function () { window.print(); });
  }
  render();
})();
