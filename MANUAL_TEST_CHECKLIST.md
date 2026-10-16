# VetZone browser regression checklist

Use separate admin and staff demo accounts. Test in a fresh browser profile and with existing sample data.

- [ ] Login/logout and invalid login; session behavior
- [ ] V25 preview: MFA code input, Verify/Resend errors, Back; no code sent or access granted
- [ ] V25 preview: Clinic network required, repeated Try again and Back; no access granted
- [ ] Backend adapter tests: pending/duplicate/stale responses, code expiry/cooldown/rate limits, no local demo fallback
- [ ] Before backend release: real delivery/enrollment/recovery, secure session and every protected-page/API network/role rule
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


## V16 pet profile review

1. Pet profile > Clinic actions > Check in for a visit: verify Not confined / In clinic for a visit. Admit for confinement with a reason: verify Confined in clinic in profile, pet cards/list and clinic board. Clinical treatment status, visit counts and history stay unchanged.
2. Admin marks ready for pickup: pet remains confined while awaiting its owner. Staff requests release: stays confined until approved. Approve release: Not confined. Admin release applies directly. Reject a stale release submitted before a new confinement and request a fresh release.
3. Use Pet actions to edit/book/release/mark deceased. Expand Owner & visit details and View details on a history card; verify notes remain readable. Edit/delete controls stay separate from status badges.
4. Change picture: choose an image and inspect the preview; cancel leaves the old image. Save and reload; check both pet-list views. Remove with cancellation/confirmation. Unsupported, unreadable or over-5-MB images must not overwrite a saved photo. Storage failure must keep the old photo and report failure.
5. Check desktop and 375px profile/action/photo forms: grouped buttons, readable expandable details, correctly sized photos and no document horizontal overflow.


## V17 calendar due-date connection

1. Find a pet with an overdue vaccine or a saved next checkup. Open Clinic and navigate to that date's month; the day shows a due count. Select it and open the correct pet profile from its reminder row.
2. Record an actual new vaccination as staff: the old due date stays until approval. Approve as admin: the calendar uses the new dose's next due date, preserving previous dose history.
3. Submit and approve a missed-checkup reschedule; profile and calendar reminder agree. A linked booked checkup appears once as a booking. Cancelling it restores the clinical reminder; future attendance is still blocked. Deceased pets show no reminders.
4. Confirm reminders do not create booked appointments or completed visits. Check separate due/booked counts, far-future months, pagination and 375px layout.
