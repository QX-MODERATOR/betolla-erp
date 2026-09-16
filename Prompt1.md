# Betolla ERP — Production End-to-End Testing & Integration Prompt

## Objective

Perform a complete **production-level end-to-end test** of the Betolla ERP system.

The immediate scope is to make the system fully connected and operational for:

1. **Admin**
2. **Sales Employee — Hanan**
3. **Drivers**

The goal is not only to check whether buttons visually work. Test the complete flow:

**Admin → sends data → Hanan receives data → Hanan processes the lead → creates order → order moves through delivery → Driver receives order → Driver delivers/returns → system updates all related data correctly.**

Test both:

* Web application
* Mobile application / mobile-responsive interface

Do not consider a feature complete merely because the UI responds. Verify the actual backend/database state and the effect on the next user/department.

---

# 1. Production Safety Rules

Before testing:

* Use production carefully.
* Do not delete or permanently modify real business data unless explicitly intended for the test.
* Use clearly identifiable test records where possible, e.g. `TEST-PROD-...`.
* Never expose real customer information unnecessarily.
* Do not modify financial, inventory, or historical production records just to test a button.
* Do not run destructive migrations, resets, database wipes, or bulk updates.
* Do not build or run the entire project unnecessarily.
* Inspect existing implementation first and patch only what is required.
* Do not change unrelated departments/features while testing the current scope.

---

# 2. Test Accounts / Roles

Verify that the following roles can authenticate correctly:

### Admin

Admin must be able to:

* Sign in
* Access the Dashboard
* Access Sales
* Send new leads/data
* View assigned sales data
* Access Orders
* Access Driver Management
* View driver/order status
* Access relevant system information
* Log out

### Hanan — Sales Employee

Hanan must be able to:

* Sign in
* Access her sales dashboard
* Receive newly assigned leads
* Receive the `New Data` notification
* View only the data appropriate to her account
* Call customers
* Open WhatsApp
* Record call results
* Create orders from leads
* View and manage her assigned leads
* Access the required order functionality
* Use the application correctly on desktop and mobile

The Sales section specifically defines the lead assignment flow, notification behavior, calling, WhatsApp, order creation, and follow-up functionality.

### Drivers

Test at least the configured driver accounts, including:

* Khaled
* Ali

Verify that each driver receives only the orders assigned to that driver.

Drivers must be able to:

* Sign in
* Access Driver Portal
* See assigned orders
* Call customers
* Open WhatsApp
* Open Google Maps
* Reorder deliveries
* Mark an order Delivered
* Record cash/CliQ collection
* Mark an order Returned
* Postpone delivery
* Open Shift Reconciliation
* Enter cash denominations
* Close the shift
* Generate/copy/send the shift report

The Driver Portal and shift workflow are explicitly defined in the system documentation.

---

# 3. Authentication Testing

Test every authentication control.

### Sign In

Test:

* Valid credentials
* Invalid username
* Invalid password
* Empty username
* Empty password
* Incorrect role credentials
* Session persistence
* Session expiration
* Redirect after login
* Logout
* Attempt to access protected pages after logout

The login system is expected to authenticate the user, issue the authentication token, and redirect according to the user's role.

### Password Visibility

Test:

* Show password
* Hide password
* Login while password is hidden
* Login while password is visible

---

# 4. Admin Dashboard Testing

After Admin login:

Test every dashboard control.

### Header

Test:

* Global Search
* Language switch
* Date filter
* Notification Bell
* Quick Profile
* New Order button
* Logout
* Mobile Menu
* Sidebar links

For every button verify:

1. Button is visible when authorized.
2. Button is hidden/disabled when unauthorized.
3. Correct page/modal opens.
4. Correct data loads.
5. No console/runtime error occurs.
6. No incorrect API request occurs.
7. Loading state works.
8. Error state works.
9. Closing the modal works.
10. Refreshing the page preserves correct state.

The header contains global search, language switching, date filtering, notifications, profile, new-order, logout, mobile menu, and role-based sidebar navigation.

---

# 5. Admin → Hanan Lead Distribution Test

This is one of the most important production tests.

## Manual Lead Distribution

Admin:

1. Open Sales.
2. Open `Send Leads`.
3. Select Hanan.
4. Enter a controlled test lead.
5. Enter name.
6. Enter phone.
7. Select city.
8. Select source.
9. Send the data.

Verify:

