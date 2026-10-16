# V25

Based on the user's uploaded final V24. Adds two sign-in states in the existing login layout: admin MFA verification and the staff clinic-network restriction with Try again. The original V24 archive and application are preserved on branch V24; this update is on branch V25.

- Six-digit code input supports paste, leading zeros, Enter and mobile numeric keyboards. Verify, delivery-channel resend, cooldown, expiry, rate-limit/error and Back states are ready for server responses. Authenticator codes do not show Resend.
- Staff network denial includes a clear explanation, Try again and Back. The server must recheck an opaque retry token; when no retry token is available, Try again returns to cleared credentials. Passwords are not retained for network retries.
- Pending actions disable duplicate submissions. Responses arriving after Back are ignored. Password/code fields and in-memory challenge state are cleared on exit. No code, challenge or retry token is written to browser storage or the URL.
- Separate, clearly labeled previews under the demo accounts allow both screens to be reviewed now. They send no codes and grant no access. The existing prototype demo login remains available.
- Future backend responses drive the new states through the documented adapter. Backend mode never falls back to local demo authentication; session/bootstrap completion belongs to the backend integration. Real MFA and network enforcement are not implemented in this frontend release.
- Existing V24 features and pink/green design are retained. No backend, SMS/email provider or production deployment is added.

# V24

V24 adds a Help page as the last item in the main menu.

- Simple step-by-step answers for everyday tasks, written in short sentences for users who are not used to computers. Tap a question to open its numbered steps; each answer has a "Go to" button that opens the right page.
- Quick buttons at the top (Record a sale, Add stock, Add a pet, and for the admin Approve changes) and a search box ("Search, like: sale or pet").
- Button names appear in pink, the same as on the screen, and box names in green, so users can match the words.
- Staff see 20 topics and their own button names (for example "Send for approval"). The admin sees 24 topics, including approvals, income, staff accounts, password resets, and service prices.
- Topics: opening pages (computer, phone, tablet), signing out, the bell, recording a sale, charging for a service, sales history, cancelling a sale, adding stock, supplier deliveries, adding an item, fixing stock or recording losses, what the colored labels mean, adding a pet, visit records, vaccines, appointments, clinic stays, a pet that passed away, changing your password, and (staff) what "Pending Admin Approval" means.
- A topic can be opened directly with an address like help.html#sale.

# V23

V23 fixes the phone and tablet layout problems reported from screenshots. PC and laptop screens keep normal tables.

- Menu bar: on pages with little content, the phone menu bar no longer stretches into a tall pink block (the extra height now goes to the page).
- Tabs: on phones, tab bars wrap into a grid so every tab is fully visible. Before, they scrolled sideways and looked cut ("Costs & losse", "Inventory cha...").
- Tables: any table that does not fit its space becomes cards, one per row, with each value labeled by its column name (for example "Submitted by: Ana Lopez"). No column is hidden and there is no sideways scrollbar. Tables that fit stay normal tables, so all tables on 1280 px laptops and larger are unchanged. Labels are added automatically from each table's header, including tables that appear after switching tabs, and tables are measured again after the font loads and when the screen size changes.
- Laptops and tablets: slightly tighter table cells and wrapping column headers, so the inventory table fits as a normal table at 1280 px.

# V22

V22 fixes pop-ups on phones and tablets. Nothing changes on PC or laptop screens.

- Phones: the notification panel and the user menu were opening partly off the left edge of the screen (on a 390 px phone, the notification panel started 234 px off-screen). They now open full width just under the bell, with 10 px margins, and scroll inside if the list is long.
- Every size: the notification panel and user menu are never taller than the space left on screen (this matters on phones held sideways).
- Dialogs: a dialog taller than the screen now opens at its title and scrolls, instead of opening scrolled down with its title and close button above the screen (seen on a 320 px phone with Review inventory change).
- Message toasts stay inside small screens.

# V21

V21 is a responsive pass on V20. Nothing changes on PC or laptop screens.

- Phones (800 px and below): the menu folds behind a Menu button next to the logo, so page content starts near the top (about 195 px down on a 390 px phone, instead of about 424 px). The button shows a dot when something is waiting, says Close when open, and Escape closes it. Menu links are 44 px tall for fingers.
- Tablets (801 to 1100 px): the sidebar becomes an 84 px icon rail with tooltips and the Approvals badge, giving pages the width they need. Tablet landscape (1180 px) and larger keep the full sidebar.
- Peso amounts on phones shrink to fit instead of splitting mid-number, and the Income page's three totals stack on phones.
- The 7D/14D/30D, Products/Services, and tab buttons are at least 40 px tall on phones.
- Income: the Daily/Weekly/Monthly tabs drop under the title on small phones.

# V20

V20 is a small design pass on V19.

- Inventory: the Active Items / Archived Items tabs have even space above (18 px) and below (16 px), with or without pending proposed changes, and in both views.
- Record sales: the Products / Services toggle no longer touches the search bar (14 px above, 16 px below).
- Record sales > History now has only the By date view. The All sales table was removed because it showed the same sales with less detail. View and the reversal flow are unchanged.

# V19

V19 is a design pass on V18. No data or workflow changed.

- Sales overview: a dot now shows only the date, the day's income, and the number of sales, in a small dark tooltip with no list and no scrolling. Hover, focus, Enter, or click shows it; Escape or clicking outside closes it. The sale breakdown moved to Record sales > History.
- Record sales > History opens "By date": pick a date (or use Previous, Next, Today) to see that day's total, number of sales, and items sold, then each sale as "S-0142 · ₱520.00 · Online payment" with what was bought (for example "2 × Deworming Tablet, 1 × Royal Canin Dog Food 1kg"), the time, who recorded it, its status, and View (which still opens the reversal flow). Reversed sales are listed but not counted. "All sales" keeps the previous full table.
- Record sales: every card's "Add to order" button sits on the same line, and the label no longer wraps. Cards show the full item code.
- Inventory: "Proposed changes" no longer touches the cards above it.

# V18

V18 is a design pass on V17. All V17 features and data are unchanged.

- Sales overview: hovering, tapping, or focusing a dot shows a compact dark tooltip with the date, the day's income in large text, and the number of sales and items, followed by the sale numbers, payment methods, and products. The dot is highlighted and a dashed guide line marks the day. Enter pins it, Escape or Close hides it.
- No page scrolls sideways at 1366, 1024, 768, 390, or 360 px. Screen-reader text inside tables no longer escapes the table's scroll box (this caused the 289 px overflow on mobile Approvals), and small-phone stat cards can shrink.
- Tabs stay on one line and scroll sideways on small screens instead of wrapping into a large rounded block.
- Inventory: the table fits its card on desktop (the Actions column was cut off), item codes use the app font, and there is space between Proposed changes and the item list.
- Record sales: more compact item cards (4 per row on a 1366 px screen instead of 3).
- Clinic calendar due counts are easier to read, and the sidebar color reaches the bottom of long pages.

# V17

V17 connects approved pet vaccination/checkup due dates to the Clinic calendar automatically. Due/overdue reminders are distinct from actual booked appointments, link back to the correct pet profile, and update with approved medical history and checkup reschedules.

Download versions/V17_VetZone.zip using GitHub Download raw file. V9–V16 files and branches remain available. The complete app is at the repository root.
