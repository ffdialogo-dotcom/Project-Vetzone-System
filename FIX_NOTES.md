# Fixes to the staff/item ID and deceased approval update

This ZIP fixes the two issues confirmed in the supplied update:

- Pet profile controls are bound once, so rerendering after a deceased-status request, treatment-status change, or saved visit does not stack visit dialogs or repeat treatment-status changes. One visit submission creates one record.
- Death dates must be real calendar dates, cannot be in the future, and cannot precede the pet's recorded birth date. The same validation runs again before admin approval. The request form also sets its earliest selectable date to the pet's birth date.

Existing invalid pending death requests cannot be approved. An admin can reject one with an explanatory note, and staff can submit a corrected request. The fix does not rewrite previously saved records.

The existing staff/item IDs, approval/rejection workflow, medical history preservation, and deceased reminder suppression are retained. The project still opens through index.html and needs no application dependencies to install.

Run the five dependency-free checks from this folder:

```bash
node tests/check-project.js
node tests/check-archive.js
node tests/check-static-pages.js
node tests/check-feature-ids-deceased.js
node tests/check-death-date-validation.js
```

The browser regression check is also included:

```bash
node tests/check-pet-browser.js
```

That optional test requires Playwright and Chromium in the testing environment. It starts and stops its own local HTTP server and uses a fresh browser profile. It uses /usr/bin/chromium if available, or Playwright's installed Chromium otherwise. CHROMIUM_EXECUTABLE_PATH can select another Chromium executable. These tools are not needed to use the application.

All six checks passed on the corrected project, including the actual browser workflows. Existing-data migration was separately checked against the previous repository version. Full manual regression is not claimed; see VALIDATION_RESULTS.txt for the tested scope.
