/* Help: simple step-by-step guides. Every button name here matches the words on the screen.
   Staff and admin see the button names and topics that apply to them. */
(function () {
  'use strict';
  var ctx = VZ.init('help', { title: 'Help', subtitle: 'Simple steps for using the VetZone system.', icon: 'help' });
  if (!ctx) return;
  var admin = ctx.user.role === 'admin';

  // b = a button name, f = a box or field name. Shown in a style that looks like the screen.
  function b(text) { return '<span class="ui-btn">' + VZ.esc(text) + '</span>'; }
  function f(text) { return '<b class="ui-field">' + VZ.esc(text) + '</b>'; }
  function either(staffText, adminText) { return admin ? adminText : staffText; }
  var send = function (adminButton) { return admin ? b(adminButton) : b('Send for approval'); };
  var waitNote = admin ? '' : 'Your change is checked by the admin first. Nothing changes until the admin approves it. You can follow it in My submissions.';

  var menuNames = admin
    ? ['Dashboard', 'Inventory', 'Record sales', 'Clinic', 'Pet records', 'Approvals', 'Income report', 'Staff accounts', 'Profile', 'Help']
    : ['Dashboard', 'Inventory', 'Record sales', 'Clinic', 'Pet records', 'My submissions', 'Profile', 'Help'];

  var TOPICS = [
    // ---------- Getting started
    { group: 'Getting started', id: 'pages', q: 'How do I open the pages?', go: ['dashboard.html', 'Dashboard'], steps: [
      'On a computer or laptop, the menu is on the left side of the screen. Click a name to open that page.',
      'On a phone, tap ' + b('Menu') + ' at the top. Tap a page name. Tap ' + b('Close') + ' to hide the menu again.',
      'On a tablet, the menu shows small pictures on the left. Tap a picture to open that page.',
      'The pages, from top to bottom: ' + menuNames.map(function (n) { return f(n); }).join(', ') + '.'
    ] },
    { group: 'Getting started', id: 'signout', q: 'How do I sign out?', steps: [
      'Tap the round letter of your name at the top of the screen.',
      'Tap ' + b('Log out') + '.',
      'To come back, type your ' + f('Username') + ' and ' + f('Password') + ', then tap ' + b('Log in') + '.'
    ], note: 'Always sign out when you leave the computer, so no one else can use your account.' },
    { group: 'Getting started', id: 'bell', q: 'What does the bell at the top mean?', steps: [
      'The bell shows reminders. A number on the bell means there are new ones.',
      'Tap the bell to read them. Tap a reminder to open the page it is about.',
      'Reminders tell you about items that are running low or expiring, and pets that are due for a checkup or vaccine.' +
        (admin ? ' They also tell you when staff changes are waiting for your approval.' : ' They also tell you when the admin approves or rejects something you sent.')
    ] },

    // ---------- Sales
    { group: 'Sales', id: 'sale', q: 'How do I record a sale?', go: ['sales.html', 'Record sales'], quick: 'Record a sale', steps: [
      'Open ' + f('Record sales') + '.',
      'Find the item. Type its name or code in ' + f('Search item name or code') + ', or tap a group like ' + b('Medicine') + '.',
      'Tap ' + b('Add to order') + '. Do this for every item the customer is buying.',
      'Check ' + f('Current order') + '. Tap ' + b('+') + ' or ' + b('−') + ' to change how many. Tap the trash can to remove an item.',
      'Under ' + f('Payment method') + ', tap ' + b('Cash') + ' or ' + b('Online payment') + '.',
      'If there is a discount, type it in ' + f('Discount (%)') + '.',
      'Tap ' + b('Review sale') + '.',
      'If the customer paid cash, type the money they gave you in ' + f('Cash received from customer') + '. The system shows the ' + f('Customer change') + '.',
      'Check everything, then tap ' + b('Confirm and record sale') + '. To fix something first, tap ' + b('Back to order') + '.',
      'You will see ' + f('Sale recorded') + '. Tap ' + b('Start a new sale') + '.'
    ], note: 'The stock goes down by itself after the sale is recorded. This is the clinic\'s own record. It is not an official receipt.' },
    { group: 'Sales', id: 'service', q: 'How do I charge for a service, like a consultation or grooming?', go: ['sales.html', 'Record sales'], steps: [
      'Open ' + f('Record sales') + '.',
      'Tap ' + b('Services') + ' (next to ' + b('Products') + ').',
      'Tap ' + b('Add to order') + ' on the service.',
      'Finish like a normal sale: choose the ' + f('Payment method') + ', tap ' + b('Review sale') + ', then ' + b('Confirm and record sale') + '.'
    ], note: 'You can put products and services in the same sale. Tap ' + b('Products') + ' to go back to the items.' },
    { group: 'Sales', id: 'history', q: 'How do I see what was sold on a certain day?', go: ['sales.html', 'Record sales'], steps: [
      'Open ' + f('Record sales') + ' and tap ' + b('History') + '.',
      'You will see the latest day with sales: the total, the number of sales, and what was bought in each sale.',
      'Tap ' + b('Previous') + ' or ' + b('Next') + ' to move between days, or tap the date to choose a day.',
      'Tap ' + b('View') + ' to see one sale.'
    ] },
    { group: 'Sales', id: 'reverse', q: 'A sale was recorded by mistake. How do I cancel it?', go: ['sales.html', 'Record sales'], steps: [
      'Open ' + f('Record sales') + ' and tap ' + b('History') + '.',
      'Find the sale and tap ' + b('View') + '.',
      'Tap ' + b('Reverse entire sale') + '.',
      'Type the ' + f('Reason for reversal') + ', then tap ' + either(b('Request reversal'), b('Continue to confirmation') + ' and confirm on the next screen') + '.'
    ], note: admin ? 'The sale stays in the history, marked as reversed, and is not counted in income.' : 'The admin must approve it first. You can follow it in My submissions.' },

    // ---------- Stock
    { group: 'Stock (Inventory)', id: 'stock', q: 'How do I add stock that arrived?', go: ['inventory.html', 'Inventory'], quick: 'Add stock', steps: [
      'Open ' + f('Inventory') + '.',
      'Find the item. You can type its name or code in ' + f('Search item name or code') + '.',
      'Tap ' + b('+ Stock') + ' on the item\'s row.',
      'Type the ' + f('Quantity received') + ' and the ' + f('Expiry date') + ' printed on the box.',
      'Tap ' + send('Save stock') + '.'
    ], note: waitNote },
    { group: 'Stock (Inventory)', id: 'delivery', q: 'How do I record a supplier delivery with many items?', go: ['inventory.html', 'Inventory'], steps: [
      'Open ' + f('Inventory') + ' and tap ' + b('Receiving') + '.',
      'Tap ' + b('Receive delivery') + '.',
      'Type the ' + f('Supplier') + ' and the ' + f('Delivery reference') + ' (the number on the supplier\'s paper).',
      'For each item: choose the ' + f('Item') + ', then type the ' + f('Quantity') + ', ' + f('Unit cost') + ', and ' + f('Expiry') + '. Tap ' + b('+ Add line') + ' for the next item.',
      'Tap ' + send('Confirm receipt') + '.'
    ], note: waitNote },
    { group: 'Stock (Inventory)', id: 'newitem', q: 'How do I add a new item?', go: ['inventory.html', 'Inventory'], steps: [
      'Open ' + f('Inventory') + ' and tap ' + b('Add item') + '.',
      'Type the ' + f('Item name') + ', choose the ' + f('Category') + ', and type the ' + f('Price (₱)') + '.',
      'Type the ' + f('Starting stock') + ', the ' + f('Low-stock level') + ' (when the system should warn you), and the ' + f('Expiry date') + '.',
      'Tap ' + send('Save item') + '.'
    ], note: waitNote },
    { group: 'Stock (Inventory)', id: 'fixstock', q: 'The stock count is wrong, or some stock was damaged. What do I do?', go: ['inventory.html', 'Inventory'], steps: [
      'If the count is wrong: open ' + f('Inventory') + ', tap ' + b('Manage') + ' on the item, then tap ' + b('Correct the stock count') + '.',
      'If stock was damaged, expired, or lost: open ' + f('Inventory') + ', tap ' + b('Receiving') + ', then ' + b('Record stock loss') + '.',
      'Choose the ' + f('Batch') + ', type the ' + f('Quantity lost') + ', and choose the ' + f('Reason') + '.',
      'Tap ' + send('Confirm loss') + '.'
    ], note: waitNote },
    { group: 'Stock (Inventory)', id: 'labels', q: 'What do the colored labels mean?', go: ['inventory.html', 'Inventory'], steps: [
      '<span class="chip chip-green">In stock</span> There is enough.',
      '<span class="chip chip-amber">Low stock</span> It is running low. Order more soon.',
      '<span class="chip chip-amber">Expiring</span> Some of it expires within 30 days. Use or sell it first.',
      '<span class="chip chip-red">Expired stock</span> Some of it is past its expiry date and cannot be sold.',
      '<span class="chip chip-red">Out of stock</span> There is none left.',
      '<span class="chip chip-amber">Change pending</span> A staff change to this item is waiting for the admin.'
    ] },

    // ---------- Pets and clinic
    { group: 'Pets and clinic', id: 'addpet', q: 'How do I add a new pet?', go: ['pets.html', 'Pet records'], quick: 'Add a pet', steps: [
      'Open ' + f('Pet records') + ' and tap ' + b('Add pet') + '.',
      'Type the ' + f('Pet name') + ', choose the ' + f('Species') + ', type the ' + f('Breed') + ', choose the ' + f('Sex') + ', and pick the ' + f('Birth date') + '.',
      'Type the ' + f('Owner name') + ' and ' + f('Owner phone') + '.',
      'Tap ' + b('Save pet') + '.',
      'You can tap ' + b('Add visit record') + ' right away, or ' + b('Not now') + '.'
    ] },
    { group: 'Pets and clinic', id: 'visit', q: 'How do I write down a pet\'s visit?', go: ['pets.html', 'Pet records'], steps: [
      'Open ' + f('Pet records') + '. Find the pet and tap ' + b('View') + '.',
      'Tap ' + b('Add visit record') + '.',
      'Choose the ' + f('Visit type') + ' and ' + f('Visit date') + ', then fill in what happened, what was checked, the treatment given, and the result.',
      'If the pet needs to come back, pick the ' + f('Follow-up or next checkup date') + '.',
      'Tap ' + b('Save visit record') + '.'
    ], note: admin ? '' : 'Your visit record is checked by the admin first. It shows as Pending Admin Approval until then.' },
    { group: 'Pets and clinic', id: 'vaccine', q: 'How do I record a vaccine?', go: ['pets.html', 'Pet records'], steps: [
      'Open ' + f('Pet records') + '. Find the pet and tap ' + b('View') + '.',
      'Tap ' + b('Add vaccination') + '.',
      'Pick the ' + f('Date given') + ', choose the ' + f('Vaccine') + ', and pick the ' + f('Next due date') + '.',
      'Tap ' + b('Save vaccination') + '.'
    ], note: 'The system reminds you when the next vaccine is due.' },
    { group: 'Pets and clinic', id: 'appointment', q: 'How do I book an appointment?', go: ['clinic.html', 'Clinic'], steps: [
      'Open ' + f('Clinic') + ' and tap ' + b('New appointment') + '.',
      'Choose the ' + f('Pet') + ' and the ' + f('Purpose') + ', then pick the ' + f('Date') + ' and ' + f('Time') + '.',
      'Tap ' + b('Book appointment') + '.',
      'To change it later, tap ' + b('View') + ' on the appointment. You can ' + b('Reschedule') + ' or ' + b('Cancel appointment') + '. After the visit time, you can also mark whether the owner came.'
    ], note: 'You can also book from the pet\'s page: tap ' + b('Pet actions') + ', then ' + b('Book appointment') + '. The calendar also shows when pets are due for a vaccine or checkup.' },
    { group: 'Pets and clinic', id: 'stay', q: 'A pet will stay in the clinic. What do I do?', go: ['clinic.html', 'Clinic'], steps: [
      'Open ' + f('Clinic') + ' and tap ' + b('In clinic') + '.',
      'Tap ' + b('Check in pet') + '.',
      'Choose the ' + f('Pet') + ' and type the ' + f('Reason for clinic stay') + '.',
      'Tap ' + b('Confirm check-in') + '.',
      'When the pet goes home: open the pet\'s page, tap ' + b('Pet actions') + ', then ' + either(b('Request pet release'), b('Release pet home')) + '.'
    ] },
    { group: 'Pets and clinic', id: 'deceased', q: 'A pet passed away. What do I do?', go: ['pets.html', 'Pet records'], steps: [
      'Open ' + f('Pet records') + '. Find the pet and tap ' + b('View') + '.',
      'Tap ' + b('Pet actions') + '.',
      'Tap ' + either(b('Request deceased status'), b('Mark as deceased')) + ' and fill in the details.'
    ], note: (admin ? '' : 'The admin must approve it first. ') + 'Reminders for the pet stop, and its records are kept.' },

    // ---------- Your account
    { group: 'Your account', id: 'password', q: 'How do I change my password?', go: ['profile.html', 'Profile'], steps: [
      'Open ' + f('Profile') + '.',
      'Under ' + f('Change password') + ', type your ' + f('Current password') + '.',
      'Type your ' + f('New password') + ' (at least 8 characters), then type it again in ' + f('Confirm new password') + '.',
      'Tap ' + b('Update password') + '.'
    ], note: 'You can also change your details and tap ' + b('Save changes') + ', or tap ' + b('Change picture') + ' to add your photo.' }
  ];

  if (!admin) TOPICS.push(
    { group: 'Your account', id: 'pending', q: 'Why does it say "Pending Admin Approval"?', go: ['approvals.html', 'My submissions'], steps: [
      'Some changes are checked by the admin first: new stock, new items, stock corrections, visit records, vaccinations, and sale reversals.',
      'Until the admin approves it, nothing changes in the official records.',
      'Open ' + f('My submissions') + ' to see each one: ' + b('Pending') + ', ' + b('Approved') + ', or ' + b('Rejected') + '.',
      'If it was rejected, read the admin\'s note, fix it, and send it again.'
    ] }
  );

  if (admin) TOPICS.push(
    { group: 'For the admin', id: 'approve', q: 'How do I approve or reject staff changes?', go: ['approvals.html', 'Approvals'], quick: 'Approve changes', steps: [
      'Open ' + f('Approvals') + '. The number next to it shows how many are waiting.',
      'Tap a tab, for example ' + b('Inventory changes') + ' or ' + b('Medical history') + '.',
      'Tap ' + b('Review') + ' and read the change.',
      'Tap ' + b('Approve') + '. Or write why in ' + f('Note (needed when rejecting)') + ' and tap ' + b('Reject') + '.'
    ], note: 'Every decision is saved in the ' + b('Audit trail') + ' tab.' },
    { group: 'For the admin', id: 'income', q: 'How do I see the clinic\'s income?', go: ['income.html', 'Income report'], steps: [
      'Open ' + f('Income report') + '.',
      'Tap ' + b('Daily') + ', ' + b('Weekly') + ', or ' + b('Monthly') + '.',
      'To print it, tap ' + b('Print report') + '.'
    ], note: 'Reversed sales are not counted in income.' },
    { group: 'For the admin', id: 'account', q: 'How do I add a staff account?', go: ['staff.html', 'Staff accounts'], steps: [
      'Open ' + f('Staff accounts') + ' and tap ' + b('Create account') + '.',
      'Fill in the person\'s ' + f('Full name') + ', ' + f('Username') + ', and ' + f('Password') + ', and choose the ' + f('Role account') + '.',
      'Tap ' + b('Confirm') + '.',
      'Give the staff member their username and temporary password. Ask them to change their password in ' + f('Profile') + '.'
    ] },
    { group: 'For the admin', id: 'resetpw', q: 'A staff member forgot their password.', go: ['staff.html', 'Staff accounts'], steps: [
      'Open ' + f('Staff accounts') + '.',
      'Tap ' + b('Reset password') + ' on that person\'s row.',
      'Type a ' + f('New temporary password') + ' and tap ' + b('Save password') + '.',
      'Give them the new password and ask them to change it in ' + f('Profile') + '.'
    ] },
    { group: 'For the admin', id: 'price', q: 'How do I change the price of a service?', go: ['sales.html', 'Record sales'], steps: [
      'Open ' + f('Record sales') + ' and tap ' + b('Service prices') + '.',
      'Tap ' + b('Edit') + ' on the service.',
      'Type the new ' + f('Price') + ' and tap ' + b('Save service') + '.'
    ] }
  );

  // ---------- Draw the page
  var list = document.getElementById('help-list'), q = document.getElementById('help-q'), empty = document.getElementById('help-empty');
  var groups = [];
  TOPICS.forEach(function (t) { if (groups.indexOf(t.group) < 0) groups.push(t.group); });
  list.innerHTML = groups.map(function (g) {
    return '<section class="card help-group" data-group="' + VZ.esc(g) + '"><h2>' + VZ.esc(g) + '</h2>' +
      TOPICS.filter(function (t) { return t.group === g; }).map(function (t) {
        return '<details class="help-item" id="help-' + t.id + '"><summary>' + VZ.esc(t.q) + '</summary><div class="help-body">' +
          '<ol class="help-steps">' + t.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
          (t.note ? '<p class="help-note">' + t.note + '</p>' : '') +
          (t.go ? '<a class="btn btn-sm" href="' + t.go[0] + '">Go to ' + VZ.esc(t.go[1]) + '</a>' : '') +
          '</div></details>';
      }).join('') + '</section>';
  }).join('');
  document.getElementById('help-quick').innerHTML = TOPICS.filter(function (t) { return t.quick; }).map(function (t) {
    return '<button type="button" class="btn btn-ghost" data-open-help="' + t.id + '">' + VZ.esc(t.quick) + '</button>';
  }).join('');

  function open(id) {
    var d = document.getElementById('help-' + id);
    if (!d) return;
    q.value = ''; filter();
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    d.querySelector('summary').focus({ preventScroll: true });
  }
  document.getElementById('help-quick').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-open-help]');
    if (btn) open(btn.getAttribute('data-open-help'));
  });

  // Search: show only the questions that contain the typed words.
  function filter() {
    var words = q.value.toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
    list.querySelectorAll('.help-item').forEach(function (d) {
      var text = d.textContent.toLowerCase();
      var hit = words.every(function (w) { return text.indexOf(w) >= 0; });
      d.hidden = !hit;
      if (hit) shown++;
      if (words.length && hit) d.open = true;
      if (!words.length) d.open = false;
    });
    list.querySelectorAll('.help-group').forEach(function (g) { g.hidden = !g.querySelector('.help-item:not([hidden])'); });
    empty.hidden = shown > 0;
  }
  q.addEventListener('input', filter);

  // Open a topic from the address, for example help.html#sale
  if (location.hash) open(location.hash.slice(1));
})();
