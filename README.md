# V26 — VetZone VetCare System: Working Prototype

A clickable, working prototype built from the Figma design, with the official VetZone logo. Plain HTML, CSS, and JavaScript. No install and no internet needed (the Poppins font falls back to a system font when offline).

## Admin-created accounts (V26)

Public registration is removed from the login page. New staff ask the clinic admin for an account. The admin signs in, opens **Staff accounts > Create account**, fills in the details and confirms. Admin-created accounts are active immediately; staff should change their temporary password in **Profile**.

Opening `create-account.html` while signed out returns to sign-in; staff return to their dashboard. The form is hidden until the admin check completes. The former public registration operation refuses new requests without changing saved data. Existing accounts and pending requests from earlier versions are retained; the admin can still approve or reject those older requests.

If the saved data changes while an admin's account form is open, creating an account asks for a page reload rather than overwriting the newer data. An account whose saved role/access changed cannot create accounts from a stale form.

V25's MFA and clinic-network screens, previews, integration hooks and all clinic features remain. The layout and colors are unchanged. V25 is preserved on its own branch with its original ZIP; V26 has a separate branch and ZIP.

## Login security screens (V25, based on the uploaded V24)

V25 adds an MFA code step with Verify, Resend (email/SMS), expiry/error messages and Back, plus a **Clinic network required** screen with **Try again** for staff. These use the existing login layout and colors; there are no extra dashboard controls.

Open `index.html` and expand **Preview login security screens** under the demo accounts. You can also open `index.html?preview=mfa` or `index.html?preview=clinic-network`. Preview actions never send a code or grant access. Normal demo sign-in still opens the browser-local prototype. All V24 clinic pages, Help topics, admin account creation and existing records logic are retained.

Real code delivery, code verification, staff network blocking and secure shared sessions still require the backend. The OTP delivery channel has not been selected. The integration hooks and server policy are documented in [LOGIN_SECURITY_INTEGRATION.md](LOGIN_SECURITY_INTEGRATION.md). Changing the login configuration alone cannot secure the current browser-storage app.

The original uploaded archive is preserved unchanged as `versions/V24_VetZone.zip` on its own V24 branch; V25 is a separate branch and archive.

## Clinic calendar connected to pet due dates (V17)

The Clinic calendar now automatically displays vaccination and checkup due dates from the latest approved pet records. Days show separate **due** and **booked** counts. Select a marked day to see the pet/owner, vaccine or checkup and Due reminder / Overdue reminder, then **Open pet record** to act on that patient.

A clinical due date is a reminder, not a confirmed booking. Viewing the calendar creates no appointments or medical records. Staff pending/rejected entries do not change due dates; after approval, a new actual vaccination replaces its earlier due date. Approved missed-checkup reschedules move the reminder using the same plan shown on the profile. A linked scheduled checkup is represented by its booking instead of a duplicate reminder; cancellation restores the clinical reminder, and completed attendance follows the existing checkup-plan behavior. Deceased pets have no due reminders.

Far-future due dates are visible when navigating to their month, even outside the dashboard's short reminder window. Existing booking, attendance, confinement and release controls are retained.

## Pet profile, confinement and photos (V16)

- **Confinement is separate from ordinary visits.** The pet profile shows a prominent Confined in clinic / Not confined badge. Use **Clinic actions > Admit for confinement** when the pet is staying for observation or treatment; enter a reason. Checking in for a visit or marking an appointment attended does not mark confinement. Existing older clinic stays remain ordinary visits until explicitly admitted for confinement. Treatment status and medical visit counts are separate.
- **Pet records** cards and list rows also show confinement, and the clinic board distinguishes Confined from Visit only. Admins can mark ready for pickup. Confined status stays active while awaiting pickup and during a pending staff release; approved release or deceased status closes the stay. A release submitted before a new confinement cannot close that admission by stale approval.
- **Less crowded controls.** Release and deceased actions are under **Pet actions**, along with editing and booking. **Clinic actions** handles check-in, confinement, pickup and release. Section buttons are grouped and spaced. The owner name stays visible; phone and visit totals are in **Owner & visit details**. Each history card uses **View details** for its long notes, and edit/delete buttons are separated from status badges. Attendance/release records do not show unsupported visit-edit buttons.
- **Pet photos.** Click **Change picture** beneath the image, choose a JPG/PNG/WebP up to 5 MB, preview and **Save picture**. The app creates a small centered square image for browser storage. The photo appears in the profile and both pet-list views. Admins and staff can change it directly; changes are audited. Remove current picture returns to the default animal icon after confirmation. Cancel and unreadable images leave the saved picture unchanged. If storage is full or unavailable, saving fails explicitly and retains the previous picture and audit history.

