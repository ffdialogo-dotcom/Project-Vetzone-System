# VetZone feature update — prototype

- Staff display IDs (STF-0001 etc.) and inventory item display IDs (ITM-0001 etc.) are generated for existing and new records. Internal IDs remain unchanged.
- Pet profile includes a request for deceased status, pending admin review; date, location, and optional notes are saved.
- Admins review requests under Approvals > Deceased requests. Approved requests mark the pet deceased; rejected requests do not change status. Duplicate pending requests are blocked.
- Deceased pets no longer generate routine reminder alerts, and their history remains.
- This remains a localStorage prototype. Role checks are client-side, not secure until Express/PostgreSQL enforcement.
- Keep your previous ZIP as a backup and test the full workflows in a browser.
