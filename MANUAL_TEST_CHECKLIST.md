# VetZone browser regression checklist

Use separate admin and staff demo accounts. Test in a fresh browser profile and with existing sample data.

- [ ] Login/logout and invalid login; session behavior
- [ ] Sidebar navigation, header, notification badge, responsive layout
- [ ] Dashboard metrics, charts, recent activity, empty states
- [ ] Inventory search, filter, create/edit, stock quantity, expired batches
- [ ] Bulk stock receiving and staff approval flow
- [ ] Archive, archived tab, restore; blocked staff restore; duplicate restore
- [ ] Sales record, quantity validation, stock deduction, totals, history
- [ ] Void/cancel sale request, admin approval, reporting reconciliation
- [ ] Pet add/edit, owner info, pet detail, treatment status
- [ ] Vaccination/visit records, due reminders, approval and rejection
- [ ] Staff creation, pending registration approval, roles, account changes
- [ ] Profile edits, photo upload/remove, password update
- [ ] Income and top sellers, print/export if present
- [ ] Data persistence after reload; no cross-user leakage
- [ ] Browser console errors; keyboard use; mobile layout

Automated syntax checks are NOT substitutes for this manual browser checklist.


## V13 focused workflow review

1. Staff: bill a product and a service; review then confirm payment. Check only product stock decreases. Open History, view the sale, request reversal. Admin: Other requests, confirm a refund; leave returned quantities zero for used/damaged products. Verify original sale remains Reversed, net sales exclude it and stock does not increase. For an actual usable return with verified batches, explicitly enter the quantity and confirm usable.
2. Inventory > Receiving: add supplier/reference and multiple valid product lines, costs, lots and expiries. Invalid last line must leave all stock unchanged. Staff receipt waits for admin; approval applies once. Costs & losses shows purchase costs and specific batch-loss costs. Historical unknown costs stay unknown.
3. Pet > More actions: staff submits details, admin reviews; verify same ID, clinical status and history. Shared owner contact changes affect all their pets.
4. Clinic: book an appointment, reschedule and verify original history. Mark only past/due appointments attended or missed. Staff missed entries require approval; reject then retry. Verify the pet-profile checkup reminder and calendar agree after an approved linked reschedule.
5. In clinic: check in, admin marks ready for pickup; staff requests release, admin approves. Verify clinic board closes the stay while medical treatment status/history remains. Deceased pets close their stays and cancel scheduled appointments.
6. Verify new tabs/dialogs at desktop and 375px widths, table scrolling/pagination and reload persistence.