All workflows remain browser-local until the backend is built. No backend or production deployment was added.

## Fill missing loss costs (V15)

Admin: Inventory > Costs & losses > the unknown loss row > **Enter purchase cost**. Enter the actual purchase cost per unit from a supplier invoice/purchase record, explain its source, confirm that this is not the selling price, then Save purchase cost. The form previews quantity × unit cost. Three lost units at ₱30 each add ₱90 to recorded loss cost.

This fills the saved batch's missing unit cost and its unknown historical loss costs, including archived batches with no remaining units. It changes no stock quantities, selling prices, sale history, archive status or supplier receipts. Other batches and already-known loss costs remain unchanged. The remaining expired stock cost reflects any expired units still held in that same batch. Purchase totals continue to reflect recorded supplier receipts; entering an old batch cost does not manufacture a delivery receipt.

Only admins can fill missing costs. A source note and confirmation are required; costs must be nonnegative currency amounts with at most two decimal places. Duplicate/stale submissions are blocked. The audit trail records who entered the cost, when, the unit cost and its source. Unknown costs are never guessed from selling prices. Totals with unknown units explicitly say **known** and **Incomplete**.

## Missed vaccination attendance (V14)

Pet profile > Vaccination history > **Record missed vaccination** records a no-show against a due/overdue vaccine. Choose its vaccine/scheduled date, optional rescheduled appointment date and notes. Staff entries wait under Approvals > Medical history; admins record directly. Approved missed entries appear beneath vaccination history, separate from administered doses. The actual vaccine remains overdue until a new dose is recorded. A rescheduled date documents the attendance plan; it does not count as a administered vaccine or change its clinical due date.

Duplicate entries, future/noncurrent schedules, deceased pets and stale approvals after a newer dose are blocked. Rejecting an entry permits corrected resubmission. No dose dates, original schedules, medical visit counts or last-visit dates are altered by a missed entry. Add vaccination now explicitly explains that it is for a dose actually given. Pet-history tables stay inside their cards on mobile.

## New frontend workflows (V13)

The existing colors, typography and page layout are retained. New functions use tabs and focused dialogs; lists show eight rows per page.

- **Record sales > History:** view the original sale and request a full reversal. Staff requests require admin approval under **Approvals > Other requests**. Admins proceed directly to the review confirmation. Confirm the refund method and that the full refund was recorded. Return quantities default to zero; only physically returned, unopened, unexpired, correctly stored products can be explicitly restored to verified original batches. Services and older sales without batch tracing cannot restore stock. Reversed sales remain in history and are excluded from net sales; refunds are shown separately by decision date, without subtracting twice. This records a refund; it does not transfer money.
- **Record sales > Services:** bill clinic services alongside products with the existing cash/change and final confirmation flow. Service billing does not deduct inventory. Admins edit sample prices in **Service prices**. Top sellers continues to rank products.
- **Clinic > Appointments:** book, reschedule, cancel, and record attended or missed appointments. Rescheduling preserves the original entry. Future appointments cannot be marked attended/missed. Staff missed entries wait for medical-history approval. Attendance checks the pet into the clinic but does not invent an examination or increase medical visit counts. Linked checkup plans and calendar attendance stay synchronized; approved profile reschedules create a new appointment at the original time.
- **Clinic > In clinic / Released:** check pets in, show their physical location separately from treatment, mark ready for pickup (admin), and hand the pet home using the existing release workflow. Staff releases require approval; admins release directly. Deceased pets leave the active board and their future appointments are cancelled.
- **Pet profile > More actions:** edit pet and owner details (staff approval/admin direct), book an appointment, or check in. Internal IDs and medical history remain unchanged. Shared owner changes apply to their linked pets. A changed original record blocks stale approvals.
- **Inventory > Receiving:** receive multiple supplier lines with a delivery reference, lot, expiry, quantity and purchase cost. All lines validate before any stock is added; duplicate deliveries are blocked. Staff submissions wait for admin approval. **Costs & losses** (admin) shows recorded purchases, loss costs and remaining expired stock costs. Damaged, expired or missing stock can be recorded against a specific batch. Older batches without unit costs remain marked unknown.

These workflows still use this browser's localStorage. Server permissions, shared storage and transactions will be implemented with the backend.

## Expired stock archiving (V12)

In Inventory, open **Manage > Archive expired stock only**. Only expired batches move to Archived; fresh, expiring-today, and non-expiring stock remain available. Archived batches keep their quantity, expiry date and archive history. If no usable stock remains, the product also moves to Archived.

