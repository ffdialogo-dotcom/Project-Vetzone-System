V11 adds pet release and missed-checkup records. Admins finalize directly; staff submit through Approvals > Medical history. Approved reschedules update checkup reminders. Releases and missed attendance preserve clinical visit counts, last clinic-visit dates, treatment status and existing history.

# VetZone workflow update — prototype

- Admin display IDs use ADM-0001; staff use STF-0001; inventory item codes use ITM-0001. Display sequences persist and deleted/rejected IDs are not reused. Internal record IDs are unchanged. Role changes assign the appropriate display prefix.
- Admins can confirm deceased status directly on a pet profile. Staff submit requests for admin approval under Approvals > Deceased requests. Date, location, notes, actor and review details are retained.
- Approved deceased pets retain medical history and stop generating routine reminders. Pending requests do not change status. Duplicate pending requests and invalid dates are blocked.
- A final sale review appears for cash and online payments. Stock and sales change only on final confirmation. Cash received and customer change are validated, displayed and saved. Cancellation preserves the order without recording it.
- Inventory codes have their own labeled column and work in search. Sale item cards display the code and are searchable by it.
- Sales overview dots show the day's sale count, item count, total, sale numbers, methods, products and quantities. Keyboard focus/click works as well as hover.
- The app remains the documented browser-storage prototype. Online payments are recorded rather than processed, and the sale record is not an official receipt.