* Validation works.
* Invalid phone numbers are rejected.
* Empty required fields are rejected.
* Clear button clears the form.
* Cancel/X closes without saving.
* Submit creates the lead.
* Lead is stored in the correct database record/table.
* Lead is assigned to Hanan.
* Hanan does not receive leads assigned to another employee.
* Duplicate behavior is correct.
* Admin receives correct success/error feedback.
* Hanan receives the `New Data` notification.

The documented Send Leads flow explicitly sends the data to Supabase and triggers the new-data notification for the selected salesperson.

---

# 6. Excel Lead Distribution Test

Test the Excel workflow separately.

Test:

* `.xlsx`
* `.xls`
* `.csv`

Verify:

1. File upload works.
2. Invalid file type is rejected.
3. Empty file is handled.
4. Large file is handled safely.
5. Columns are detected.
6. Name mapping works.
7. Phone mapping works.
8. City mapping works.
9. Notes mapping works.
10. Invalid rows are handled correctly.
11. Distribution percentages calculate correctly.
12. Total distribution equals 100%.
13. Leads are distributed to the correct employees.
14. Hanan receives exactly the leads assigned to her.
15. Notifications are generated correctly.
16. No duplicate records are unexpectedly created.

The documented Excel workflow supports file upload, column mapping, percentage distribution, and automatic lead assignment/notifications.

---

# 7. Hanan End-to-End Sales Test

After Admin sends the test lead:

Log in as Hanan.

Verify:

### Notification

* New Data notification appears.
* Notification count is correct.
* Notification opens the correct data.
* Notification does not appear for unrelated users.
* Notification state updates correctly after viewing/clearing.

### Lead

Hanan should be able to:

* See the lead.
* Search for it.
* View customer information.
* Call the customer.
* Open WhatsApp.
* Record call result.
* Schedule follow-up.
* Convert the lead into an order.

Test every call outcome:

* Answered / order confirmed
* No answer
* Phone closed
* Call later
* Not interested

Verify every outcome is saved correctly.

---

# 8. Hanan → Order Creation

Use the test lead and create an actual controlled test order.

Verify:

* Customer information transfers automatically.
* Phone number transfers correctly.
* Address transfers correctly.
* Products can be selected.
* Quantity works.
* Product price is correct.
* Total is calculated correctly.
* Payment method works.
* Notes are saved.
* Order is created once.
* Duplicate submission does not create duplicate orders.
* Order receives a valid ID.
* Order is linked to Hanan.
* Order appears in Admin's Orders page.
* Order status starts correctly.

Test the `Add Product` control and verify the catalog/product information and automatic total calculation.

---

# 9. Orders Lifecycle Test

Test the complete order state machine.

Expected flow:

**Draft → Confirmed → Processing → Shipped → Delivered**

Also test:

**Shipped → Returned**

For every transition:

* Correct authorized role can perform it.
* Unauthorized role cannot perform it.
* Status changes in UI.
* Status changes in backend/database.
* Other users see the updated status.
* Refresh does not revert the status.
* Duplicate clicks do not duplicate the action.
* Loading state prevents accidental double submission.
* Errors are handled without corrupting the order.

The documented order lifecycle includes Confirm, Process, Dispatch/Ship, Delivered, Returned, Waybill, WhatsApp, Details, and drag/reordering functionality.

---

# 10. Admin → Driver Assignment

Create/confirm a test order that is ready for delivery.

Test:

* Select order.
* Select one order.
* Select multiple orders.
* Select all.
* Clear selection.
* Assign to Khaled.
* Assign to Ali.
* Verify assignment.

After assignment:

* Correct driver sees the order.
* Other driver does not see the order.
* Admin sees assigned driver.
* Order status remains correct.
* Assignment persists after refresh.
* Assignment persists after logout/login.
* Database contains the correct driver relationship.

The driver management module defines bulk selection, driver assignment, external delivery assignment, field editing, Maps, payment method, and saving changes.

---

# 11. Driver Portal Test

Log in as the assigned driver.

Verify:

### Order visibility

Driver must see:

* Correct assigned orders
* Customer name
* Phone
* Address
* Order information
* Amount to collect
* Payment method

Driver must NOT see unrelated orders belonging to another driver.

### Actions

Test:

* Move order up
* Move order down
* Call customer
* WhatsApp customer
* Open Maps
* Deliver
* Return
* Postpone

