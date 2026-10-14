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
