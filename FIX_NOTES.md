# Changes and validation

The current update implements the requested workflow changes:

- Admins mark a pet deceased directly after confirming the details. Staff requests still require admin approval.
- Cash and online sales both have a final review/confirmation step. Cash requires the amount received and calculates customer change. Insufficient or invalid cash is rejected. Stock is deducted only after final confirmation; cancellation leaves the order intact. Duplicate submissions of the same confirmation form create only one sale.
- Admin IDs use ADM, staff IDs use STF, and item codes use ITM. Existing staff/item codes and internal record IDs are retained during migration. Role changes update the display prefix. Persisted sequences prevent reuse of rejected account IDs.
- Inventory has a labeled Item code column, and inventory/sale-item search accepts the code.
- Sales overview chart dots show a visible detail panel with the day, sale count, total, individual sale numbers, payment methods, products and quantities. Hover, keyboard focus, click and Escape are supported.

The earlier fixes remain: pet controls bind once rather than stacking handlers; death dates must be real dates between the pet's birth and today; admin approval checks saved request dates again. Invalid old pending requests can still be rejected with an explanatory note so staff can resubmit.

Run the six dependency-free checks from this folder:

```bash
node tests/check-project.js
node tests/check-archive.js
node tests/check-static-pages.js
node tests/check-feature-ids-deceased.js
node tests/check-death-date-validation.js
node tests/check-workflows.js
```

Two optional Chromium checks exercise actual browser workflows:

```bash
node tests/check-pet-browser.js
node tests/check-workflows-browser.js
```

Browser checks require Playwright and Chromium in the testing environment. They start/stop their own local HTTP server and use fresh browser profiles. They use /usr/bin/chromium when available, or Playwright's installed Chromium otherwise. CHROMIUM_EXECUTABLE_PATH can select another Chromium executable. These tools are not needed to use the application.

All eight checks passed. Migration was also tested against data produced by the actual preceding release, preserving existing records. See VALIDATION_RESULTS.txt for exact scope. Full manual regression and production security are not claimed.