Every action must update the correct order.

---

# 12. Delivery Test — Cash

Create a controlled cash order.

Driver:

1. Opens order.
2. Opens delivery action.
3. Enters actual cash collected.
4. Confirms delivery.

Verify:

* Order becomes Delivered.
* Actual collected amount is stored.
* Cash amount is correct.
* Delivery timestamp is recorded if supported.
* Driver is recorded.
* Order disappears from pending delivery list or moves to completed state.
* Admin sees the new state.
* No duplicate financial transaction is generated by repeated clicks.

---

# 13. Delivery Test — CliQ

Create a controlled CliQ order.

Verify:

* Payment method is CliQ.
* Driver can confirm the payment appropriately.
* Delivered state is recorded.
* Amount is recorded correctly.
* Admin sees the correct payment state.
* Cash is not incorrectly added to the driver's cash balance.

---

# 14. Returned Order Test

Use a controlled test order.

Driver:

1. Opens order.
2. Selects Return.
3. Selects a reason.

Test the available reasons:

* Customer unavailable
* Customer refused
* Damaged

Verify:

* Order becomes Returned.
* Return reason is stored.
* Driver is recorded.
* Admin sees the return.
* No false Delivered status is created.
* Inventory/financial side effects are triggered only if they are intentionally implemented and authorized.

---

# 15. Postponed Delivery Test

Driver postpones a delivery.

Verify:

* New delivery date is saved.
* Order remains assigned correctly.
* Order does not incorrectly become Delivered.
* Admin sees the new date.
* Driver sees the postponed order.
* Refresh preserves the date.

---

# 16. Driver Shift Reconciliation

At the end of the test delivery cycle:

Open Shift Reconciliation.

Test:

* Cash calculator
* 50 JD denomination
* 20 JD
* 10 JD
* 5 JD
* 1 JD
* Coins/fractions
* Automatic total
* Expected amount
* Difference calculation
* Shift closing
* Report generation
* Copy report
* WhatsApp report
* Thermal receipt/print action where available
* Unlock/correction flow

Verify that the calculated cash exactly corresponds to the delivered cash orders.

The documented shift system includes denomination calculation, shift locking, WhatsApp reporting, clipboard copy, printing, and administrative/unlock correction functionality.

---

# 17. Cross-User Synchronization Test

This is mandatory.

Use multiple sessions:

### Session A

Admin

### Session B

Hanan

### Session C

Driver

Perform the complete workflow:

**Admin sends lead → Hanan receives lead → Hanan creates order → Admin sees order → Admin assigns driver → Driver sees order → Driver delivers → Admin sees Delivered → Driver reconciles cash.**

At every stage:

* Verify database state.
* Verify UI state.
* Refresh each session.
* Logout/login where appropriate.
* Confirm data is synchronized.
* Confirm stale data does not overwrite newer data.

---

# 18. Permissions / Security Testing

Test every role against unauthorized actions.

Examples:

### Hanan

Must not be able to:

* Assign orders to drivers unless explicitly authorized.
* Access administrative-only lead distribution.
* Modify unrelated users.
* Access restricted financial functionality.
* Access restricted inventory functionality.

### Driver

Must not be able to:

* Access Admin dashboard.
* Assign orders to other drivers.
* Modify sales leads.
* Distribute leads.
* Modify unrelated orders.
* Access restricted financial administration.

### Admin

Must retain access to the required administrative functions.

Do not rely only on hiding buttons in the frontend. Verify authorization at the backend/API level.

---

# 19. Responsive Testing

Test the complete workflow on:

### Desktop

* 1920×1080
* 1366×768

### Tablet

* ~768px width

### Mobile

* 375px
* 390px
* 412px

Test:

* Header
* Sidebar
* Mobile drawer
* Dashboard
* Sales
* Leads
* Orders
* Order details
* Driver portal
* Shift reconciliation
* Modals
* Tables
* Cards
* Forms
* Dropdowns
* Buttons
* Notifications
* Horizontal scrolling
* Long customer names
* Long addresses
* Long phone numbers
* Arabic RTL
* English LTR

Verify:

* No overlapping elements.
* No clipped buttons.
* No inaccessible controls.
* No horizontal overflow unless intentionally required.
* Modals fit on screen.
* Keyboard does not become hidden behind mobile inputs.
* Touch targets are usable.
* Tables remain usable on small screens.
* No desktop-only functionality is accidentally unavailable on mobile.

