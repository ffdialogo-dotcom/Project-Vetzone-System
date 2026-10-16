# VetZone backend integration plan (NOT YET IMPLEMENTED)

The current prototype uses browser-side storage and client-side role checks. Do not deploy it for real patient, staff or business records without backend work.

V26 removes public signup. Provide account creation only through an authenticated admin endpoint with server-side role checks; do not expose public registration or trust browser guards. Existing legacy pending requests may still be approved/rejected by admins without accepting new public requests. Preserve existing users and IDs during migration.

V25 supplies the MFA and clinic-network login screens and a server-adapter interface; see [LOGIN_SECURITY_INTEGRATION.md](LOGIN_SECURITY_INTEGRATION.md). Admin access outside the trusted clinic network requires MFA; staff access outside it is denied. Admins inside may skip MFA under server policy. The server must determine role and trusted network, enforce limits, and recheck protected requests. The frontend previews and demo login do not enforce this policy.

## Architecture
- Serve existing HTML/CSS/JS as static files from Express.
- Use authenticated `/api/*` endpoints returning JSON; handle errors consistently.
- Store records in PostgreSQL, with schema migrations and foreign keys.
- Enforce admin/staff authorization on the server, never by hiding buttons alone.
- Use server-side sessions (secure HttpOnly SameSite cookies), password hashing, CSRF protection as appropriate, rate limiting, and admin MFA.
- Replace browser storage calls incrementally through a small API/data-service layer; preserve UI behavior.

## Suggested tables
`users`, `sessions`, `owners`, `pets`, `medical_records`, `vaccinations`, `products`, `inventory_batches`, `stock_movements`, `suppliers`, `stock_receipts`, `stock_receipt_items`, `sales`, `sale_items`, `approval_requests`, `audit_logs`.

## Transaction-sensitive workflows
1. Record sale: authenticate, authorize, validate stock by batch, lock relevant inventory rows, insert sale/items, deduct stock, append audit event, commit together. Retry-safe request identifiers prevent duplicate submissions.
2. Void sale: admin approves request, preserve original as voided, reverse net sales; reconcile physical stock rather than blindly restoring it.
3. Bulk stock receiving: staff creates pending request; admin approval adds batches and stock movement atomically.
4. Archive/restore: preserve historical links; verify batch expiry and sellable quantity on restore.
5. Medical entries: preserve approval history and author/reviewer identities.
6. Reports: compute totals server-side from approved/nonvoided records.

## Migration order
1. Inventory and product read APIs; 2. staff authentication/roles; 3. stock receiving and archive; 4. sales and void approval; 5. owners/pets/medical records; 6. reports, audit logs, backup monitoring. Run tests after each step.

## Production readiness
Require backups and restore drills, TLS, secret management, least-privilege DB account, monitoring, audit retention, access review, privacy compliance, and real multiuser/concurrency tests.


## V13 frontend contracts to preserve

V13 adds browser collections `workflowRequests`, `services`, `appointments`, `clinicStays`, `receivings`, and `stockLosses`. Keep their visible workflows when replacing localStorage with server APIs.

- Approved full reversals retain original sale lines and original product-batch allocations. Lock the sale/request and affected batches together; prevent duplicate decisions. Only explicit verified returns restore active, unexpired original batches. Never automatically return service units or unverifiable historical sales. Store refund method, amount, review date and reviewer separately. Net sales exclude reversed records; the refund column is informational by review date, without a second deduction.
- Validate an entire supplier receipt before writing any line, enforce unique normalized supplier/reference, and commit the receipt and all its batches atomically. Persist purchase unit costs and lot references. Preserve unknown legacy costs. Batch losses lock available quantities, require approval for staff, and retain cost snapshots.
- Pet edits keep internal IDs/history. Approvals compare the original pet/owner snapshot before applying; shared owner updates affect linked pets. Use server revision numbers for concurrency.
- Calendar bookings retain rescheduled originals. Completed attendance cannot precede the appointment time. Pending missed attendance prevents conflicting actions; approval/rejection updates its calendar entry. Profile checkup reschedules and calendar entries must remain synchronized. Enforce clinic timezone on the server.
- Physical stays remain separate from clinical treatment. Check-in/attendance creates no clinical examination. Staff release approval closes only the applicable stay, never a later admission. Deceased status closes active stays and cancels scheduled appointments.

All permissions and stale/duplicate checks must execute on the server, using authenticated roles and database transactions. Frontend checks are currently prototype behavior.


## V16 contracts

Clinic stays now have an explicit `confined` flag and confinement ID/time/actor/reason. Ordinary attendance and check-in remain visits. Release requests capture their stay/confinement IDs; enforce these under server locks so a stale request cannot close a later admission. Confinement never substitutes for clinical treatment status.

Pet photos currently use small JPEG data URLs in browser storage, with explicit failure/rollback when saving is unavailable. Production should use authenticated server uploads/object storage, validate and decode image bytes, resize on the server, restrict access by role and audit changes. Keep the preview/save/cancel/remove behavior and preserve the previous image when upload or persistence fails.
