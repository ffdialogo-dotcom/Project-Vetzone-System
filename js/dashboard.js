/* Dashboard: live counts from the stored data */
(function () {
  'use strict';
  var ctx = VZ.init('dashboard', { title: 'Dashboard', subtitle: 'Here is what is happening at VetZone today.', icon: 'grid' });
  if (!ctx) return;
  var user = ctx.user, isAdmin = user.role === 'admin', main = ctx.main;
  var today = VZ.today();

  var infos = VZ.products().map(function (p) { return { p: p, i: VZ.info(p) }; });
  var lowCount = infos.filter(function (x) { return x.i.low; }).length;
  var expCount = infos.filter(function (x) { return x.i.expiring; }).length;
  var part = { in: 0, low: 0, expiring: 0, out: 0 };
  infos.forEach(function (x) { part[x.i.primary]++; });

  var todayAgg = VZ.aggregate(VZ.salesBetween(today, today));

  // Top seller over the last 30 days (same ranking as the Top sellers page)
  var top = VZ.topSellers(VZ.addDays(today, -29), today, 'qty')[0] || null;

  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  var firstName = user.name.split(' ')[0];

  function stat(cls, icon, title, num, sub, href, small, linkText) {
    return '<a class="stat ' + cls + '" href="' + href + '"><span class="stat-top"><span class="stat-ico">' + VZ.icon(icon, 22) + '</span>' + VZ.esc(title) + '</span>' +
      '<span class="stat-num' + (small ? ' sm' : '') + '">' + num + '</span><span class="stat-sub">' + sub + '</span>' +
      '<span class="stat-link">' + (linkText || 'View') + ' ' + VZ.icon('arrow', 16) + '</span></a>';
  }
  var cards = stat('stat-amber', 'box', 'Low stock', lowCount, lowCount === 1 ? 'item is running low' : 'items are running low', 'inventory.html?status=low') +
    stat('stat-red', 'calendar', 'Expiring', expCount, expCount === 1 ? 'item expires within ' + VZ.EXPIRY_DAYS + ' days or is expired' : 'items expire within ' + VZ.EXPIRY_DAYS + ' days or are expired', 'inventory.html?status=expiring') +
    stat('stat-pink', 'star', 'Top seller', top ? VZ.esc(top.name) : 'No sales yet', top ? top.qty + ' sold in the last 30 days' : 'Record a sale to see this', 'top-sellers.html', true, 'View top sellers');
  if (isAdmin) {
    cards += stat('stat-green', 'peso', 'Income today', VZ.money(todayAgg.net), todayAgg.n + ' sale' + (todayAgg.n === 1 ? '' : 's') + ' so far', 'income.html', false);
  } else {
    cards += stat('stat-green', 'cart', 'Sales today', todayAgg.n, todayAgg.items + ' item' + (todayAgg.items === 1 ? '' : 's') + ' sold', 'sales.html', false);
  }

  var mini = '<div class="mini"><span>' + VZ.icon('paw', 26) + '</span><small>Pets registered</small><b>' + VZ.db.pets.length + '</b></div>' +
    '<div class="mini"><span>' + VZ.icon('cart', 26) + '</span><small>Sales today</small><b>' + todayAgg.n + '</b></div>' +
    '<div class="mini"><span>' + VZ.icon('box', 26) + '</span><small>Items sold today</small><b>' + todayAgg.items + '</b></div>' +
    (isAdmin ? '<div class="mini"><span>' + VZ.icon('peso', 26) + '</span><small>Income today</small><b>' + VZ.money(todayAgg.net) + '</b></div>'
      : '<div class="mini"><span>' + VZ.icon('alert', 26) + '</span><small>Stock alerts</small><b>' + VZ.alerts().length + '</b></div>');

  var al = VZ.notifications().slice(0, 4);
  var attention = '<h3 class="sub-h">Needs attention</h3>' + (al.length ? '<ul class="alert-list">' + al.map(function (n) {
    var label = n.label ? ' <span class="chip ' + (n.level === 'red' ? 'chip-red' : 'chip-amber') + ' new-chip">' + n.label + '</span>' : '';
    return '<li><a href="' + n.href + '"><i class="dot dot-' + n.level + '"></i><div><b>' + VZ.esc(n.title) + label + '</b><span>' + VZ.esc(n.text) + '</span></div></a></li>';
  }).join('') + '</ul>' : '<p class="caption">Nothing needs attention right now.</p>');

  var typeIcon = { sale: 'cart', restock: 'box', inventory: 'box', pet: 'paw', staff: 'users' };
  var recent = VZ.db.activity.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 6);
  var activity = recent.map(function (a) {
    var when = a.ts.slice(0, 10) === today ? VZ.fmtTime(a.ts) : VZ.fmtDate(a.ts);
    return '<li><span class="a-ico">' + VZ.icon(typeIcon[a.type] || 'clock', 18) + '</span><div><b>' + VZ.esc(a.text) + '</b><small>by ' + VZ.esc(a.by) + '</small></div><time>' + when + '</time></li>';
  }).join('');

  var colors = { in: '#1f9d5a', low: '#e0a100', expiring: '#ff5fa2', out: '#c53030' };
  var labels = { in: 'In stock', low: 'Low stock', expiring: 'Expiring or expired', out: 'Out of stock' };
  var total = infos.length;
  var legend = ['in', 'low', 'expiring', 'out'].map(function (k) {
    return '<li><i style="background:' + colors[k] + '"></i><span>' + labels[k] + '</span><b>' + part[k] + '</b><span class="pct">' + (total ? Math.round(part[k] / total * 100) : 0) + '%</span></li>';
  }).join('');

  document.getElementById('dashboard-stats').innerHTML = cards;
  document.getElementById('dashboard-greeting').textContent = greeting;
  document.getElementById('dashboard-name').textContent = firstName + '!';
  document.getElementById('dashboard-minis').innerHTML = mini;
  document.getElementById('dashboard-attention').innerHTML = attention.replace(/^<h3 class="sub-h">Needs attention<\/h3>/, '');
  document.getElementById('dashboard-activity').innerHTML = activity;
  document.getElementById('dashboard-legend').innerHTML = legend;
  document.getElementById('dashboard-sales-card').hidden = !isAdmin;
  if (!isAdmin) document.getElementById('dashboard-inventory-card').classList.add('span-all');

  VZ.donut(document.getElementById('donut'), ['in', 'low', 'expiring', 'out'].map(function (k) { return { value: part[k], color: colors[k] }; }), total, 'Inventory status chart');

  if (isAdmin) {
    var buttons = main.querySelectorAll('.range button');
    var draw = function (days) {
      var pts = [], total = 0, count = 0;
      for (var i = days - 1; i >= 0; i--) {
        var d = VZ.addDays(today, -i), dailySales = VZ.salesBetween(d, d), a = VZ.aggregate(dailySales);
        total += a.net; count += a.n;
        var dt = VZ.parse(d);
        pts.push({ label: dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }), value: a.net,
          tip: VZ.fmtDate(d) + '\n' + a.n + ' sale' + (a.n === 1 ? '' : 's') + ' · ' + a.items + ' item' + (a.items === 1 ? '' : 's') + '\nTotal: ' + VZ.money(a.net),
          details: dailySales.map(function (s) { return s.no + ' · ' + VZ.money(s.total) + ' · ' + s.method + '\n' + s.items.map(function (l) { return l.qty + ' × ' + l.name; }).join(', '); })
        });
      }
      VZ.lineChart(document.getElementById('sales-chart'), pts, 'Daily sales for the last ' + days + ' days');
      document.getElementById('sum-total').textContent = VZ.money(total);
      document.getElementById('sum-count').textContent = count;
    };
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        draw(+b.getAttribute('data-days'));
      });
    });
    draw(14);
  }
})();