**Archive entire product** remains a separate explicit action for intentionally hiding the whole product. If an older version accidentally archived your entire product, restore it first, then use Archive expired stock only. Restoring a product never makes archived expired batches sellable.

The Archived view displays archived quantities and batch history. A mixed-stock product can appear in both Active (usable units) and Archived (expired units).

## Pet release and missed checkups (V11)

- Open **Pet records**, choose a pet, and click **Release pet home** (admin) or **Request pet release** (staff). Enter the release date, the person taking the pet home, and optional home-care notes. Admin entries are finalized immediately; staff entries wait for approval.
- Admins approve or reject staff release and attendance entries under **Approvals > Medical history**. Rejection requires a note.
- In **Visit history**, click **Record missed checkup** when the owner does not attend. If a checkup schedule exists, its date is used and an optional reschedule date is offered. Upcoming scheduled checkups cannot be marked missed. If no schedule was saved, enter the actual missed date and notes.
- Approved missed appointments appear as **Owner did not attend checkup**. They leave completed-visit counts and the last clinic-visit date unchanged. Approved rescheduling updates reminders; an unrescheduled missed appointment stays visible as missed/overdue.
- Releases appear in history and **Last release home** on the pet profile. Treatment status and earlier medical history are preserved.

## Updated workflows

This branch contains the complete updated application at the top level. Extract the GitHub branch ZIP and open this folder's `index.html`; no inner ZIP needs to be extracted.

- **Admin deceased status:** open a pet, click **Mark as deceased**, enter the date/location, and confirm. The status is recorded immediately, with no approval request.
- **Staff deceased status:** click **Request deceased status**. The pet keeps its existing status until an admin approves it under **Approvals > Deceased requests**. Rejection requires a note.
- **Sales:** select items and Cash or Online payment, then click **Review sale**. Review the final order and click **Confirm and record sale**. For cash, enter the amount received; customer change is calculated and included in the saved result. Back to order cancels confirmation without changing stock or recording a sale.
- **Account IDs:** admins use `ADM-0001`, staff use `STF-0001`. Existing internal account IDs and records are preserved; display prefixes reflect the current role.
- **Item codes:** inventory has an explicit **Item code** column (`ITM-0001`). Search inventory or sale items by name or code.
- **Sales overview:** hover, focus, or click a chart dot to see the date, number of sales, total, sale numbers, payment methods, and items/quantities for that day. Empty days say no sales were recorded.

Approved deceased status preserves medical history and suppresses routine reminders. The pet list includes a Deceased filter. Invalid death dates and duplicate visit dialogs remain fixed. See `FIX_NOTES.md` and `VALIDATION_RESULTS.txt` for the tested scope.

## How to open
1. Unzip the folder.
2. Double-click `index.html` (Chrome or Edge work best).

## Demo accounts
| Role  | Username | Password |
|-------|----------|----------|
| Admin | admin    | admin123 |
| Staff | staff1   | staff123 |

## Roles
**Admin** can: change the official inventory directly, review and approve or reject staff inventory changes and pet medical history entries, delete individual medical history entries, edit approved entries, see income, create accounts, approve or reject legacy account requests, and change roles between Staff and Admin.

**Staff** can: record sales, add pets, and **submit** inventory changes and medical history entries for admin approval. They see the status of everything they submitted. They cannot approve their own submissions, edit approved entries, delete entries, see income, or manage accounts.

| Area | Admin | Staff |
|------|-------|-------|
| Dashboard | Yes, with income and sales chart | Yes, without income |
| Inventory | Changes apply at once | Changes are submitted and wait for approval |
| Record sales, Pet records, Top sellers, Profile | Yes | Yes |
| Medical history entries | Final at once | Pending Admin Approval |
| Approvals page | Review queue and audit trail | "My submissions" (status only) |
| Income report, Staff accounts, role changes | Yes | No |

