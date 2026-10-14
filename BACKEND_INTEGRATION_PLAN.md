# VetZone backend integration plan (NOT YET IMPLEMENTED)

The current prototype uses browser-side storage and client-side role checks. Do not deploy it for real patient, staff or business records without backend work.

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
