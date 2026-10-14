# VetZone VetCare System: Working Prototype

A clickable, working prototype built from the Figma design, with the official VetZone logo. Plain HTML, CSS, and JavaScript. No install and no internet needed (the Poppins font falls back to a system font when offline).

## How to open
1. Unzip the folder.
2. Double-click `index.html` (Chrome or Edge work best).

## Demo accounts
| Role  | Username | Password |
|-------|----------|----------|
| Admin | admin    | admin123 |
| Staff | staff1   | staff123 |

## Roles
**Admin** can: change the official inventory directly, review and approve or reject staff inventory changes and pet medical history entries, delete individual medical history entries, edit approved entries, see income, create accounts, approve or reject account requests, and change roles between Staff and Admin.

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
- **Roles.** Only an admin can change a role, must type their own password, cannot change their own role, and the last active admin cannot be demoted or turned off. The sign-up page has no role choice: sign-ups are always Staff and wait for approval.
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
Sign in with a **Create account** button (and a **Log in** button on the Create account page); admin approval of account requests; Profile (details, picture, password); Top sellers; Record sales (stock is deducted automatically); Inventory with batches, expiry dates, and alerts; Pet records with visit history; Income report (admin).

## Reset before a demo
Staff accounts page, "Reset demo data". If you used an earlier version in the same browser, reset once so the new sample data (including waiting submissions) appears.

## Suggested 3-minute demo
1. Log in as staff (`staff1`). Open Inventory, choose **+ Stock** on Syringe 3mL, and send it. It shows under "Proposed changes" and the stock does not change.
2. Open Pet records, open Kuro, and look at "Your entries waiting for approval".
3. Log out and log in as admin. The bell shows overdue and upcoming checkups. Open **Approvals**, review the restock, and approve it. The stock rises.
4. Open Chica and delete one visit entry (with the confirmation). The profile and other entries stay.
5. Open **Audit trail** to see who did what.

## Files
`index.html` (sign in), one `.html` per page, `css/styles.css`, `img/` (logo and favicon), and `js/`. `js/app.js` holds the data, the permission rules, and the shared layout. Its data and permission logic will be moved into Express services and PostgreSQL transactions.

## Not built yet
A real backend and database, editing pet details, voiding a sale, a forgot-password flow (the admin resets passwords), and offline syncing.

## Cleanup and production notes (October 2026)
- The existing green/pink prototype styling, official logo assets, and functional page structure are retained. The client-approved screenshot remains the reference for any later visual changes.
- Sales are **internal records**, not receipt-issuing POS transactions. Recorded revenue is not profit. Payment method entered by staff is not independent evidence of payment.
- The prototype still uses browser storage and demo passwords; do not use it with actual clinic records or deploy it as production authentication.
- The current sale-recording flow has **no void/reversal workflow**, so do not attempt to correct completed sales by deleting browser records. Implement approved voids and audited stock reconciliation in the backend.
- Bulk supplier receiving in a single delivery form, secure admin-only backup status, production audit logs, and clinic-network restrictions are **future features**. Existing inventory stock-in works item by item.
- The `js/app.js` SVG icon set is embedded locally and needs no external icon CDN. Other Lucide-compatible icons can be added later to match the approved design.
- Run `node tests/check-project.js` to verify JavaScript syntax, local asset links, and basic business-logic checks. Browser interaction testing is still required.
