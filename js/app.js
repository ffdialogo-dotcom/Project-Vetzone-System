/* VetZone VetCare System - prototype core
   Data lives in this browser (localStorage). There is no server yet.
   The planned production build will move data and permissions to Node.js, Express, and PostgreSQL.
   Sections: helpers, password hash, seed data, business rules, UI helpers, page shell. */
(function () {
  'use strict';

  var VZ = (window.VZ = {});
  var DB_KEY = 'vz_proto_db_v1';
  var SESSION_KEY = 'vz_proto_session_v1';
  var FAIL_KEY = 'vz_proto_login_fail';

  VZ.EXPIRY_DAYS = 30; // "expiring soon" window
  VZ.DUE_DAYS = 30; // pet vaccination or checkup "due soon" window
  VZ.CATEGORIES = ['Pet Food', 'Medicine', 'Vaccine', 'Supply', 'Grooming', 'Accessories'];
  VZ.EXPIRY_REQUIRED = ['Medicine', 'Vaccine'];
  VZ.PAYMENT_METHODS = ['Cash', 'Online payment'];
  var CAT_EMOJI = { 'Pet Food': '🥣', Medicine: '💊', Vaccine: '💉', Supply: '🩹', Grooming: '🧴', Accessories: '🦴' };

  /* ---------------------------------------------------------- helpers */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  VZ.pad = pad;
  VZ.dstr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  VZ.today = function () { return VZ.dstr(new Date()); };
  VZ.nowStr = function () {
    var d = new Date();
    return VZ.dstr(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  VZ.parse = function (s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  VZ.addDays = function (s, n) { var d = VZ.parse(s); d.setDate(d.getDate() + n); return VZ.dstr(d); };
  VZ.diffDays = function (a, b) { return Math.round((VZ.parse(b) - VZ.parse(a)) / 86400000); };
  VZ.round2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  VZ.money = function (n) {
    return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  VZ.fmtDate = function (s) {
    return VZ.parse(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  VZ.fmtTime = function (ts) {
    var h = +ts.slice(11, 13), m = ts.slice(14, 16);
    return (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  };
  VZ.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  VZ.uid = function (prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  VZ.ageText = function (birth) {
    var b = VZ.parse(birth), n = new Date();
    var months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
    if (n.getDate() < b.getDate()) months--;
    if (months < 1) return 'Under 1 mo';
    if (months < 12) return months + ' mo';
    return Math.floor(months / 12) + ' y/o';
  };
  function pad4(n) { return ('0000' + n).slice(-4); }

  /* ---------------------------------------------------- password hash */
  // SHA-256 in plain JavaScript so it works from a file:// page.
  // This only demonstrates "no plain-text passwords". Real security needs server-side password hashing and authentication (for example, Argon2id).
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256(str) {
    var s = unescape(encodeURIComponent(str)), bytes = [], i, t;
    for (i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
    var primes = [], n = 2;
    while (primes.length < 64) {
      var isPrime = true;
      for (i = 0; i < primes.length; i++) { if (n % primes[i] === 0) { isPrime = false; break; } }
      if (isPrime) primes.push(n);
      n++;
    }
    var K = [], H = [];
    for (i = 0; i < 64; i++) K[i] = Math.floor((Math.cbrt(primes[i]) % 1) * 4294967296);
    for (i = 0; i < 8; i++) H[i] = Math.floor((Math.sqrt(primes[i]) % 1) * 4294967296);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    for (var off = 0; off < bytes.length; off += 64) {
      var w = [];
      for (t = 0; t < 16; t++) {
        w[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
      }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (v) { return ('00000000' + (v >>> 0).toString(16)).slice(-8); }).join('');
  }
  VZ.sha256 = sha256;
  VZ.hash = function (username, password) { return sha256(String(username).toLowerCase() + ':' + password); };

  /* -------------------------------------------------------- seed data */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seed() {
    var today = VZ.today();
    var rnd = mulberry32(2026);
    var db = { v: 1, seq: { sale: 0 }, users: [], products: [], batches: [], sales: [], owners: [], pets: [], records: [], activity: [], requests: [], audit: [] };

    db.users.push({ id: 'u1', username: 'admin', name: 'Juan Dela Cruz', role: 'admin', passHash: VZ.hash('admin', 'admin123'), active: true, created: today,
      email: 'juandelacruz@example.com', phone: '0991 234 5678', gender: 'Male', dob: '2000-03-20', address: 'Blk. 32 Molave St., Addition Hills, Mandaluyong City', idNumber: '', startDate: VZ.addDays(today, -44), photo: '', seen: {} });
    db.users.push({ id: 'u2', username: 'staff1', name: 'Ana Lopez', role: 'staff', passHash: VZ.hash('staff1', 'staff123'), active: true, created: today,
      email: 'analopez@example.com', phone: '0917 555 0199', gender: 'Female', dob: '1999-06-12', address: 'Mandaluyong City', idNumber: '', startDate: VZ.addDays(today, -30), photo: '', seen: {} });

    // name, category, price, low-stock level, emoji, batches [[qty, days until expiry or null]]
    var P = [
      ['Royal Canin Dog Food 1kg', 'Pet Food', 450, 10, '🐕', [[24, 240]]],
      ['Pedigree Adult Dog Food 1.5kg', 'Pet Food', 320, 8, '🐶', [[18, 180]]],
      ['Whiskas Adult Tuna 1kg', 'Pet Food', 280, 8, '🐱', [[14, 210]]],
      ['Cesar Wet Food Pouch', 'Pet Food', 45, 20, '🥫', [[60, 150]]],
      ['Cat Litter 5L', 'Pet Food', 250, 6, '🧺', [[4, null]]],
      ['Kitten Milk Replacer 200g', 'Pet Food', 380, 5, '🍼', [[7, 25]]],
      ['Rabies Vaccine', 'Vaccine', 450, 10, '💉', [[24, 300]]],
      ['5-in-1 Dog Vaccine', 'Vaccine', 650, 8, '💉', [[12, 120], [6, 20]]],
      ['4-in-1 Cat Vaccine', 'Vaccine', 700, 6, '💉', [[9, 200]]],
      ['Kennel Cough Vaccine', 'Vaccine', 550, 5, '💉', []],
      ['Deworming Tablet', 'Medicine', 35, 20, '💊', [[40, 365]]],
      ['Amoxicillin 250mg Tablet', 'Medicine', 25, 30, '💊', [[100, 400]]],
      ['Ear Drops 15mL', 'Medicine', 180, 5, '💧', [[11, 300]]],
      ['Eye Ointment 5g', 'Medicine', 150, 5, '👁️', [[3, 90]]],
      ['Anti-tick Spot-on', 'Medicine', 420, 6, '🪲', [[10, 500]]],
      ['Vitamin B Complex Syrup', 'Medicine', 220, 5, '🧪', [[6, 15]]],
      ['Antiseptic Wound Spray', 'Medicine', 190, 5, '🧴', [[8, 260]]],
      ['Antihistamine Tablet', 'Medicine', 30, 20, '💊', [[50, 330], [3, -5]]],
      ['Syringe 3mL', 'Supply', 8, 30, '🩹', [[120, 500]]],
      ['Syringe 5mL', 'Supply', 10, 30, '🩹', [[45, 500]]],
      ['Surgical Gloves (pair)', 'Supply', 12, 30, '🧤', [[80, 600]]],
      ['Gauze Pad', 'Supply', 6, 40, '🩹', [[150, 700]]],
      ['Cotton Roll 100g', 'Supply', 85, 5, '☁️', [[12, null]]],
      ['Alcohol 70% 500mL', 'Supply', 95, 6, '🧴', [[15, 540]]],
      ['Elastic Bandage', 'Supply', 45, 5, '🩹', [[2, null]]],
      ['Anti-tick Shampoo 250mL', 'Grooming', 220, 5, '🧴', [[14, 420]]],
      ['Pet Cologne 100mL', 'Grooming', 150, 5, '🌸', [[9, 365]]],
      ['Nail Clipper', 'Grooming', 180, 3, '✂️', [[7, null]]],
      ['Slicker Brush', 'Grooming', 210, 3, '🪮', [[5, null]]],
      ['Dog Leash 1.5m', 'Accessories', 220, 5, '🦮', [[16, null]]],
      ['Collar (Medium)', 'Accessories', 160, 5, '📿', [[10, null]]],
      ['Stainless Pet Bowl', 'Accessories', 180, 4, '🥣', [[8, null]]],
      ['Cat Scratcher', 'Accessories', 260, 3, '🐈', []]
    ];
    P.forEach(function (r, i) {
      var id = 'p' + (i + 1);
      db.products.push({ id: id, name: r[0], category: r[1], price: r[2], reorder: r[3], emoji: r[4], archived: false, created: today });
      r[5].forEach(function (b, j) {
        db.batches.push({ id: 'b' + (i + 1) + '_' + (j + 1), productId: id, qty: b[0], expiry: b[1] === null ? null : VZ.addDays(today, b[1]), received: VZ.addDays(today, -30) });
      });
    });

    // Past sales (history only; current stock above is not reduced by them)
    var byName = function (n) { return db.products.filter(function (p) { return p.name === n; })[0]; };
    var popular = ['Royal Canin Dog Food 1kg', 'Cesar Wet Food Pouch', 'Deworming Tablet', 'Syringe 3mL', 'Rabies Vaccine',
      'Pedigree Adult Dog Food 1.5kg', 'Whiskas Adult Tuna 1kg', 'Anti-tick Shampoo 250mL'].map(byName);
    var nowDate = new Date(), nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    for (var d = 29; d >= 0; d--) {
      var day = VZ.addDays(today, -d);
      var count = d === 0 ? 5 : 3 + Math.floor(rnd() * 5);
      var times = [], k;
      for (k = 0; k < count; k++) {
        times.push(d === 0
          ? Math.max(0, nowMin - 5 - Math.floor(rnd() * Math.max(30, Math.min(nowMin, 600))))
          : 480 + Math.floor(rnd() * 600));
      }
      times.sort(function (a, b) { return a - b; });
      times.forEach(function (min) {
        var n = 1 + Math.floor(rnd() * 3), lines = [], used = {}, q;
        for (q = 0; q < n; q++) {
          var p = rnd() < 0.55 ? popular[Math.floor(rnd() * popular.length)] : db.products[Math.floor(rnd() * db.products.length)];
          if (used[p.id]) continue;
          used[p.id] = 1;
          lines.push({ productId: p.id, name: p.name, price: p.price, qty: 1 + Math.floor(rnd() * 2) });
        }
        var subtotal = 0;
        lines.forEach(function (l) { subtotal += l.price * l.qty; });
        var disc = rnd() < 0.12 ? (rnd() < 0.5 ? 5 : 10) : 0;
        var da = VZ.round2(subtotal * disc / 100);
        db.seq.sale++;
        db.sales.push({
          id: 's' + db.seq.sale, no: 'S-' + pad4(db.seq.sale),
          ts: day + 'T' + pad(Math.floor(min / 60)) + ':' + pad(min % 60) + ':00',
          items: lines, discountPct: disc, discount: da, subtotal: VZ.round2(subtotal), total: VZ.round2(subtotal - da),
          method: rnd() < 0.72 ? 'Cash' : 'Online payment', by: rnd() < 0.7 ? 'staff1' : 'admin'
        });
      });
    }

    // Owners, pets, records
    var owners = [
      ['Maria Santos', '0917 555 0101'], ['Jose Ramirez', '0917 555 0102'], ['Ana Reyes', '0917 555 0103'],
      ['Carlo Mendoza', '0917 555 0104'], ['Liza Bautista', '0917 555 0105'], ['Paolo Cruz', '0917 555 0106'],
      ['Grace Villanueva', '0917 555 0107'], ['Rico Dela Cruz', '0917 555 0108']
    ];
    owners.forEach(function (o, i) { db.owners.push({ id: 'o' + (i + 1), name: o[0], phone: o[1] }); });
    // name, species, breed, sex, age in years, owner number, status
    var pets = [
      ['Chica', 'Dog', 'Golden Retriever', 'F', 11, 1, 'Healthy'],
      ['Henry', 'Dog', 'Golden Retriever', 'M', 9, 1, 'In Treatment'],
      ['Sandy', 'Dog', 'Aspin (mixed breed)', 'F', 4, 2, 'Healthy'],
      ['Bella', 'Dog', 'Pomeranian', 'F', 5, 3, 'Healthy'],
      ['Yoshi', 'Dog', 'Chow Chow mix', 'M', 3, 4, 'In Treatment'],
      ['Kuro', 'Cat', 'Calico', 'F', 5, 5, 'Healthy'],
      ['Peachu', 'Cat', 'Siamese', 'M', 4, 5, 'Healthy'],
      ['Loona', 'Cat', 'Persian', 'F', 4, 6, 'Healthy'],
      ['Mochi', 'Cat', 'Puspin (domestic shorthair)', 'F', 2, 7, 'Healthy'],
      ['Bruno', 'Dog', 'Shih Tzu', 'M', 6, 7, 'Healthy'],
      ['Choco', 'Dog', 'Labrador Retriever', 'M', 2, 8, 'Healthy'],
      ['Milo', 'Cat', 'Persian', 'M', 1, 8, 'Healthy']
    ];
    pets.forEach(function (r, i) {
      db.pets.push({
        id: 'pt' + (i + 1), name: r[0], species: r[1], breed: r[2], sex: r[3],
        birth: VZ.addDays(today, -(r[4] * 365 + 40 + i * 9)), ownerId: 'o' + r[5], status: r[6], created: today
      });
    });
    var rc = 0;
    function R(petNo, type, ago, title, notes, nextOff) {
      rc++;
      db.records.push({
        id: 'r' + rc, petId: 'pt' + petNo, type: type, date: VZ.addDays(today, -ago), title: title, notes: notes || '',
        nextDue: nextOff === null ? '' : VZ.addDays(today, nextOff), by: 'staff1', ts: VZ.addDays(today, -ago) + 'T09:00:00'
      });
    }
    // Visit record: kind is 'medical' (sick or injured) or 'checkup' (routine)
    function V(petNo, kind, ago, reason, happened, exam, treatment, outcome, nextOff, extra) {
      rc++;
      db.records.push({
        id: 'r' + rc, petId: 'pt' + petNo, type: kind, date: VZ.addDays(today, -ago), title: reason, notes: '',
        happened: happened, exam: exam, treatment: treatment, outcome: outcome,
        nextDue: nextOff === null ? '' : VZ.addDays(today, nextOff), by: 'staff1', ts: VZ.addDays(today, -ago) + 'T09:00:00'
      });
      if (extra) Object.keys(extra).forEach(function (k) { db.records[db.records.length - 1][k] = extra[k]; });
    }
    var yd = VZ.addDays(today, -1);
    R(1, 'vaccination', 200, 'Rabies vaccine', '', 165);
    R(1, 'vaccination', 200, '5-in-1 vaccine', '', 165);
    V(1, 'medical', 45, 'Limping on the back legs', 'The owner noticed Chica was slow to stand up and stopped climbing stairs about two weeks ago.',
      'Physical exam and joint flexion check. Mild pain in both hips. No fever.', 'Started a joint supplement and a short course of pain relief.',
      'Improving. Keep walks short. Recheck in one month.', null);
    V(1, 'checkup', 20, 'General checkup', 'No complaints from the owner.', 'Weight, heart and lung check, and teeth check.', 'None.',
      'Healthy. Weight is stable. Hip recheck is due in 10 days.', 10);
    R(2, 'vaccination', 340, 'Rabies vaccine', '', 25);
    V(2, 'medical', 6, 'Itchy skin and red patches', 'Henry has been scratching his belly for a week. Red patches appeared after swimming.',
      'Skin exam and skin scraping. A bacterial infection was found. No mites seen.', 'Antibiotics for 7 days and a medicated shampoo.',
      'Under treatment. Recheck in one day to see how he responds.', 1);
    R(3, 'vaccination', 370, 'Rabies vaccine', '', -5);
    R(4, 'vaccination', 120, '5-in-1 vaccine', '', 245);
    V(4, 'checkup', 160, 'General checkup', 'Routine yearly visit.', 'Weight, teeth, and coat check.', 'Deworming tablet given.',
      'Healthy. The next checkup is due soon.', 20);
    V(5, 'medical', 3, 'Vomiting and loose stool', 'Yoshi vomited four times since last night and stopped eating after getting into the trash.',
      'Physical exam and dehydration check. Mild dehydration and belly pain when touched.', 'IV fluids, an anti-nausea injection, and a bland diet for 3 days.',
      'Stable after treatment. Daily recheck until he is eating normally.', 1);
    R(5, 'vaccination', 150, 'Rabies vaccine', '', 215);
    R(6, 'vaccination', 90, '4-in-1 cat vaccine', '', 275);
    R(7, 'vaccination', 360, '4-in-1 cat vaccine', '', 5);
    R(8, 'vaccination', 200, '4-in-1 cat vaccine', '', 165);
    V(8, 'checkup', 100, 'General checkup', 'Routine visit before a trip.', 'Weight, ears, eyes, and teeth check.', 'None.', 'Healthy. Cleared for travel.', 80);
    R(9, 'vaccination', 30, '4-in-1 cat vaccine', '', 335);
    V(9, 'medical', 30, 'Spay surgery', 'Planned spay. The owner wants to prevent pregnancy.', 'Blood test and physical exam before surgery. All normal.',
      'Spay surgery under anesthesia. Pain relief and antibiotics for 5 days.', 'Surgery went well. Stitches were removed after 10 days and the wound healed.', null,
      { status: 'approved', reviewedBy: 'admin', reviewedAt: yd + 'T10:20:00', reviewNote: '', auto: false });
    R(10, 'vaccination', 100, 'Rabies vaccine', '', 265);
    V(10, 'checkup', 380, 'General checkup', 'Yearly visit.', 'Weight, teeth, and coat check.', 'None.', 'Healthy. The next checkup was due 12 days ago.', -12);
    V(6, 'medical', 1, 'Eye discharge', 'Clear discharge from the left eye since yesterday.', 'Eye exam. Mild redness. No ulcer seen.',
      'Eye drops twice a day for 5 days.', 'Improving. Recheck if it does not clear in 5 days.', null, { status: 'pending', ts: yd + 'T16:00:00' });
    V(8, 'medical', 4, 'Sneezing', 'Sneezing for two days.', 'Looked at her nose and throat.', 'None.', 'Seems fine.', null,
      { status: 'rejected', reviewedBy: 'admin', reviewedAt: yd + 'T11:00:00', reviewNote: 'Please add the examination details and what the vet advised, then send it again.', auto: false, ts: VZ.addDays(today, -3) + 'T15:00:00' });
    R(11, 'vaccination', 60, '5-in-1 vaccine', 'Booster given.', 305);
    R(12, 'vaccination', 20, '4-in-1 cat vaccine', '', 345);

    // Sample inventory requests from staff (two waiting, one rejected)
    function Q(type, name, payload, before, reason, extra) {
      var pr = byName(name);
      var q = { id: 'q' + (db.requests.length + 1), type: type, productId: pr ? pr.id : null, productName: name, payload: payload, before: before, reason: reason,
        status: 'pending', by: 'staff1', byId: 'u2', at: yd + 'T14:00:00', reviewedBy: '', reviewedAt: '', note: '' };
      if (extra) Object.keys(extra).forEach(function (k) { q[k] = extra[k]; });
      db.requests.push(q);
    }
    Q('restock', 'Cat Litter 5L', { qty: 10, expiry: '' }, null, 'Delivery arrived this morning.', { at: today + 'T08:30:00' });
    Q('update_product', 'Cesar Wet Food Pouch', { name: 'Cesar Wet Food Pouch', category: 'Pet Food', price: 48, reorder: 20 },
      { name: 'Cesar Wet Food Pouch', category: 'Pet Food', price: 45, reorder: 20 }, 'The supplier raised the price.');
    Q('add_product', 'Bird Seed 1kg', { name: 'Bird Seed 1kg', category: 'Pet Food', price: 120, reorder: 5, qty: 10, expiry: '' }, null, 'A customer asked for it.',
      { status: 'rejected', reviewedBy: 'admin', reviewedAt: yd + 'T09:30:00', note: 'We do not sell food for birds.', at: VZ.addDays(today, -2) + 'T13:00:00' });
    db.audit.push({ id: 'au1', ts: VZ.addDays(today, -2) + 'T13:00:00', by: 'staff1', role: 'staff', action: 'inventory.submit', target: 'Bird Seed 1kg', details: 'Add new item: Bird Seed 1kg. Reason: A customer asked for it.' });
    db.audit.push({ id: 'au2', ts: yd + 'T09:30:00', by: 'admin', role: 'admin', action: 'inventory.reject', target: 'Bird Seed 1kg', details: 'Add new item: Bird Seed 1kg. Submitted by staff1. Note: We do not sell food for birds.' });
    db.audit.push({ id: 'au3', ts: yd + 'T10:20:00', by: 'admin', role: 'admin', action: 'medical.approve', target: 'Mochi: Spay surgery (' + VZ.fmtDate(VZ.addDays(today, -30)) + ')', details: 'Submitted by staff1' });
    db.audit.push({ id: 'au4', ts: yd + 'T11:00:00', by: 'admin', role: 'admin', action: 'medical.reject', target: 'Loona: Sneezing (' + VZ.fmtDate(VZ.addDays(today, -4)) + ')', details: 'Submitted by staff1. Note: Please add the examination details and what the vet advised, then send it again.' });

    // Recent activity
    db.sales.slice(-3).forEach(function (s, i) {
      var n = 0;
      s.items.forEach(function (l) { n += l.qty; });
      db.activity.push({ id: 'a' + (i + 1), ts: s.ts, type: 'sale', text: 'Sale ' + s.no + ' recorded (' + n + ' items, ' + VZ.money(s.total) + ')', by: s.by });
    });
    var y = VZ.addDays(today, -1);
    db.activity.unshift({ id: 'a8', ts: y + 'T15:10:00', type: 'pet', text: 'Updated record for Chica', by: 'staff1' });
    db.activity.unshift({ id: 'a9', ts: y + 'T08:45:00', type: 'restock', text: 'Restocked Rabies Vaccine (+24)', by: 'admin' });
    return db;
  }

  /* ---------------------------------------------------------- storage */
  var storageWarned = false;
  function loadDB() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) { var d = JSON.parse(raw); if (d && d.v === 1) return d; }
    } catch (e) { /* fall through to a fresh seed */ }
    return null;
  }
  VZ.save = function () {
    try { localStorage.setItem(DB_KEY, JSON.stringify(VZ.db)); }
    catch (e) {
      if (!storageWarned) { storageWarned = true; alert('This browser is blocking storage, so changes will not be saved after you leave this page.'); }
    }
  };
  VZ.resetDemo = function () { VZ.db = migrate(seed()); VZ.save(); };
  // Older saved data from earlier versions gets the new parts it needs.
  function migrate(db) {
    db.requests = db.requests || [];
    db.audit = db.audit || [];
    db.petStatusRequests = db.petStatusRequests || [];
    // Keep internal IDs unchanged and give each role its own display-ID sequence.
    db.seq = db.seq || { sale: 0 };
    db.seq.display = db.seq.display || {};
    function assign(list, prefix) {
      var max = Number(db.seq.display[prefix]) || 0, seen = {};
      var pattern = new RegExp('^' + prefix + '-(\\d{4,})$');
      list.forEach(function (item) { var m = pattern.exec(item.displayId || ''); if (m) max = Math.max(max, Number(m[1])); });
      list.forEach(function (item) {
        if (!pattern.test(item.displayId || '') || seen[item.displayId]) item.displayId = prefix + '-' + String(++max).padStart(4, '0');
        seen[item.displayId] = true;
      });
      db.seq.display[prefix] = max;
    }
    assign(db.users.filter(function (u) { return u.role === 'admin'; }), 'ADM');
    assign(db.users.filter(function (u) { return u.role === 'staff'; }), 'STF');
    assign(db.products, 'ITM');
    db.users.forEach(function (u) { if (!u.seen) u.seen = {}; });
    return db;
  }
  VZ.db = migrate(loadDB() || seed());
  VZ.nextDisplayId = function (list, prefix) {
    var max = Number(VZ.db.seq.display[prefix]) || 0;
    list.forEach(function (x) { var m = new RegExp('^' + prefix + '-(\\d+)$').exec(x.displayId || ''); if (m) max = Math.max(max, Number(m[1])); });
    VZ.db.seq.display[prefix] = max + 1;
    return prefix + '-' + String(max + 1).padStart(4, '0');
  };
  VZ.save();

  /* ----------------------------------------------------------- session */
  VZ.session = function () { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; } };
  VZ.currentUser = function () {
    var s = VZ.session();
    if (!s) return null;
    var u = VZ.db.users.filter(function (x) { return x.id === s.uid; })[0];
    return u && u.active ? u : null;
  };
  VZ.login = function (username, password) {
    var fail = { count: 0, until: 0 };
    try { fail = JSON.parse(sessionStorage.getItem(FAIL_KEY)) || fail; } catch (e) { /* ignore */ }
    var now = Date.now();
    if (fail.until > now) {
      return { ok: false, error: 'Too many attempts. Try again in ' + Math.ceil((fail.until - now) / 1000) + ' seconds.' };
    }
    var u = VZ.db.users.filter(function (x) { return x.username.toLowerCase() === String(username).trim().toLowerCase(); })[0];
    if (u && u.passHash === VZ.hash(u.username, password)) {
      if (u.pending) return { ok: false, error: 'This account is waiting for the admin to approve it. Please try again later.' };
      if (!u.active) return { ok: false, error: 'This account is inactive. Ask the clinic admin to turn it on.' };
      sessionStorage.removeItem(FAIL_KEY);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ uid: u.id }));
      return { ok: true, user: u };
    }
    fail.count++;
    if (fail.count >= 5) { fail = { count: 0, until: now + 30000 }; }
    sessionStorage.setItem(FAIL_KEY, JSON.stringify(fail));
    return { ok: false, error: 'Incorrect username or password.' };
  };
  VZ.logout = function () { sessionStorage.removeItem(SESSION_KEY); location.href = 'index.html'; };

  VZ.log = function (type, text, user) {
    VZ.db.activity.push({ id: VZ.uid('a'), ts: VZ.nowStr(), type: type, text: text, by: user ? user.username : 'system' });
    if (VZ.db.activity.length > 200) VZ.db.activity.splice(0, VZ.db.activity.length - 200);
  };

  /* -------------------------------------------------------- permissions */
  // Every change goes through here. The acting person always comes from the signed-in session
  // and is looked up again in the database. It is never taken from what a page passes in.
  // The real system must make the same checks on the server.
  var PERMS = {
    'inventory.direct': ['admin'],   // change official inventory at once, without approval
    'inventory.submit': ['admin', 'staff'],
    'inventory.review': ['admin'],
    'inventory.archive': ['admin'],
    'inventory.restore': ['admin'],
    'sales.record': ['admin', 'staff'],
    'income.view': ['admin'],
    'pets.add': ['admin', 'staff'],
    'pets.status': ['admin', 'staff'],
    'medical.submit': ['admin', 'staff'],
    'medical.review': ['admin'],
    'medical.edit': ['admin'],
    'medical.delete': ['admin'],
    'users.manage': ['admin'],
    'audit.view': ['admin']
  };
  VZ.PERMS = PERMS;
  VZ.can = function (perm) {
    var u = VZ.currentUser();
    return !!(u && PERMS[perm] && PERMS[perm].indexOf(u.role) >= 0);
  };
  function actor() { return VZ.currentUser(); }
  function denied(msg) { return { ok: false, denied: true, error: msg || 'You do not have permission to do this.' }; }
  function needSignIn() { return { ok: false, denied: true, error: 'Please sign in again.' }; }
  VZ.userName = function (username) {
    var u = VZ.db.users.filter(function (x) { return x.username === username; })[0];
    return u ? u.name : (username || 'Unknown');
  };

  /* --------------------------------------------------------- audit trail */
  // A record of approvals, rejections, deletions, and role changes: who did what, and when.
  VZ.audit = function (action, target, details, me) {
    VZ.db.audit = VZ.db.audit || [];
    VZ.db.audit.push({ id: VZ.uid('au'), ts: VZ.nowStr(), by: me ? me.username : 'system', role: me ? me.role : '', action: action, target: target || '', details: details || '' });
    if (VZ.db.audit.length > 500) VZ.db.audit.splice(0, VZ.db.audit.length - 500);
  };
  VZ.AUDIT_LABELS = {
    'inventory.submit': 'Inventory change submitted', 'inventory.approve': 'Inventory change approved', 'inventory.reject': 'Inventory change rejected',
    'inventory.direct': 'Inventory changed by admin', 'inventory.archive': 'Item archived', 'inventory.restore': 'Item restored',
    'medical.submit': 'Medical entry submitted', 'medical.approve': 'Medical entry approved', 'medical.reject': 'Medical entry rejected',
    'medical.edit': 'Medical entry edited by admin', 'medical.delete': 'Medical entry deleted', 'medical.direct': 'Medical entry added by admin',
    'account.create': 'Account created', 'account.approve': 'Account approved', 'account.reject': 'Account request rejected',
    'account.toggle': 'Account turned on or off', 'account.reset': 'Password reset', 'role.change': 'Role changed'
  };
  VZ.auditTrail = function (limit) {
    if (!VZ.can('audit.view')) return [];
    return (VZ.db.audit || []).slice().sort(function (a, b) { return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; }).slice(0, limit || 50);
  };

  /* -------------------------------------------------------- inventory */
  VZ.products = function (includeArchived) {
    return VZ.db.products.filter(function (p) { return includeArchived || !p.archived; });
  };
  VZ.findProduct = function (id) { return VZ.db.products.filter(function (p) { return p.id === id; })[0]; };

  // Stock status is always calculated from the batches, never typed in by hand.
  VZ.info = function (p) {
    var today = VZ.today(), sellable = 0, expiredQty = 0, next = null, soon = false;
    VZ.db.batches.forEach(function (b) {
      if (b.productId !== p.id || b.qty <= 0) return;
      if (b.expiry && b.expiry < today) { expiredQty += b.qty; return; }
      sellable += b.qty;
      if (b.expiry) {
        if (!next || b.expiry < next) next = b.expiry;
        if (VZ.diffDays(today, b.expiry) <= VZ.EXPIRY_DAYS) soon = true;
      }
    });
    var out = sellable === 0, low = !out && sellable <= p.reorder;
    var expired = expiredQty > 0, expiring = soon || expired;
    return {
      sellable: sellable, expiredQty: expiredQty, nextExpiry: next, soon: soon,
      out: out, low: low, expired: expired, expiring: expiring,
      primary: out ? 'out' : expiring ? 'expiring' : low ? 'low' : 'in'
    };
  };
  VZ.chips = function (i) {
    var c = [];
    if (i.out) c.push({ text: 'Out of stock', cls: 'chip-red' });
    if (i.expired) c.push({ text: 'Expired stock', cls: 'chip-red' });
    if (i.soon) c.push({ text: 'Expiring', cls: 'chip-amber' });
    if (i.low) c.push({ text: 'Low stock', cls: 'chip-amber' });
    if (!c.length) c.push({ text: 'In stock', cls: 'chip-green' });
    return c;
  };
  VZ.chipsHTML = function (list) {
    return '<span class="chips">' + list.map(function (c) { return '<span class="chip ' + c.cls + '">' + VZ.esc(c.text) + '</span>'; }).join('') + '</span>';
  };
  VZ.stockValue = function () {
    var v = 0;
    VZ.products().forEach(function (p) { v += VZ.info(p).sellable * p.price; });
    return VZ.round2(v);
  };

  function earliestFirst(a, b) {
    if (a.expiry === b.expiry) return a.received < b.received ? -1 : a.received > b.received ? 1 : 0;
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry < b.expiry ? -1 : 1;
  }
  function deduct(productId, qty) {
    var today = VZ.today();
    var bs = VZ.db.batches.filter(function (b) { return b.productId === productId && b.qty > 0 && (!b.expiry || b.expiry >= today); });
    bs.sort(earliestFirst);
    var need = qty;
    for (var i = 0; i < bs.length && need > 0; i++) {
      var take = Math.min(bs[i].qty, need);
      bs[i].qty -= take;
      need -= take;
    }
    return need === 0;
  }
  function isWhole(v) { return String(v).trim() !== '' && !isNaN(Number(v)) && Number(v) >= 0 && Number(v) === Math.floor(Number(v)); }

  /* ------------------------------------ inventory changes and approvals */
  // An admin changes the official inventory at once. A staff member's change waits as a request
  // and does not touch stock or product details until an admin approves it.
  function cleanReason(v, required, err) {
    var r = String(v || '').trim();
    if (required && r.length < 3) err.reason = 'Write a short reason, such as "Damaged" or "Miscount".';
    else if (r.length > 200) err.reason = 'Keep the reason under 200 characters.';
    return r;
  }
  function vNewProduct(d) {
    var err = {}, today = VZ.today(), name = String(d.name || '').trim();
    if (!name) err.name = 'Enter the item name.';
    else if (name.length > 60) err.name = 'Keep the name under 60 characters.';
    else if (VZ.db.products.some(function (p) { return !p.archived && p.name.toLowerCase() === name.toLowerCase(); })) err.name = 'An item with this name already exists.';
    if (VZ.CATEGORIES.indexOf(d.category) < 0) err.category = 'Choose a category.';
    var price = Number(d.price);
    if (String(d.price).trim() === '' || isNaN(price) || price < 0) err.price = 'Enter a price of 0 or more.';
    if (!isWhole(d.reorder)) err.reorder = 'Enter a whole number, 0 or more.';
    if (!isWhole(d.qty)) err.qty = 'Enter a whole number, 0 or more.';
    if (d.expiry && d.expiry < today) err.expiry = 'The expiry date cannot be in the past.';
    else if (!err.qty && Number(d.qty) > 0 && VZ.EXPIRY_REQUIRED.indexOf(d.category) >= 0 && !d.expiry) err.expiry = 'Medicines and vaccines need an expiry date.';
    return { errors: err, clean: { name: name, category: d.category, price: VZ.round2(price), reorder: Number(d.reorder), qty: Number(d.qty), expiry: d.expiry || '' } };
  }
  function vRestock(p, d) {
    var err = {}, today = VZ.today();
    if (!p || p.archived) return { errors: { qty: 'This item is no longer available.' } };
    if (!isWhole(d.qty) || Number(d.qty) < 1) err.qty = 'Enter a whole number of 1 or more.';
    if (d.expiry && d.expiry < today) err.expiry = 'The expiry date cannot be in the past.';
    else if (VZ.EXPIRY_REQUIRED.indexOf(p.category) >= 0 && !d.expiry) err.expiry = 'Medicines and vaccines need an expiry date.';
    return { errors: err, clean: { qty: Number(d.qty), expiry: d.expiry || '' } };
  }
  function vUpdate(p, d) {
    var err = {}, name = String(d.name || '').trim();
    if (!p || p.archived) return { errors: { name: 'This item is no longer available.' } };
    if (!name) err.name = 'Enter the item name.';
    else if (name.length > 60) err.name = 'Keep the name under 60 characters.';
    else if (VZ.db.products.some(function (x) { return x.id !== p.id && !x.archived && x.name.toLowerCase() === name.toLowerCase(); })) err.name = 'An item with this name already exists.';
    if (VZ.CATEGORIES.indexOf(d.category) < 0) err.category = 'Choose a category.';
    var price = Number(d.price);
    if (String(d.price).trim() === '' || isNaN(price) || price < 0) err.price = 'Enter a price of 0 or more.';
    if (!isWhole(d.reorder)) err.reorder = 'Enter a whole number, 0 or more.';
    var clean = { name: name, category: d.category, price: VZ.round2(price), reorder: Number(d.reorder) };
    if (!Object.keys(err).length && clean.name === p.name && clean.category === p.category && clean.price === p.price && clean.reorder === p.reorder) err.name = 'Nothing was changed.';
    return { errors: err, clean: clean };
  }
  function vCorrection(p, d) {
    var err = {}, today = VZ.today();
    if (!p || p.archived) return { errors: { delta: 'This item is no longer available.' } };
    var delta = Number(d.delta);
    if (String(d.delta).trim() === '' || isNaN(delta) || delta !== Math.floor(delta) || delta === 0) err.delta = 'Enter a whole number that is not zero, such as -3 or 5.';
    else if (delta < 0 && -delta > VZ.info(p).sellable) err.delta = 'Only ' + VZ.info(p).sellable + ' in stock, so you cannot remove ' + (-delta) + '.';
    if (!err.delta && delta > 0) {
      if (d.expiry && d.expiry < today) err.expiry = 'The expiry date cannot be in the past.';
      else if (VZ.EXPIRY_REQUIRED.indexOf(p.category) >= 0 && !d.expiry) err.expiry = 'Medicines and vaccines need an expiry date when stock is added.';
    }
    return { errors: err, clean: { delta: delta, expiry: delta > 0 ? (d.expiry || '') : '' } };
  }
  function applyNew(c) {
    var today = VZ.today();
    var p = { id: VZ.uid('p'), displayId: VZ.nextDisplayId(VZ.db.products, 'ITM'), name: c.name, category: c.category, price: c.price, reorder: c.reorder, emoji: CAT_EMOJI[c.category], archived: false, created: today };
    VZ.db.products.push(p);
    if (c.qty > 0) VZ.db.batches.push({ id: VZ.uid('b'), productId: p.id, qty: c.qty, expiry: c.expiry || null, received: today });
    return p;
  }
  function applyAddStock(p, qty, expiry) {
    VZ.db.batches.push({ id: VZ.uid('b'), productId: p.id, qty: qty, expiry: expiry || null, received: VZ.today() });
  }
  function applyUpdate(p, c) {
    var catChanged = p.category !== c.category;
    p.name = c.name; p.category = c.category; p.price = c.price; p.reorder = c.reorder;
    if (catChanged) p.emoji = CAT_EMOJI[c.category];
  }
  function applyCorrection(p, c) { if (c.delta < 0) deduct(p.id, -c.delta); else applyAddStock(p, c.delta, c.expiry); }

  VZ.requestSummary = function (rq) {
    var c = rq.payload, n = rq.productName;
    if (rq.type === 'add_product') return 'Add new item: ' + c.name;
    if (rq.type === 'update_product') return 'Edit item details: ' + n;
    if (rq.type === 'restock') return 'Add stock: +' + c.qty + ' ' + n;
    return 'Stock correction: ' + (c.delta > 0 ? '+' : '') + c.delta + ' ' + n;
  };
  VZ.REQUEST_TYPES = { add_product: 'New item', update_product: 'Item details', restock: 'Add stock', correction: 'Stock correction' };
  // The proposed change as lines to show a reviewer: what it is now and what it would become.
  VZ.requestChanges = function (rq) {
    var c = rq.payload, p = rq.productId ? VZ.findProduct(rq.productId) : null, lines = [], cur = p ? VZ.info(p).sellable : 0;
    if (rq.type === 'add_product') {
      lines.push({ label: 'Item name', to: c.name }, { label: 'Category', to: c.category }, { label: 'Price', to: VZ.money(c.price) },
        { label: 'Low-stock level', to: String(c.reorder) }, { label: 'Starting stock', to: String(c.qty) }, { label: 'Expiry date', to: c.expiry ? VZ.fmtDate(c.expiry) : 'No expiry' });
    } else if (rq.type === 'update_product') {
      var b = rq.before || {};
      [['name', 'Item name'], ['category', 'Category'], ['price', 'Price'], ['reorder', 'Low-stock level']].forEach(function (f) {
        if (b[f[0]] !== c[f[0]]) lines.push({ label: f[1], from: f[0] === 'price' ? VZ.money(b.price) : String(b[f[0]]), to: f[0] === 'price' ? VZ.money(c.price) : String(c[f[0]]) });
      });
    } else if (rq.type === 'restock') {
      lines.push({ label: 'Quantity added', to: '+' + c.qty }, { label: 'Expiry date', to: c.expiry ? VZ.fmtDate(c.expiry) : 'No expiry' }, { label: 'Stock in the system', from: String(cur), to: String(cur + c.qty) });
    } else {
      lines.push({ label: 'Change', to: (c.delta > 0 ? '+' : '') + c.delta }, { label: 'Stock in the system', from: String(cur), to: String(Math.max(0, cur + c.delta)) });
      if (c.delta > 0) lines.push({ label: 'Expiry date', to: c.expiry ? VZ.fmtDate(c.expiry) : 'No expiry' });
    }
    return lines;
  };

  // Admin: apply at once. Staff: queue a request that changes nothing yet.
  function inventoryChange(type, p, v, reason, me) {
    if (Object.keys(v.errors).length) return { ok: false, errors: v.errors };
    var name = type === 'add_product' ? v.clean.name : p.name;
    var rq = { id: VZ.uid('q'), type: type, productId: p ? p.id : null, productName: name, payload: v.clean, reason: reason,
      before: type === 'update_product' ? { name: p.name, category: p.category, price: p.price, reorder: p.reorder } : null,
      status: 'pending', by: me.username, byId: me.id, at: VZ.nowStr(), reviewedBy: '', reviewedAt: '', note: '' };
    if (VZ.can('inventory.direct')) {
      var made = applyRequest(rq);
      if (!didApply(made)) return { ok: false, errors: {}, error: made.error };
      VZ.log(type === 'restock' ? 'restock' : 'inventory', VZ.requestSummary(rq), me);
      VZ.audit('inventory.direct', name, VZ.requestSummary(rq) + (reason ? '. Reason: ' + reason : ''), me);
      VZ.save();
      return { ok: true, applied: true, product: made };
    }
    var dup = VZ.db.requests.filter(function (r) {
      if (r.status !== 'pending' || r.type !== type) return false;
      if (type === 'add_product') return r.payload.name.toLowerCase() === rq.payload.name.toLowerCase();
      return r.productId === rq.productId && JSON.stringify(r.payload) === JSON.stringify(rq.payload);
    })[0];
    if (dup) return { ok: false, errors: {}, error: 'The same change is already waiting for admin approval.' };
    VZ.db.requests.push(rq);
    VZ.log('inventory', VZ.requestSummary(rq) + ' (waiting for approval)', me);
    VZ.audit('inventory.submit', name, VZ.requestSummary(rq) + (reason ? '. Reason: ' + reason : ''), me);
    VZ.save();
    return { ok: true, pending: true, request: rq };
  }
  // Checks the request against today's records again, then writes it into the official inventory.
  function applyRequest(rq) {
    var p = rq.productId ? VZ.findProduct(rq.productId) : null, v;
    if (rq.type === 'add_product') { v = vNewProduct(rq.payload); if (Object.keys(v.errors).length) return { error: firstError(v.errors) }; var np = applyNew(v.clean); rq.productId = np.id; return np; }
    if (rq.type === 'restock') { v = vRestock(p, rq.payload); if (Object.keys(v.errors).length) return { error: firstError(v.errors) }; applyAddStock(p, v.clean.qty, v.clean.expiry); return p; }
    if (rq.type === 'update_product') { v = vUpdate(p, rq.payload); if (Object.keys(v.errors).length) return { error: firstError(v.errors) }; applyUpdate(p, v.clean); return p; }
    v = vCorrection(p, rq.payload); if (Object.keys(v.errors).length) return { error: firstError(v.errors) };
    applyCorrection(p, v.clean); return p;
  }
  function firstError(errors) { return errors[Object.keys(errors)[0]]; }
  // applyRequest returns the product on success, or { error } when it can no longer be applied.
  function didApply(r) { return r && !r.error; }

  VZ.addProduct = function (d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('inventory.submit')) return denied();
    var v = vNewProduct(d), reason = cleanReason(d.reason, false, v.errors);
    return inventoryChange('add_product', null, v, reason, me);
  };
  VZ.restock = function (productId, d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('inventory.submit')) return denied();
    var p = VZ.findProduct(productId), v = vRestock(p, d), reason = cleanReason(d.reason, false, v.errors);
    return inventoryChange('restock', p, v, reason, me);
  };
  VZ.updateProduct = function (productId, d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('inventory.submit')) return denied();
    var p = VZ.findProduct(productId), v = vUpdate(p, d), reason = cleanReason(d.reason, false, v.errors);
    return inventoryChange('update_product', p, v, reason, me);
  };
  VZ.correctStock = function (productId, d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('inventory.submit')) return denied();
    var p = VZ.findProduct(productId), v = vCorrection(p, d), reason = cleanReason(d.reason, true, v.errors);
    return inventoryChange('correction', p, v, reason, me);
  };
  VZ.archiveProduct = function (productId) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('inventory.archive')) return denied('Only an admin can archive items.');
    var p = VZ.findProduct(productId);
    if (!p || p.archived) return { ok: false, error: 'This item could not be found.' };
    p.archived = true;
    VZ.log('inventory', 'Archived item ' + p.name, me);
    VZ.audit('inventory.archive', p.name, 'Item archived', me);
    VZ.save();
    return { ok: true };
  };

  VZ.restoreProduct = function (productId) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('inventory.restore')) return denied('Only an admin can restore archived items.');
    var p = VZ.findProduct(productId);
    if (!p || !p.archived) return { ok: false, error: 'This archived item could not be found.' };
    if (VZ.db.products.some(function (x) { return x.id !== p.id && !x.archived && x.name.toLowerCase() === p.name.toLowerCase(); })) {
      return { ok: false, error: 'An active item already uses this name. Rename that item before restoring.' };
    }
    p.archived = false;
    VZ.log('inventory', 'Restored item ' + p.name, me);
    VZ.audit('inventory.restore', p.name, 'Item restored to active inventory', me);
    VZ.save();
    return { ok: true };
  };

  // Staff see only their own requests. Admins see all of them.
  VZ.inventoryRequests = function (status) {
    var me = actor(); if (!me) return [];
    return VZ.db.requests.filter(function (r) { return (me.role === 'admin' || r.byId === me.id) && (!status || r.status === status); })
      .sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  };
  VZ.reviewInventory = function (requestId, decision, note) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('inventory.review')) return denied('Only an admin can review inventory submissions.');
    var rq = VZ.db.requests.filter(function (r) { return r.id === requestId; })[0];
    if (!rq) return { ok: false, error: 'This request could not be found.' };
    if (rq.status !== 'pending') return { ok: false, error: 'This request was already ' + rq.status + '.' };
    if (rq.byId === me.id) return denied('You cannot review your own submission.');
    note = String(note || '').trim();
    if (note.length > 200) return { ok: false, errors: { note: 'Keep the note under 200 characters.' } };
    if (decision === 'reject') {
      if (note.length < 3) return { ok: false, errors: { note: 'Write a short reason for rejecting this change.' } };
    } else if (decision === 'approve') {
      var res = applyRequest(rq);
      if (!didApply(res)) return { ok: false, error: 'This change can no longer be applied: ' + res.error };
    } else return { ok: false, error: 'Unknown decision.' };
    rq.status = decision === 'approve' ? 'approved' : 'rejected';
    rq.reviewedBy = me.username; rq.reviewedAt = VZ.nowStr(); rq.note = note;
    VZ.audit('inventory.' + decision, rq.productName, VZ.requestSummary(rq) + '. Submitted by ' + rq.by + (note ? '. Note: ' + note : ''), me);
    if (decision === 'approve') VZ.log('inventory', VZ.requestSummary(rq) + ' (approved)', me);
    VZ.save();
    return { ok: true, request: rq };
  };

  // Alerts for the bell and dashboard, most urgent first.
  VZ.alerts = function () {
    var out = [], today = VZ.today();
    VZ.products().forEach(function (p) {
      var i = VZ.info(p);
      if (i.expired) out.push({ p: p, sev: 4, sig: 'expired:' + i.expiredQty, level: 'red', title: p.name, text: i.expiredQty + ' unit(s) are past their expiry date' });
      if (i.out) out.push({ p: p, sev: 3, sig: 'out', level: 'red', title: p.name, text: 'Out of stock' });
      if (i.soon) out.push({ p: p, sev: 2, sig: 'exp:' + i.nextExpiry, level: 'amber', title: p.name, text: 'Expires in ' + Math.max(0, VZ.diffDays(today, i.nextExpiry)) + ' day(s) (' + VZ.fmtDate(i.nextExpiry) + ')' });
      if (i.low) out.push({ p: p, sev: 1, sig: 'low', level: 'amber', title: p.name, text: 'Low stock: ' + i.sellable + ' left' });
    });
    out.sort(function (a, b) { return b.sev - a.sev || a.title.localeCompare(b.title); });
    return out;
  };

  /* ------------------------------------------------------------ sales */
  VZ.cartTotals = function (lines, discountPct) {
    var subtotal = 0;
    lines.forEach(function (l) { subtotal += l.price * l.qty; });
    subtotal = VZ.round2(subtotal);
    var d = Number(discountPct) || 0;
    var discount = VZ.round2(subtotal * d / 100);
    return { subtotal: subtotal, discount: discount, total: VZ.round2(subtotal - discount) };
  };
  VZ.prepareSale = function (items, discountPct, method) {
    var user = actor(); if (!user) return needSignIn(); if (!VZ.can('sales.record')) return denied();
    if (!items || !items.length) return { ok: false, error: 'Add at least one item to the order.' };
    if (VZ.PAYMENT_METHODS.indexOf(method) < 0) return { ok: false, error: 'Choose a payment method.' };
    var disc = Number(discountPct === '' || discountPct == null ? 0 : discountPct);
    if (isNaN(disc) || disc < 0 || disc > 100) return { ok: false, error: 'The discount must be between 0 and 100.' };
    var merged = {}, lines = [], k;
    items.forEach(function (it) { merged[it.productId] = (merged[it.productId] || 0) + Number(it.qty); });
    for (k in merged) {
      if (!Object.prototype.hasOwnProperty.call(merged, k)) continue;
      var p = VZ.findProduct(k);
      if (!p || p.archived) return { ok: false, error: 'One of the items is no longer available.' };
      var q = merged[k];
      if (!(q >= 1) || q !== Math.floor(q)) return { ok: false, error: 'Quantities must be whole numbers of 1 or more.' };
      var left = VZ.info(p).sellable;
      if (q > left) return { ok: false, error: 'Not enough stock for ' + p.name + ' (' + left + ' left).' };
      lines.push({ productId: p.id, name: p.name, price: p.price, qty: q });
    }
    var t = VZ.cartTotals(lines, disc);
    return { ok: true, lines: lines, totals: t, discountPct: disc, method: method };
  };
  VZ.cashPayment = function (total, received) {
    if (received == null || String(received).trim() === '') return { ok: false, error: 'Enter the cash received from the customer.' };
    var amount = Number(received), cents = amount * 100;
    if (!isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(cents)) || Math.abs(cents - Math.round(cents)) > 0.000001) {
      return { ok: false, error: 'Enter a valid cash amount with at most two decimal places.' };
    }
    amount = VZ.round2(amount);
    if (amount < total) return { ok: false, error: 'Cash received must cover the total.' };
    return { ok: true, cashReceived: amount, change: VZ.round2(amount - total) };
  };
  VZ.recordSale = function (items, discountPct, method, payment) {
    var prepared = VZ.prepareSale(items, discountPct, method);
    if (!prepared.ok) return prepared;
    payment = payment || {};
    var user = actor(), lines = prepared.lines, t = prepared.totals, disc = prepared.discountPct;
    if (payment.expectedTotal != null && payment.expectedTotal !== t.total) return { ok: false, error: 'The order total changed. Go back and review the sale again.' };
    var cash = method === 'Cash' ? VZ.cashPayment(t.total, payment.cashReceived) : { ok: true, cashReceived: null, change: null };
    if (!cash.ok) return cash;
    lines.forEach(function (l) { deduct(l.productId, l.qty); });
    VZ.db.seq.sale++;
    var sale = {
      id: 's' + VZ.db.seq.sale, no: 'S-' + pad4(VZ.db.seq.sale), ts: VZ.nowStr(), items: lines,
      discountPct: disc, discount: t.discount, subtotal: t.subtotal, total: t.total, method: method, by: user.username, cashReceived: cash.cashReceived, change: cash.change
    };
    VZ.db.sales.push(sale);
    var n = 0;
    lines.forEach(function (l) { n += l.qty; });
    VZ.log('sale', 'Sale ' + sale.no + ' recorded (' + n + ' items, ' + VZ.money(t.total) + ')', user);
    VZ.save();
    return { ok: true, sale: sale };
  };
  VZ.salesBetween = function (from, to) {
    return VZ.db.sales.filter(function (s) { var d = s.ts.slice(0, 10); return d >= from && d <= to; });
  };
  VZ.aggregate = function (sales) {
    var r = { n: sales.length, items: 0, gross: 0, discount: 0, net: 0, cash: 0, online: 0 };
    sales.forEach(function (s) {
      s.items.forEach(function (l) { r.items += l.qty; });
      r.gross += s.subtotal; r.discount += s.discount; r.net += s.total;
      if (s.method === 'Cash') r.cash += s.total; else r.online += s.total;
    });
    ['gross', 'discount', 'net', 'cash', 'online'].forEach(function (k) { r[k] = VZ.round2(r[k]); });
    return r;
  };

  // Top sellers: products ranked by quantity sold (default) or by total sales after discounts.
  VZ.topSellers = function (from, to, rankBy) {
    var map = {};
    VZ.salesBetween(from, to).forEach(function (s) {
      var keep = 1 - (Number(s.discountPct) || 0) / 100;
      s.items.forEach(function (l) {
        var m = map[l.productId] || (map[l.productId] = { productId: l.productId, name: l.name, qty: 0, total: 0 });
        m.qty += l.qty;
        m.total += l.price * l.qty * keep;
      });
    });
    var list = Object.keys(map).map(function (k) {
      var m = map[k], p = VZ.findProduct(m.productId);
      m.total = VZ.round2(m.total);
      m.emoji = p ? p.emoji : '📦';
      m.category = p ? p.category : '';
      return m;
    });
    list.sort(function (a, b) {
      if (rankBy === 'total') return b.total - a.total || b.qty - a.qty || a.name.localeCompare(b.name);
      return b.qty - a.qty || b.total - a.total || a.name.localeCompare(b.name);
    });
    return list;
  };
  VZ.weekStart = function (s) { var d = VZ.parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return VZ.dstr(d); };

  /* ------------------------------------------------------------- pets */
  VZ.findPet = function (id) { return VZ.db.pets.filter(function (p) { return p.id === id; })[0]; };
  VZ.findOwner = function (id) { return VZ.db.owners.filter(function (o) { return o.id === id; })[0] || { name: 'Unknown', phone: '' }; };
  // Only approved entries are finalized medical history. Older records with no status count as approved.
  function isApproved(r) { return !r.status || r.status === 'approved'; }
  VZ.isApproved = isApproved;
  function newestFirst(list) {
    return list.map(function (r, i) { return { r: r, i: i }; })
      .sort(function (a, b) { return a.r.date < b.r.date ? 1 : a.r.date > b.r.date ? -1 : b.i - a.i; })
      .map(function (x) { return x.r; });
  }
  // Finalized history for one pet, newest first. When two have the same date, the later one comes first.
  VZ.petRecords = function (petId) {
    return newestFirst(VZ.db.records.filter(function (r) { return r.petId === petId && isApproved(r); }));
  };
  // Entries that are not finalized (pending or rejected). Staff only see their own. Admins see all.
  VZ.petSubmissions = function (petId) {
    var me = actor(); if (!me) return [];
    return newestFirst(VZ.db.records.filter(function (r) { return r.petId === petId && !isApproved(r) && (me.role === 'admin' || r.by === me.username); }));
  };
  // Due dates come from the latest approved record of each vaccine or checkup, so a new one replaces the old due date.
  VZ.petState = function (pet) {
    var today = VZ.today(), latest = {}, vaxDue = false, checkDue = false, overdue = false, dueItems = [];
    VZ.petRecords(pet.id).forEach(function (r) {
      if (r.type !== 'vaccination' && r.type !== 'checkup') return;
      var key = r.type === 'checkup' ? 'checkup' : r.type + '|' + r.title.toLowerCase();
      if (!latest[key]) latest[key] = r;
    });
    Object.keys(latest).forEach(function (k) {
      var r = latest[k];
      if (!r.nextDue) return;
      var d = VZ.diffDays(today, r.nextDue);
      if (d <= VZ.DUE_DAYS) {
        if (r.type === 'vaccination') vaxDue = true; else checkDue = true;
        if (d < 0) overdue = true;
        dueItems.push({ key: k, type: r.type, title: r.title, due: r.nextDue, days: d });
      }
    });
    if (pet.status === 'Deceased') return { label: 'Deceased', cls: 'chip-grey', vaxDue: false, checkDue: false, overdue: false, dueItems: [] };
    var label = pet.status === 'In Treatment' ? 'In Treatment' : vaxDue ? 'Vaccination Due' : checkDue ? 'Checkup Due' : 'Healthy';
    var cls = label === 'Healthy' ? 'chip-green' : label === 'In Treatment' ? 'chip-blue' : overdue ? 'chip-red' : 'chip-amber';
    return { label: label, cls: cls, vaxDue: vaxDue, checkDue: checkDue, overdue: overdue, dueItems: dueItems };
  };
  function digits(s) { return String(s).replace(/\D/g, ''); }
  VZ.addPet = function (d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('pets.add')) return denied();
    var err = {}, today = VZ.today();
    var name = String(d.name || '').trim(), breed = String(d.breed || '').trim();
    var ownerName = String(d.ownerName || '').trim(), phone = String(d.ownerPhone || '').trim();
    if (!name) err.name = 'Enter the pet name.'; else if (name.length > 40) err.name = 'Keep the name under 40 characters.';
    if (d.species !== 'Dog' && d.species !== 'Cat') err.species = 'Choose dog or cat.';
    if (!breed) err.breed = 'Enter the breed (or "Mixed breed").';
    if (d.sex !== 'M' && d.sex !== 'F') err.sex = 'Choose male or female.';
    if (!d.birth) err.birth = 'Enter the birth date (an estimate is fine).';
    else if (d.birth > today) err.birth = 'The birth date cannot be in the future.';
    if (!ownerName) err.ownerName = 'Enter the owner name.';
    if (digits(phone).length < 7 || digits(phone).length > 13) err.ownerPhone = 'Enter a phone number with 7 to 13 digits.';
    if (Object.keys(err).length) return { ok: false, errors: err };
    var owner = VZ.db.owners.filter(function (o) { return o.name.toLowerCase() === ownerName.toLowerCase() && digits(o.phone) === digits(phone); })[0];
    if (!owner) { owner = { id: VZ.uid('o'), name: ownerName, phone: phone }; VZ.db.owners.push(owner); }
    var pet = { id: VZ.uid('pt'), name: name, species: d.species, breed: breed, sex: d.sex, birth: d.birth, ownerId: owner.id, status: 'Healthy', created: today };
    VZ.db.pets.push(pet);
    VZ.log('pet', 'Added pet ' + name + ' (owner: ' + owner.name + ')', me);
    VZ.save();
    return { ok: true, pet: pet };
  };
  VZ.setPetStatus = function (petId, status) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('pets.status')) return denied();
    var pet = VZ.findPet(petId);
    if (!pet || ['Healthy', 'In Treatment'].indexOf(status) < 0) return { ok: false };
    if (pet.status === 'Deceased') return { ok: false, error: 'A deceased pet cannot be reactivated using the normal status control. Contact an admin.' };
    pet.status = status;
    VZ.log('pet', pet.name + ' marked as ' + status, me);
    VZ.save();
    return { ok: true };
  };

  /* Pet death requests: staff submit, admins decide. Pending requests never change the pet. */
  VZ.petDeathRequests = function (status) {
    var me = actor(); if (!me) return [];
    return VZ.db.petStatusRequests.filter(function (r) { return (me.role === 'admin' || r.byId === me.id) && (!status || r.status === status); });
  };
  function deathDateError(pet, date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) === '0000') {
      return 'Enter a valid date of death.';
    }
    var parsed = new Date(date + 'T00:00:00Z');
    if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      return 'Enter a valid calendar date of death.';
    }
    if (date > VZ.today()) return 'The date of death cannot be in the future.';
    if (pet.birth && date < pet.birth) return 'The date of death cannot be before the pet\'s birth date.';
    return '';
  }
  VZ.requestPetDeath = function (petId, details) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('pets.status')) return denied();
    var pet = VZ.findPet(petId), errors = {};
    if (!pet || pet.status === 'Deceased') return { ok: false, error: 'This pet cannot be submitted for a death status change.' };
    var date = String(details.date || ''), location = String(details.location || ''), notes = String(details.notes || '').trim();
    var dateError = deathDateError(pet, date);
    if (dateError) errors.date = dateError;
    if (['At clinic', 'Outside clinic', 'Unknown'].indexOf(location) < 0) errors.location = 'Choose where the death occurred.';
    if (notes.length > 500) errors.notes = 'Keep notes within 500 characters.';
    if (Object.keys(errors).length) return { ok: false, errors: errors };
    if (VZ.db.petStatusRequests.some(function (r) { return r.petId === petId && r.status === 'pending'; })) return { ok: false, error: 'A death status request for this pet is already pending.' };
    var direct = me.role === 'admin';
    var r = { id: VZ.uid('pd'), petId: petId, date: date, location: location, notes: notes, status: direct ? 'approved' : 'pending', by: me.username, byId: me.id, at: VZ.nowStr(), reviewedBy: direct ? me.username : '', reviewedAt: '', note: '', auto: direct };
    if (direct) {
      r.reviewedAt = r.at;
      pet.status = 'Deceased';
      pet.deceased = { date: date, location: location, notes: notes, approvedBy: me.username, approvedAt: r.at };
    }
    VZ.db.petStatusRequests.push(r);
    VZ.log('pet', direct ? 'Marked ' + pet.name + ' as deceased' : 'Requested deceased status for ' + pet.name + ' (pending admin approval)', me);
    VZ.audit(direct ? 'pet.deceased.approved' : 'pet.deceased.submit', pet.name, direct ? 'Deceased status recorded directly by admin' : 'Death status request submitted', me);
    VZ.save(); return { ok: true, request: r, pending: !direct };
  };
  VZ.reviewPetDeath = function (id, decision, note) {
    var me = actor(); if (!me) return needSignIn(); if (me.role !== 'admin') return denied();
    var r = VZ.db.petStatusRequests.filter(function (x) { return x.id === id; })[0];
    if (!r || r.status !== 'pending') return { ok: false, error: 'Request is no longer pending.' };
    if (decision !== 'approve' && decision !== 'reject') return { ok: false, error: 'Invalid decision.' };
    note = String(note || '').trim();
    if (decision === 'reject' && !note) return { ok: false, errors: { note: 'Explain why the request was rejected.' } };
    if (note.length > 200) return { ok: false, errors: { note: 'Note is too long.' } };
    var pet = VZ.findPet(r.petId);
    if (!pet || (decision === 'approve' && pet.status === 'Deceased')) return { ok: false, error: 'Pet is missing or already deceased.' };
    if (decision === 'approve') {
      var dateError = deathDateError(pet, r.date);
      if (dateError) return { ok: false, error: 'Cannot approve this request: ' + dateError };
    }
    r.status = decision === 'approve' ? 'approved' : 'rejected'; r.reviewedBy = me.username; r.reviewedAt = VZ.nowStr(); r.note = note;
    if (decision === 'approve') { pet.status = 'Deceased'; pet.deceased = { date: r.date, location: r.location, notes: r.notes, approvedBy: me.username, approvedAt: r.reviewedAt }; }
    VZ.log('pet', 'Death status request ' + r.status + ' for ' + pet.name, me);
    VZ.audit('pet.deceased.' + r.status, pet.name, 'Request ' + r.id, me);
    VZ.save(); return { ok: true };
  };

  /* ------------------------------------------- medical history entries */
  // A staff entry starts as pending and is not finalized medical history until an admin approves it.
  // An admin's own entry is finalized at once (there is no one above to approve it).
  function statusFor(me) {
    return VZ.can('medical.review')
      ? { status: 'approved', reviewedBy: me.username, reviewedAt: VZ.nowStr(), reviewNote: 'Entered by admin', auto: true }
      : { status: 'pending', reviewedBy: '', reviewedAt: '', reviewNote: '', auto: false };
  }
  function recordLabel(r) {
    var pet = VZ.findPet(r.petId);
    return (pet ? pet.name : 'Unknown pet') + ': ' + r.title + ' (' + VZ.fmtDate(r.date) + ')';
  }
  VZ.recordLabel = recordLabel;
  VZ.addRecord = function (petId, d) {   // vaccinations
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('medical.submit')) return denied();
    var err = {}, today = VZ.today(), pet = VZ.findPet(petId);
    if (!pet) return { ok: false, errors: { title: 'This pet no longer exists.' } };
    if (d.type !== 'vaccination') err.type = 'Choose a record type.';
    if (!d.date) err.date = 'Enter the date.'; else if (d.date > today) err.date = 'The date cannot be in the future.';
    var title = String(d.title || '').trim();
    if (!title) err.title = 'Enter a short title, such as "Rabies vaccine".'; else if (title.length > 80) err.title = 'Keep the title under 80 characters.';
    if (String(d.notes || '').length > 500) err.notes = 'Keep the notes under 500 characters.';
    if (d.nextDue && d.date && d.nextDue <= d.date) err.nextDue = 'The next due date must be after the record date.';
    if (Object.keys(err).length) return { ok: false, errors: err };
    var rec = { id: VZ.uid('r'), petId: petId, type: 'vaccination', date: d.date, title: title, notes: String(d.notes || '').trim(), nextDue: d.nextDue || '', by: me.username, ts: VZ.nowStr() };
    var st = statusFor(me);
    Object.keys(st).forEach(function (k) { rec[k] = st[k]; });
    VZ.db.records.push(rec);
    VZ.log('pet', 'Added a vaccination record for ' + pet.name + (st.status === 'pending' ? ' (waiting for approval)' : ''), me);
    VZ.audit(st.status === 'pending' ? 'medical.submit' : 'medical.direct', recordLabel(rec), 'Vaccination entry', me);
    VZ.save();
    return { ok: true, record: rec, pending: st.status === 'pending' };
  };

  function validateVisit(d) {
    var err = {}, today = VZ.today();
    var clean = {
      kind: d.kind, date: d.date, reason: String(d.reason || '').trim(), happened: String(d.happened || '').trim(),
      exam: String(d.exam || '').trim(), treatment: String(d.treatment || '').trim(), outcome: String(d.outcome || '').trim(), nextDue: d.nextDue || ''
    };
    if (['medical', 'checkup'].indexOf(clean.kind) < 0) err.kind = 'Choose the visit type.';
    if (!clean.date) err.date = 'Enter the visit date.'; else if (clean.date > today) err.date = 'The visit date cannot be in the future.';
    if (!clean.reason) err.reason = 'Enter the reason for the visit.'; else if (clean.reason.length > 80) err.reason = 'Keep the reason under 80 characters.';
    function longText(key, max, msg) {
      if (!clean[key]) err[key] = msg; else if (clean[key].length > max) err[key] = 'Keep this under ' + max + ' characters.';
    }
    longText('happened', 1000, 'Describe what happened to the pet.');
    longText('exam', 600, 'Write the examination or procedures done, or "None".');
    longText('treatment', 600, 'Write the treatments or medications given, or "None".');
    longText('outcome', 600, 'Write the result or outcome of the visit.');
    if (clean.nextDue && clean.date && clean.nextDue <= clean.date) err.nextDue = 'The follow-up date must be after the visit date.';
    return { errors: err, clean: clean };
  }
  VZ.addVisit = function (petId, d) {
    var me = actor(); if (!me) return needSignIn(); if (!VZ.can('medical.submit')) return denied();
    var pet = VZ.findPet(petId);
    if (!pet) return { ok: false, errors: { reason: 'This pet no longer exists.' } };
    var v = validateVisit(d);
    if (Object.keys(v.errors).length) return { ok: false, errors: v.errors };
    var c = v.clean;
    var rec = {
      id: VZ.uid('r'), petId: petId, type: c.kind, date: c.date, title: c.reason, notes: '', happened: c.happened, exam: c.exam,
      treatment: c.treatment, outcome: c.outcome, nextDue: c.nextDue, by: me.username, ts: VZ.nowStr()
    };
    var st = statusFor(me);
    Object.keys(st).forEach(function (k) { rec[k] = st[k]; });
    VZ.db.records.push(rec);
    VZ.log('pet', 'Added a visit record for ' + pet.name + ': ' + c.reason + (st.status === 'pending' ? ' (waiting for approval)' : ''), me);
    VZ.audit(st.status === 'pending' ? 'medical.submit' : 'medical.direct', recordLabel(rec), 'Visit entry', me);
    VZ.save();
    return { ok: true, record: rec, pending: st.status === 'pending' };
  };
  // Admins can edit any entry. Staff can only fix their own entry while it is pending or rejected,
  // and fixing it sends it back for approval. Staff can never change an approved entry.
  VZ.canEditRecord = function (rec) {
    var me = actor(); if (!me || !rec) return false;
    if (VZ.can('medical.edit')) return true;
    return VZ.can('medical.submit') && rec.by === me.username && !isApproved(rec) ;
  };
  VZ.updateVisit = function (recordId, d) {
    var me = actor(); if (!me) return needSignIn();
    var rec = VZ.db.records.filter(function (r) { return r.id === recordId && (r.type === 'medical' || r.type === 'checkup'); })[0];
    if (!rec) return { ok: false, errors: { reason: 'This visit record could not be found.' } };
    if (!VZ.canEditRecord(rec)) return denied(isApproved(rec) ? 'Only an admin can change an approved entry.' : 'You can only change your own entries.');
    var v = validateVisit(d);
    if (Object.keys(v.errors).length) return { ok: false, errors: v.errors };
    var c = v.clean, pet = VZ.findPet(rec.petId), staffEdit = !VZ.can('medical.edit');
    rec.type = c.kind; rec.date = c.date; rec.title = c.reason; rec.notes = ''; rec.happened = c.happened; rec.exam = c.exam;
    rec.treatment = c.treatment; rec.outcome = c.outcome; rec.nextDue = c.nextDue; rec.updated = VZ.nowStr(); rec.updatedBy = me.username;
    if (staffEdit) { rec.status = 'pending'; rec.reviewedBy = ''; rec.reviewedAt = ''; rec.reviewNote = ''; }
    VZ.log('pet', 'Edited a visit record for ' + (pet ? pet.name : 'a pet') + ': ' + c.reason, me);
    if (!staffEdit) VZ.audit('medical.edit', recordLabel(rec), 'Visit entry edited', me);
    else VZ.audit('medical.submit', recordLabel(rec), 'Visit entry corrected and sent again', me);
    VZ.save();
    return { ok: true, record: rec, pending: !isApproved(rec) };
  };
  VZ.reviewRecord = function (recordId, decision, note) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('medical.review')) return denied('Only an admin can review medical history entries.');
    var rec = VZ.db.records.filter(function (r) { return r.id === recordId; })[0];
    if (!rec) return { ok: false, error: 'This entry could not be found.' };
    if (rec.status !== 'pending') return { ok: false, error: 'This entry was already ' + (rec.status || 'approved') + '.' };
    if (rec.by === me.username) return denied('You cannot review your own submission.');
    note = String(note || '').trim();
    if (note.length > 200) return { ok: false, errors: { note: 'Keep the note under 200 characters.' } };
    if (decision === 'reject' && note.length < 3) return { ok: false, errors: { note: 'Write a short reason for rejecting this entry.' } };
    if (decision !== 'approve' && decision !== 'reject') return { ok: false, error: 'Unknown decision.' };
    rec.status = decision === 'approve' ? 'approved' : 'rejected';
    rec.reviewedBy = me.username; rec.reviewedAt = VZ.nowStr(); rec.reviewNote = note; rec.auto = false;
    VZ.audit('medical.' + decision, recordLabel(rec), 'Submitted by ' + rec.by + (note ? '. Note: ' + note : ''), me);
    VZ.log('pet', 'Medical entry ' + rec.status + ' for ' + (VZ.findPet(rec.petId) || { name: 'a pet' }).name, me);
    VZ.save();
    return { ok: true, record: rec };
  };
  // Removes exactly one entry. The pet's profile and its other entries are not touched.
  VZ.deleteRecord = function (recordId) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('medical.delete')) return denied('Only an admin can delete medical history entries.');
    var rec = VZ.db.records.filter(function (r) { return r.id === recordId; })[0];
    if (!rec) return { ok: false, error: 'This entry could not be found.' };
    var label = recordLabel(rec);
    VZ.db.records = VZ.db.records.filter(function (r) { return r.id !== recordId; });
    VZ.audit('medical.delete', label, 'Entry removed. It was ' + (rec.status || 'approved') + ' and submitted by ' + rec.by, me);
    VZ.log('pet', 'Deleted a medical entry: ' + label, me);
    VZ.save();
    return { ok: true };
  };
  VZ.lastVisit = function (petId) { var r = VZ.petRecords(petId)[0]; return r ? r.date : null; };
  VZ.visitCount = function (petId) {
    return VZ.petRecords(petId).filter(function (r) { return r.type === 'medical' || r.type === 'checkup'; }).length;
  };
  // Medical entries by status. Staff only see their own.
  VZ.recordsByStatus = function (status) {
    var me = actor(); if (!me) return [];
    return VZ.db.records.filter(function (r) { return r.status === status && (me.role === 'admin' || r.by === me.username); })
      .sort(function (a, b) { return (b.ts || b.date) < (a.ts || a.date) ? -1 : 1; });
  };
  // Entries a person reviewed (not the admin's own automatic approvals).
  VZ.reviewedRecords = function () {
    var me = actor(); if (!me) return [];
    return VZ.db.records.filter(function (r) { return (r.status === 'approved' || r.status === 'rejected') && r.reviewedAt && !r.auto && (me.role === 'admin' || r.by === me.username); })
      .sort(function (a, b) { return b.reviewedAt < a.reviewedAt ? -1 : 1; });
  };
  VZ.pendingApprovalCount = function () {
    if (!VZ.can('inventory.review')) return 0;
    return VZ.db.requests.filter(function (r) { return r.status === 'pending'; }).length + VZ.db.records.filter(function (r) { return r.status === 'pending'; }).length + VZ.db.petStatusRequests.filter(function (r) { return r.status === 'pending'; }).length;
  };

  /* ------------------------------------------------------------ users */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  // Optional contact fields shared by Create account and Profile. Writes problems into err and returns the cleaned values.
  function checkProfileFields(d, err) {
    var o = {
      email: String(d.email || '').trim(), phone: String(d.phone || '').trim(), gender: String(d.gender || ''), dob: String(d.dob || ''),
      address: String(d.address || '').trim(), idNumber: String(d.idNumber || '').trim()
    };
    if (o.email && (!EMAIL_RE.test(o.email) || o.email.length > 80)) err.email = 'Enter a valid email address, such as name@example.com.';
    if (o.phone && (digits(o.phone).length < 7 || digits(o.phone).length > 13)) err.phone = 'Enter a phone number with 7 to 13 digits.';
    if (o.gender && ['Male', 'Female'].indexOf(o.gender) < 0) err.gender = 'Choose male or female.';
    if (o.dob && (o.dob > VZ.today() || o.dob < '1900-01-01')) err.dob = 'Enter a valid birth date that is not in the future.';
    if (o.address.length > 120) err.address = 'Keep the address under 120 characters.';
    if (o.idNumber.length > 30) err.idNumber = 'Keep the ID number under 30 characters.';
    return o;
  }
  // Shared by the admin's Create account and by self-service sign-up.
  function createUser(d, role, pending) {
    var err = {}, name = String(d.name || '').trim(), uname = String(d.username || '').trim();
    if (!name) err.name = 'Enter the full name.';
    if (!/^[a-z0-9._]{3,20}$/i.test(uname)) err.username = 'Use 3 to 20 letters, numbers, dots, or underscores.';
    else if (VZ.db.users.some(function (u) { return u.username.toLowerCase() === uname.toLowerCase(); })) err.username = 'This username is already taken.';
    if (String(d.password || '').length < 8) err.password = 'Use at least 8 characters.';
    if (['admin', 'staff'].indexOf(role) < 0) err.role = 'Choose a role.';
    var extra = checkProfileFields(d, err);
    if (Object.keys(err).length) return { ok: false, errors: err };
    var u = {
      id: VZ.uid('u'), displayId: VZ.nextDisplayId(VZ.db.users, role === 'admin' ? 'ADM' : 'STF'), username: uname, name: name, role: role, passHash: VZ.hash(uname, d.password), active: !pending, pending: !!pending, created: VZ.today(),
      email: extra.email, phone: extra.phone, gender: extra.gender, dob: extra.dob, address: extra.address, idNumber: extra.idNumber, startDate: VZ.today(), photo: '', seen: {}
    };
    VZ.db.users.push(u);
    return { ok: true, user: u };
  }
  VZ.addUser = function (d) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can create accounts here.');
    var r = createUser(d, d.role, false);
    if (!r.ok) return r;
    VZ.log('staff', 'Created ' + d.role + ' account for ' + r.user.name, me);
    VZ.audit('account.create', r.user.name, 'New ' + d.role + ' account (' + r.user.username + ')', me);
    VZ.save();
    return { ok: true };
  };
  // Self-service sign-up from the sign-in page. Always a staff account that waits for the admin to approve it.
  // There is no role in the request: the role cannot be chosen here.
  VZ.MAX_PENDING = 10;
  VZ.pendingCount = function () { return VZ.db.users.filter(function (u) { return u.pending; }).length; };
  VZ.register = function (d) {
    if (VZ.pendingCount() >= VZ.MAX_PENDING) return { ok: false, errors: { name: 'Too many account requests are waiting. Please ask the admin to review them first.' } };
    var r = createUser(d, 'staff', true);
    if (!r.ok) return r;
    VZ.log('staff', 'New account request from ' + r.user.name, null);
    VZ.save();
    return { ok: true };
  };
  VZ.approveUser = function (id) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can approve an account request.');
    var u = VZ.db.users.filter(function (x) { return x.id === id && x.pending; })[0];
    if (!u) return { ok: false, error: 'This account request could not be found.' };
    u.pending = false; u.active = true; u.startDate = VZ.today();
    VZ.log('staff', 'Approved the account of ' + u.name, me);
    VZ.audit('account.approve', u.name, 'Account request approved as ' + u.role, me);
    VZ.save();
    return { ok: true };
  };
  VZ.rejectUser = function (id) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can reject an account request.');
    var u = VZ.db.users.filter(function (x) { return x.id === id && x.pending; })[0];
    if (!u) return { ok: false, error: 'This account request could not be found.' };
    VZ.db.users = VZ.db.users.filter(function (x) { return x.id !== id; });
    VZ.log('staff', 'Rejected the account request of ' + u.name, me);
    VZ.audit('account.reject', u.name, 'Account request rejected', me);
    VZ.save();
    return { ok: true };
  };
  VZ.declineUser = VZ.rejectUser;
  function activeAdminsExcept(id) {
    return VZ.db.users.filter(function (u) { return u.role === 'admin' && u.active && u.id !== id; }).length;
  }
  VZ.toggleUser = function (id) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can turn accounts on or off.');
    var u = VZ.db.users.filter(function (x) { return x.id === id && !x.pending; })[0];
    if (!u) return { ok: false, error: 'This account could not be found.' };
    if (u.id === me.id) return { ok: false, error: 'You cannot turn off your own account.' };
    if (u.active && u.role === 'admin' && activeAdminsExcept(u.id) < 1) return { ok: false, error: 'There must always be at least one active admin.' };
    u.active = !u.active;
    VZ.log('staff', (u.active ? 'Turned on ' : 'Turned off ') + 'the account of ' + u.name, me);
    VZ.audit('account.toggle', u.name, u.active ? 'Account turned on' : 'Account turned off', me);
    VZ.save();
    return { ok: true, active: u.active };
  };
  VZ.resetPassword = function (id, password) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can reset passwords.');
    var u = VZ.db.users.filter(function (x) { return x.id === id && !x.pending; })[0];
    if (!u) return { ok: false, error: 'This account could not be found.' };
    if (String(password || '').length < 8) return { ok: false, errors: { password: 'Use at least 8 characters.' } };
    u.passHash = VZ.hash(u.username, password);
    VZ.log('staff', 'Reset the password of ' + u.name, me);
    VZ.audit('account.reset', u.name, 'Password reset by admin', me);
    VZ.save();
    return { ok: true };
  };
  // Only an admin can move an account between Staff and Admin, and must confirm with their own password.
  // Nobody can change their own role, and the last active admin cannot be demoted.
  VZ.changeRole = function (id, newRole, adminPassword) {
    var me = actor(); if (!me) return needSignIn();
    if (!VZ.can('users.manage')) return denied('Only an admin can change account roles.');
    var u = VZ.db.users.filter(function (x) { return x.id === id && !x.pending; })[0];
    if (!u) return { ok: false, error: 'This account could not be found.' };
    if (['admin', 'staff'].indexOf(newRole) < 0) return { ok: false, errors: { role: 'Choose Staff or Admin.' } };
    if (u.id === me.id) return denied('You cannot change your own role.');
    if (u.role === newRole) return { ok: false, errors: { role: 'This account is already ' + (newRole === 'admin' ? 'an admin' : 'staff') + '.' } };
    if (me.passHash !== VZ.hash(me.username, adminPassword || '')) return { ok: false, errors: { password: 'Your password is not correct.' } };
    if (u.role === 'admin' && u.active && activeAdminsExcept(u.id) < 1) return { ok: false, error: 'There must always be at least one active admin.' };
    var from = u.role;
    u.role = newRole;
    u.displayId = VZ.nextDisplayId(VZ.db.users, newRole === 'admin' ? 'ADM' : 'STF');
    VZ.log('staff', 'Changed the role of ' + u.name + ' to ' + newRole, me);
    VZ.audit('role.change', u.name, from + ' to ' + newRole, me);
    VZ.save();
    return { ok: true };
  };

  /* --------------------------------------------------------- profile */
  // These only ever change the signed-in person's own account, and never the role.
  VZ.updateProfile = function (d) {
    var me = actor(); if (!me) return needSignIn();
    var err = {}, name = String(d.name || '').trim();
    if (!name) err.name = 'Enter your full name.'; else if (name.length > 60) err.name = 'Keep the name under 60 characters.';
    var o = checkProfileFields(d, err);
    if (Object.keys(err).length) return { ok: false, errors: err };
    me.name = name; me.email = o.email; me.phone = o.phone; me.gender = o.gender; me.dob = o.dob; me.address = o.address;
    VZ.save();
    return { ok: true };
  };
  VZ.changePassword = function (user, current, next, confirm) {
    var me = actor(); if (!me) return needSignIn();
    var err = {};
    if (me.passHash !== VZ.hash(me.username, current || '')) err.current = 'The current password is not correct.';
    if (String(next || '').length < 8) err.next = 'Use at least 8 characters.';
    else if (next === current) err.next = 'Choose a password that is different from the current one.';
    if (next !== confirm) err.confirm = 'The passwords do not match.';
    if (Object.keys(err).length) return { ok: false, errors: err };
    me.passHash = VZ.hash(me.username, next);
    VZ.log('staff', me.name + ' changed their password', me);
    VZ.save();
    return { ok: true };
  };
  VZ.setPhoto = function (user, dataUrl) {
    var me = actor(); if (!me) return needSignIn();
    if (dataUrl && (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl) || dataUrl.length > 300000)) return { ok: false, error: 'This picture is not supported or is too large.' };
    me.photo = dataUrl || '';
    VZ.save();
    return { ok: true };
  };

  /* ---------------------------------------------------- notifications */
  // Stock alerts, pet checkup and vaccination reminders, and approval updates. Worked out from the
  // current records each time, so they change when the records change. Each one has a key (one per
  // item) and a signature. A notification is unread until it has been seen with its current signature.
  VZ.notifications = function () {
    var me = actor(); if (!me) return [];
    var list = [], today = VZ.today();
    VZ.alerts().forEach(function (a) {
      list.push({ kind: 'stock', key: 'stock:' + a.p.id + ':' + a.sev, sig: a.sig, level: a.level, sev: a.sev, title: a.title, text: a.text, label: '', href: 'inventory.html?q=' + encodeURIComponent(a.title) });
    });
    VZ.db.pets.forEach(function (pet) {
      var owner = VZ.findOwner(pet.ownerId);
      VZ.petState(pet).dueItems.forEach(function (d) {
        var overdue = d.days < 0, what = d.type === 'checkup' ? 'Checkup' : d.title;
        var when = d.days === 0 ? 'is due today' : overdue ? 'is overdue by ' + (-d.days) + ' day(s)' : 'is coming up in ' + d.days + ' day(s)';
        list.push({ kind: 'pet', key: 'pet:' + pet.id + ':' + d.key, sig: d.due + (overdue ? ':overdue' : ':upcoming'), level: overdue ? 'red' : 'amber', sev: overdue ? 5 : 2,
          title: pet.name + ' (owner: ' + owner.name + ')', text: what + ' ' + when + '. Scheduled ' + VZ.fmtDate(d.due) + '.', label: overdue ? 'Overdue' : 'Upcoming', href: 'pet.html?id=' + encodeURIComponent(pet.id) });
      });
    });
    if (me.role === 'admin') {
      var n = VZ.pendingApprovalCount(), a = VZ.pendingCount();
      if (n) list.push({ kind: 'approval', key: 'approvals', sig: String(n), level: 'amber', sev: 3, title: 'Waiting for your review', text: n + ' inventory or medical history submission(s) need a decision.', label: '', href: 'approvals.html' });
      if (a) list.push({ kind: 'approval', key: 'accounts', sig: String(a), level: 'amber', sev: 3, title: 'Account requests', text: a + ' new account request(s) are waiting for approval.', label: '', href: 'staff.html' });
    } else {
      var cutoff = VZ.addDays(today, -14);
      VZ.db.requests.filter(function (r) { return r.byId === me.id && r.status !== 'pending' && r.reviewedAt && r.reviewedAt.slice(0, 10) >= cutoff; }).forEach(function (r) {
        list.push({ kind: 'decision', key: 'req:' + r.id, sig: r.status, level: r.status === 'approved' ? 'green' : 'red', sev: r.status === 'approved' ? 1 : 2, title: 'Your inventory change was ' + r.status,
          text: VZ.requestSummary(r) + (r.note ? '. Note: ' + r.note : ''), label: '', href: 'approvals.html' });
      });
      VZ.db.records.filter(function (r) { return r.by === me.username && (r.status === 'approved' || r.status === 'rejected') && r.reviewedAt && !r.auto && r.reviewedAt.slice(0, 10) >= cutoff; }).forEach(function (r) {
        list.push({ kind: 'decision', key: 'rec:' + r.id, sig: r.status, level: r.status === 'approved' ? 'green' : 'red', sev: r.status === 'rejected' ? 2 : 1, title: 'Your medical entry was ' + r.status,
          text: recordLabel(r) + (r.reviewNote ? '. Note: ' + r.reviewNote : ''), label: '', href: 'pet.html?id=' + encodeURIComponent(r.petId) });
      });
    }
    list.sort(function (a, b) { return b.sev - a.sev || (a.title < b.title ? -1 : 1); });
    return list;
  };
  VZ.isUnread = function (n) { var me = actor(); return !!me && (me.seen || {})[n.key] !== n.sig; };
  VZ.unreadCount = function () { return VZ.notifications().filter(VZ.isUnread).length; };
  VZ.markNotificationsSeen = function () {
    var me = actor(); if (!me) return;
    var seen = {};
    VZ.notifications().forEach(function (n) { seen[n.key] = n.sig; });
    me.seen = seen;
    VZ.save();
  };

  /* ---------------------------------------------------------- icons */
  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11l2-8H6"/>',
    paw: '<circle cx="6" cy="11" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="19" cy="11" r="2"/><path d="M12 12c-3 0-6 3-6 5.5C6 19 7.5 20 9 20c1.2 0 1.8-.6 3-.6s1.8.6 3 .6c1.5 0 3-1 3-2.5C18 15 15 12 12 12z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2.5.6 4 2.4 4 5.5"/>',
    bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a2 2 0 003.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    peso: '<path d="M7 4v16M7 4h6a4 4 0 010 8H7M4 8h12M4 11h12"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.9 17.9A10.9 10.9 0 0112 19C5 19 1 12 1 12a18.5 18.5 0 015.1-5.9M9.9 4.2A9.1 9.1 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.2 3.2M1 1l22 22"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
    camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>'
  };
  VZ.icon = function (name, size) {
    var s = size || 20;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  };
  VZ.logoHTML = function (href) {
    return '<a class="logo" href="' + (href || 'dashboard.html') + '" aria-label="VetZone home"><img class="logo-img" src="img/vetzone-logo.png" alt="VetZone logo">' +
      '<span class="logo-text"><span class="vet">VET</span><span class="zone">ZONE</span></span></a>';
  };

  /* ------------------------------------------------------- UI helpers */
  VZ.modal = function (title, bodyHTML, opts) {
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + VZ.esc(title) + '">' +
      '<div class="modal-head"><h2>' + VZ.esc(title) + '</h2><button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>' +
      '<div class="modal-body">' + bodyHTML + '</div></div>';
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    var prev = document.activeElement, closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('[data-close]').addEventListener('click', close);
    var first = overlay.querySelector('input:not([type=hidden]),select,textarea,button.btn');
    if (first) first.focus();
    return { el: overlay.querySelector('.modal'), body: overlay.querySelector('.modal-body'), close: close };
  };
  VZ.confirm = function (title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      var answered = false;
      var m = VZ.modal(title, '<p>' + VZ.esc(message) + '</p><div class="modal-actions"><button type="button" class="btn btn-ghost" data-no>Cancel</button><button type="button" class="btn' + (danger ? ' btn-danger' : '') + '" data-yes>' + VZ.esc(okLabel || 'Confirm') + '</button></div>',
        { onClose: function () { if (!answered) { answered = true; resolve(false); } } });
      m.body.querySelector('[data-yes]').addEventListener('click', function () { answered = true; m.close(); resolve(true); });
      m.body.querySelector('[data-no]').addEventListener('click', function () { m.close(); });
    });
  };
  VZ.toast = function (msg, type) {
    var box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3800);
  };
  // A message for the whole form (for example "You do not have permission"), shown at the top of the form.
  VZ.showFormError = function (form, msg) {
    var el = form.querySelector('.form-error');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.insertBefore(el, form.firstChild); }
    el.textContent = msg;
  };
  VZ.showErrors = function (root, errors) {
    if (root.querySelector) { var fe = root.querySelector('.form-error'); if (fe) fe.remove(); }
    root.querySelectorAll('[data-err]').forEach(function (el) { el.textContent = ''; });
    root.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    Object.keys(errors || {}).forEach(function (k) {
      var e = root.querySelector('[data-err="' + k + '"]'), f = root.querySelector('[name="' + k + '"]');
      if (e) e.textContent = errors[k];
      if (f) f.setAttribute('aria-invalid', 'true');
    });
    var firstBad = root.querySelector('[aria-invalid="true"]');
    if (firstBad) firstBad.focus();
  };
  VZ.formData = function (form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) o[el.name] = el.value; });
    return o;
  };

  VZ.field = function (label, name, input, hint) {
    return '<label class="field"><span>' + label + '</span>' + input + (hint ? '<small class="hint">' + hint + '</small>' : '') + '<small class="err" data-err="' + name + '"></small></label>';
  };
  // A short message that survives a page change (shown once as a toast).
  VZ.flash = function (msg) { try { sessionStorage.setItem('vz_proto_flash', msg); } catch (e) { /* ignore */ } };
  VZ.showFlash = function () {
    try {
      var m = sessionStorage.getItem('vz_proto_flash');
      if (m) { sessionStorage.removeItem('vz_proto_flash'); VZ.toast(m); }
    } catch (e) { /* ignore */ }
  };
  VZ.avatarHTML = function (user, cls) {
    var initial = VZ.esc(user.name.trim().charAt(0).toUpperCase());
    return '<span class="avatar' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + (user.photo ? '<img src="' + VZ.esc(user.photo) + '" alt="">' : initial) + '</span>';
  };
  // Add or edit a visit record. opts.record = existing record to edit, opts.onSaved = callback.
  VZ.openVisitForm = function (pet, user, opts) {
    opts = opts || {};
    var rec = opts.record || null, today = VZ.today(), owner = VZ.findOwner(pet.ownerId);
    var m = VZ.modal((rec ? 'Edit visit record: ' : 'Add visit record: ') + pet.name,
      '<form id="visit-form" novalidate><p class="note"><b>' + VZ.esc(pet.name) + '</b> (' + VZ.esc(pet.species) + ', ' + VZ.esc(pet.breed) + ') &bull; Owner: ' + VZ.esc(owner.name) + '</p>' +
      (VZ.can('medical.review') ? '' : '<p class="note">' + (rec ? 'Saving your fix sends this entry back to the admin for approval.' : 'This entry will be marked Pending Admin Approval. It becomes part of the medical history only after the admin approves it.') + '</p>') +
      '<div class="form-grid">' +
      VZ.field('Visit type', 'kind', '<select class="select" name="kind"><option value="medical">Sick or injured</option><option value="checkup">Routine checkup</option></select>') +
      VZ.field('Visit date', 'date', '<input class="input" name="date" type="date" max="' + today + '" value="' + today + '">') +
      '<div style="grid-column:1/-1">' + VZ.field('Reason for visit', 'reason', '<input class="input" name="reason" maxlength="80" autocomplete="off">', 'For example: vomiting, limping, or yearly checkup.') + '</div>' +
      '<div style="grid-column:1/-1">' + VZ.field('What happened to the pet', 'happened', '<textarea class="textarea" name="happened" maxlength="1000"></textarea>', 'Signs, injury, or what the owner reported.') + '</div>' +
      '<div style="grid-column:1/-1">' + VZ.field('Examination or procedures performed', 'exam', '<textarea class="textarea" name="exam" maxlength="600"></textarea>', 'Write "None" if nothing was done.') + '</div>' +
      '<div style="grid-column:1/-1">' + VZ.field('Treatments or medications given', 'treatment', '<textarea class="textarea" name="treatment" maxlength="600"></textarea>', 'Include the dose if you know it. Write "None" if nothing was given.') + '</div>' +
      '<div style="grid-column:1/-1">' + VZ.field('Result or outcome', 'outcome', '<textarea class="textarea" name="outcome" maxlength="600"></textarea>', 'For example: recovered, improving, or recheck needed.') + '</div>' +
      '<div style="grid-column:1/-1">' + VZ.field('Follow-up or next checkup date', 'nextDue', '<input class="input" name="nextDue" type="date">', 'Optional. For a routine checkup, this sets the next checkup reminder.') + '</div>' +
      '</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="submit" class="btn">Save visit record</button></div></form>', { wide: true });
    var form = m.body.querySelector('form');
    if (rec) {
      form.elements.kind.value = rec.type; form.elements.date.value = rec.date; form.elements.reason.value = rec.title;
      form.elements.happened.value = rec.happened || rec.notes || ''; form.elements.exam.value = rec.exam || '';
      form.elements.treatment.value = rec.treatment || ''; form.elements.outcome.value = rec.outcome || ''; form.elements.nextDue.value = rec.nextDue || '';
    }
    m.body.querySelector('[data-cancel]').addEventListener('click', m.close);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = VZ.formData(form);
      var r = rec ? VZ.updateVisit(rec.id, data) : VZ.addVisit(pet.id, data);
      if (!r.ok) { VZ.showErrors(form, r.errors || {}); if (r.error) VZ.showFormError(form, r.error); return; }
      m.close();
      if (opts.onSaved) opts.onSaved(r);
    });
    return m;
  };

  /* ---------------------------------------------------------- charts */
  function niceStep(raw) {
    if (raw <= 0) return 1;
    var pow = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }
  VZ.lineChart = function (el, pts, label) {
    var W = 640, H = 250, m = { l: 66, r: 18, t: 16, b: 36 };
    var max = 1;
    pts.forEach(function (p) { if (p.value > max) max = p.value; });
    var step = niceStep(max / 4), top = Math.ceil(max / step) * step;
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    function x(i) { return m.l + (pts.length === 1 ? iw / 2 : (i * iw) / (pts.length - 1)); }
    function y(v) { return m.t + ih * (1 - v / top); }
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + VZ.esc(label) + '">', v;
    for (v = 0; v <= top + 0.0001; v += step) {
      svg += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#f0d9df" stroke-width="1"/>' +
        '<text x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">₱' + Math.round(v).toLocaleString('en-PH') + '</text>';
    }
    var path = '', area = '';
    pts.forEach(function (p, i) { path += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1); });
    area = path + 'L' + x(pts.length - 1).toFixed(1) + ' ' + y(0) + 'L' + x(0).toFixed(1) + ' ' + y(0) + 'Z';
    svg += '<path d="' + area + '" fill="#ff5fa2" fill-opacity="0.12"/><path d="' + path + '" fill="none" stroke="#c8266f" stroke-width="2.5" stroke-linejoin="round"/>';
    var every = Math.ceil(pts.length / 7);
    pts.forEach(function (p, i) {
      svg += '<g class="chart-point" data-chart-point="' + i + '" tabindex="0" role="button" aria-label="' + VZ.esc(p.tip) + '">' +
        '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="12" fill="transparent"/>' +
        '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="4" fill="#fff" stroke="#c8266f" stroke-width="2"/></g>';
      if (i % every === 0 || i === pts.length - 1) svg += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' + VZ.esc(p.label) + '</text>';
    });
    var tooltipId = (el.id || 'sales-chart') + '-tooltip';
    el.classList.add('chart-with-details');
    el.innerHTML = svg + '</svg><div class="chart-tooltip" id="' + tooltipId + '" role="tooltip" hidden><div class="chart-tooltip-content"></div><button type="button" class="btn btn-ghost btn-sm" aria-label="Close sales details">Close</button></div>';
    var tooltip = el.querySelector('.chart-tooltip'), pinned = false;
    function hide() { tooltip.hidden = true; pinned = false; }
    function show(point, index) {
      var p = pts[index];
      tooltip.querySelector('.chart-tooltip-content').textContent = p.tip + (p.details && p.details.length ? '\n\n' + p.details.join('\n\n') : '\nNo sales recorded for this date.');
      tooltip.hidden = false;
      var host = el.getBoundingClientRect(), dot = point.getBoundingClientRect();
      tooltip.style.left = Math.max(0, Math.min(dot.left - host.left - tooltip.offsetWidth / 2, el.clientWidth - tooltip.offsetWidth)) + 'px';
      tooltip.style.top = (dot.bottom - host.top + 8) + 'px';
    }
    el.querySelectorAll('[data-chart-point]').forEach(function (point) {
      var index = Number(point.getAttribute('data-chart-point'));
      point.setAttribute('aria-describedby', tooltipId);
      point.addEventListener('pointerenter', function () { if (!pinned) show(point, index); });
      point.addEventListener('focus', function () { show(point, index); });
      point.addEventListener('blur', function (event) { if (!pinned && !tooltip.contains(event.relatedTarget)) hide(); });
      point.addEventListener('click', function () { pinned = true; show(point, index); });
      point.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pinned = true; show(point, index); }
        if (event.key === 'Escape') hide();
      });
    });
    tooltip.querySelector('button').addEventListener('click', hide);
    el.onpointerleave = function () { if (!pinned) hide(); };
    el.onkeydown = function (event) { if (event.key === 'Escape') hide(); };
  };
  VZ.donut = function (el, segs, total, label) {
    var R = 70, C = 2 * Math.PI * R, sum = 0, off = 0;
    segs.forEach(function (s) { sum += s.value; });
    var svg = '<svg viewBox="0 0 180 180" role="img" aria-label="' + VZ.esc(label) + '"><circle cx="90" cy="90" r="' + R + '" fill="none" stroke="#eceff0" stroke-width="22"/>';
    if (sum > 0) {
      segs.forEach(function (s) {
        if (!s.value) return;
        var len = (s.value / sum) * C;
        svg += '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 90 90)"/>';
        off += len;
      });
    }
    svg += '<text x="90" y="92" text-anchor="middle" class="donut-center-n">' + total + '</text><text x="90" y="110" text-anchor="middle" class="donut-center-l">items</text></svg>';
    el.innerHTML = svg;
  };

  /* ------------------------------------------------------ page shell */
  var NAV = [
    { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'grid' },
    { id: 'inventory', label: 'Inventory', href: 'inventory.html', icon: 'box' },
    { id: 'sales', label: 'Record sales', href: 'sales.html', icon: 'cart' },
    { id: 'pets', label: 'Pet records', href: 'pets.html', icon: 'paw' },
    { id: 'approvals', label: function (u) { return u.role === 'admin' ? 'Approvals' : 'My submissions'; }, href: 'approvals.html', icon: 'check' },
    { id: 'income', label: 'Income report', href: 'income.html', icon: 'chart', roles: ['admin'] },
    { id: 'staff', label: 'Staff accounts', href: 'staff.html', icon: 'users', roles: ['admin'] },
    { id: 'profile', label: 'Profile', href: 'profile.html', icon: 'user' }
  ];
  function bellHTML() {
    var all = VZ.notifications(), list = all.slice(0, 12), unread = all.filter(VZ.isUnread).length;
    var html = '<h2>Notifications' + (unread ? ' <span class="chip chip-amber new-chip">' + unread + ' new</span>' : '') + '</h2>';
    if (!list.length) html += '<p class="empty-note">Nothing needs your attention right now.</p>';
    else {
      html += '<ul class="alert-list">' + list.map(function (n) {
        var label = n.label ? ' <span class="chip ' + (n.level === 'red' ? 'chip-red' : 'chip-amber') + ' new-chip">' + n.label + '</span>' : '';
        var fresh = VZ.isUnread(n) ? ' <span class="chip chip-blue new-chip">New</span>' : '';
        return '<li><a href="' + n.href + '"><i class="dot dot-' + n.level + '"></i><div><b>' + VZ.esc(n.title) + label + fresh + '</b><span>' + VZ.esc(n.text) + '</span></div></a></li>';
      }).join('') + '</ul>';
    }
    html += '<div class="bell-foot"><a class="item" href="pets.html">' + VZ.icon('paw', 18) + ' Pet records</a><a class="item" href="inventory.html">' + VZ.icon('box', 18) + ' Inventory' + (all.length > 12 ? ' (' + (all.length - 12) + ' more notifications)' : '') + '</a></div>';
    return { html: html, unread: unread };
  }
  // Rebuilds the list and the unread number from the current records.
  VZ.refreshBell = function () {
    var panel = document.getElementById('bell-panel'), count = document.getElementById('bell-count');
    if (!panel || !count) return;
    var b = bellHTML();
    panel.innerHTML = b.html;
    count.textContent = b.unread > 99 ? '99+' : b.unread;
    count.hidden = b.unread === 0;
  };

  // Keeps the numbers in the menu and the bell in step after something is approved, rejected, or submitted.
  VZ.refreshNavBadges = function () {
    [['staff.html', VZ.pendingCount()], ['approvals.html', VZ.pendingApprovalCount()]].forEach(function (x) {
      var link = document.querySelector('.nav a[href="' + x[0] + '"]');
      if (!link) return;
      var badge = link.querySelector('.nav-badge');
      if (!x[1]) { if (badge) badge.remove(); return; }
      if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; link.appendChild(badge); }
      badge.textContent = x[1];
    });
    VZ.refreshBell();
  };

  VZ.init = function (page, opts) {
    var user = VZ.currentUser();
    if (!user) { location.replace('index.html'); return null; }
    if (opts.roles && opts.roles.indexOf(user.role) < 0) { location.replace('dashboard.html'); return null; }
    document.title = opts.title + ' | VetZone VetCare System';
    var nav = NAV.filter(function (n) { return !n.roles || n.roles.indexOf(user.role) >= 0; }).map(function (n) {
      var badge = '', waiting = n.id === 'staff' ? VZ.pendingCount() : n.id === 'approvals' ? VZ.pendingApprovalCount() : 0;
      if (waiting) badge = '<span class="nav-badge" aria-label="' + waiting + ' waiting">' + waiting + '</span>';
      var label = typeof n.label === 'function' ? n.label(user) : n.label;
      return '<a href="' + n.href + '"' + (n.id === page ? ' aria-current="page"' : '') + '>' + VZ.icon(n.icon, 22) + '<span>' + label + '</span>' + badge + '</a>';
    }).join('');
    var b = bellHTML();
    // Preserve the page's static HTML structure before building the shared application shell.
    var staticTemplate = document.getElementById('vz-static-page');
    document.getElementById('app').innerHTML =
      '<div class="app"><aside class="sidebar">' + VZ.logoHTML() +
      '<div class="nav-label">Main menu</div><nav class="nav" aria-label="Main menu">' + nav + '</nav>' +
      '<div class="sidebar-foot">VetZone VetCare System<br>Prototype</div></aside>' +
      '<div class="main-col"><header class="topbar"><div class="page-title"><span class="badge-ico">' + VZ.icon(opts.icon || 'grid', 26) + '</span><div><h1>' + VZ.esc(opts.title) + '</h1><p>' + VZ.esc(opts.subtitle || '') + '</p></div></div>' +
      '<div class="top-actions">' +
      '<button type="button" class="icon-btn" id="bell-btn" aria-label="Notifications" aria-expanded="false">' + VZ.icon('bell', 24) + '<span class="bell-count" id="bell-count"' + (b.unread ? '' : ' hidden') + '>' + (b.unread > 99 ? '99+' : b.unread) + '</span></button>' +
      '<div class="dropdown bell-panel" id="bell-panel" hidden>' + b.html + '</div>' +
      '<button type="button" class="user-chip" id="user-btn" aria-expanded="false">' + VZ.avatarHTML(user) + '<span class="who"><b>' + VZ.esc(user.name) + '</b><span>' + (user.role === 'admin' ? 'Admin' : 'Staff') + '</span></span></button>' +
      '<div class="dropdown" id="user-menu" hidden><a class="item" href="profile.html">' + VZ.icon('user', 18) + ' My profile</a><button type="button" class="item" id="logout-btn">' + VZ.icon('logout', 18) + ' Log out</button></div>' +
      '</div></header><main class="content" id="main"></main></div></div>';

    if (staticTemplate) {
      var destination = document.getElementById('main');
      // HTML <template> elements keep children in .content, not as direct children.
      // Ordinary static containers use their direct children instead.
      var source = staticTemplate.content || staticTemplate;
      while (source.firstChild) destination.appendChild(source.firstChild);
      destination.querySelectorAll('[data-icon]').forEach(function (el) {
        el.innerHTML = VZ.icon(el.getAttribute('data-icon'), Number(el.getAttribute('data-size')) || 18);
      });
    }

    function wire(btnId, panelId, otherId) {
      var btn = document.getElementById(btnId), panel = document.getElementById(panelId);
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.hidden;
        document.getElementById(otherId).hidden = true;
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
    }
    wire('bell-btn', 'bell-panel', 'user-menu');
    // Opening the bell shows what is new, then marks everything as read.
    document.getElementById('bell-btn').addEventListener('click', function () {
      if (document.getElementById('bell-panel').hidden) return;
      VZ.refreshBell();
      VZ.markNotificationsSeen();
      document.getElementById('bell-count').hidden = true;
    });
    wire('user-btn', 'user-menu', 'bell-panel');
    document.addEventListener('click', function (e) {
      ['bell-panel', 'user-menu'].forEach(function (id) {
        var p = document.getElementById(id);
        if (p && !p.hidden && !p.contains(e.target)) p.hidden = true;
      });
    });
    document.getElementById('logout-btn').addEventListener('click', VZ.logout);
    VZ.showFlash();
    return { user: user, main: document.getElementById('main') };
  };
})();