---

# 20. Arabic / English Testing

Switch the application between Arabic and English.

Verify:

* All text changes.
* RTL layout works.
* LTR layout works.
* Icons remain correctly positioned.
* Tables remain usable.
* Modals remain aligned.
* Numbers remain readable.
* Phone numbers remain correctly formatted.
* Buttons do not overflow.
* No untranslated UI strings remain in the tested modules.

---

# 21. Error Handling

Intentionally test failures.

Test:

* Slow network
* Network disconnected
* API failure
* Database failure
* Invalid input
* Duplicate submission
* Session expiration
* Unauthorized API request
* Missing customer
* Invalid phone number
* Missing required field
* Invalid Excel file

The application must:

* Show a meaningful error.
* Stop the invalid operation.
* Avoid corrupting data.
* Avoid duplicate records.
* Recover after network restoration.
* Keep the UI state consistent with the backend.

---

# 22. Optimistic UI Verification

The system documentation states that sensitive operations use optimistic UI while synchronizing with backend APIs and Supabase.

Test this explicitly.

For actions such as:

* Lead assignment
* Order status changes
* Driver assignment
* Delivery
* Return
* Shift operations

Verify:

1. UI updates immediately where intended.
2. Backend operation actually succeeds.
3. Failed backend operation rolls the UI back correctly.
4. Refresh displays the true backend state.
5. Two users cannot silently overwrite each other's updates.

---

# 23. Button-by-Button Audit

Do not test only the main workflow.

Go through the documented button directory and test every button relevant to:

* Authentication
* Header
* Dashboard
* Orders
* Sales
* Lead Distribution
* Customers
* Driver Management
* Driver Portal
* Shift Reconciliation

For each button record:

| Button | Role | Visible | Clickable | Correct Action | Backend Updated | Refresh Safe | Mobile | Arabic | English | Result |
| ------ | ---- | ------- | --------- | -------------- | --------------- | ------------ | ------ | ------ | ------- | ------ |

Possible results:

* PASS
* FAIL
* PARTIAL
* BLOCKED
* NOT IMPLEMENTED

Do not mark PASS simply because the button can be clicked.

---

# 24. Production Acceptance Criteria

The current production integration is considered complete only when:

### Admin

* Login works.
* Dashboard works.
* Sales access works.
* Lead distribution works.
* Hanan receives assigned data.
* Orders can be monitored.
* Drivers can be assigned.
* Driver status can be monitored.

### Hanan

* Login works.
* New leads arrive correctly.
* Notifications work.
* Customer information is correct.
* Calling works.
* WhatsApp works.
* Call results save correctly.
* Follow-ups work.
* Leads convert into orders.
* Orders contain correct data.

### Drivers

* Login works.
* Assigned orders appear.
* Unassigned/other-driver orders are hidden.
* Calling works.
* WhatsApp works.
* Maps works.
* Delivery works.
* Return works.
* Postponement works.
* Cash/CliQ handling works.
* Shift reconciliation works.

### System

* Database synchronization works.
* Role permissions work.
* No critical console errors.
* No critical API errors.
* No duplicate records.
* No data loss.
* Refresh does not corrupt state.
* Mobile is usable.
* Desktop is usable.
* Arabic and English work.
* Production data remains safe.

---

# 25. Final Test Report

After testing, produce a report containing:

## PASS

All working functionality.

## FAIL

Every broken function with:

* Page
* Button
* Role
* Expected behavior
* Actual behavior
* Error message
* API request involved
* Database impact
* Severity

Severity:

* **P0 — Critical:** Production unusable, authentication/data loss/security failure.
* **P1 — High:** Core Admin/Sales/Driver workflow broken.
* **P2 — Medium:** Important feature broken but workaround exists.
* **P3 — Low:** UI/minor functionality issue.

## BLOCKED

Features that cannot be tested because another dependency is broken.

## NOT IMPLEMENTED

Features that are referenced by the UI/documentation but do not actually exist.

## FINAL STATUS

Return one of:

* **READY FOR PRODUCTION**
* **READY WITH KNOWN NON-BLOCKING ISSUES**
* **NOT READY FOR PRODUCTION**

Do not hide failures. Do not mark a feature as passed based only on visual behavior. A feature passes only when the complete user action, authorization, frontend state, backend operation, database state, and cross-user result are correct.