## Approval rules
- **Inventory.** Staff can submit: a new item, new item details (name, category, price, low-stock level), added stock, or a stock correction (a reason is required). A request **does not change official stock or details** until an admin approves it. Pending changes are shown apart from the official list, in "Proposed changes (Not applied yet)".
- **Review.** The admin sees who sent it, when, the item, the change (before and after), and the reason. Approve applies it once. Reject needs a note and changes nothing. A request cannot be processed twice, an identical pending request cannot be sent twice, and an approval is checked again against today's records (for example, a name that now clashes is not applied).
- **Medical history.** A staff entry (visit or vaccination) is marked Pending Admin Approval. Only **approved** entries appear as finalized history and count toward visit totals and reminders. Rejected entries stay out and show the admin's note. Staff can fix their own pending or rejected entry, which sends it back for approval.
- **Deleting.** Only an admin can delete a medical entry, one entry at a time, after a confirmation. The pet's profile and its other entries stay.
- **Roles and account creation.** Only admins can create accounts. Public signup is closed. Pending requests from earlier versions remain reviewable. Only an admin can change a role, must type their own password, cannot change their own role, and the last active admin cannot be demoted or turned off.
- **Audit trail.** Submissions, approvals, rejections, deletions, edits, account approvals, and role changes are recorded with who and when (Approvals page, "Audit trail").

## Notifications (the bell)
- **Pet reminders** from the approved records: upcoming checkups and vaccinations (within 30 days) and overdue ones, each with the pet's name, the owner's name, the scheduled date, and an Upcoming or Overdue tag. There is one notification per checkup, and it updates when the date changes.
- **Stock alerts** (low, out, expiring, expired), **approval updates** (admins see how many submissions wait, staff see how theirs were decided).
- **Unread**: the number on the bell counts what you have not seen. Opening the bell shows items marked New and then marks them as read. A notification becomes unread again when it changes, such as a new due date.

## Important: this prototype has no backend
Data lives in this browser (localStorage), and there is no server or database yet. Permissions are checked in the shared data layer in `js/app.js`: every change goes through a function that looks up the signed-in person again and checks the role, so a page cannot grant itself powers by passing in a fake user or by showing a button. **That is not real security**, because anyone with browser developer tools can edit the saved data. The planned Node.js + Express + PostgreSQL build must make the same checks on the server:
- Read the user and role from the session and database on every request, never from the page.
- Keep inventory and medical history writes behind server code that checks the role. Give staff no direct write access to `products`, `product_batches`, or approved `pet_records`.
- `inventory_requests` and `pet_records.status` (pending, approved, rejected) with the reviewer and time. Apply an approved request inside one database transaction, and block a second decision with a status check.
- An append-only `audit_log` table.
- Secure password hashes (Argon2id or bcrypt), parameterized SQL, secure sessions, and HTTPS.

## Other features
Sign in with an admin-created account; admin account creation through **Staff accounts**, with approval of legacy account requests retained; Profile (details, picture, password); Top sellers; Record sales (stock is deducted automatically); Inventory with batches, expiry dates, and alerts; Pet records with visit history; Income report (admin).

## Reset before a demo
Staff accounts page, "Reset demo data". Existing browser data migrates automatically. Reset only if you intentionally want to replace it with fresh demo data.

## Suggested 3-minute demo
1. Log in as staff (`staff1`). Open Inventory, choose **+ Stock** on Syringe 3mL, and send it. It shows under "Proposed changes" and the stock does not change.
2. Open Pet records, open Kuro, and look at "Your entries waiting for approval".
3. Log out and log in as admin. The bell shows overdue and upcoming checkups. Open **Approvals**, review the restock, and approve it. The stock rises.
4. Open Chica and delete one visit entry (with the confirmation). The profile and other entries stay.
5. Open **Audit trail** to see who did what.

## Files
`index.html` (sign in), one `.html` per page, `css/styles.css`, `img/` (logo and favicon), and `js/`. `js/app.js` holds the data, the permission rules, and the shared layout. Its data and permission logic will be moved into Express services and PostgreSQL transactions.

## Not built yet
A real backend and database, a forgot-password flow (the admin resets passwords), and offline syncing.

## Cleanup and production notes (October 2026)
- The existing green/pink prototype styling, official logo assets, and functional page structure are retained. The client-approved screenshot remains the reference for any later visual changes.
- Sales are **internal records**, not receipt-issuing POS transactions. Recorded revenue is not profit. Payment method entered by staff is not independent evidence of payment.
- The prototype still uses browser storage and demo passwords; do not use it with actual clinic records or deploy it as production authentication.
- V13 adds approved full-sale reversals with audited, explicit stock reconciliation. Production enforcement still needs backend transactions.
- V13 adds bulk supplier receiving, purchase costs and stock-loss reporting. Secure backup status, production audit logs and clinic-network restrictions remain future backend features.
- The `js/app.js` SVG icon set is embedded locally and needs no external icon CDN. Other Lucide-compatible icons can be added later to match the approved design.
- Run `node tests/check-project.js` to verify JavaScript syntax, local asset links, and basic business-logic checks. Browser interaction testing is still required.
