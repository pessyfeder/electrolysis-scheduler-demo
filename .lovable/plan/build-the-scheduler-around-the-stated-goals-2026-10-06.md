# Build the scheduler around the stated goals

## Outcome
Update the current scheduler to meet only the document’s stated goals and respect its non-goals. It will be a focused, offline front-desk tool for one electrolysis practitioner, with Today as the main dashboard and all data kept on the device.

## What will change

### 1. Keep Today as the main dashboard
- Preserve Today as the first screen, with the day’s appointments, useful totals, and quick access to schedule a client.
- Add clear **Today / Week / Month** view switching in the scheduling workspace for fast booking, rescheduling, and cancellation.
- Keep past appointments viewable while preventing accidental bookings in the past.
- Show appointments and blocked time clearly, including shared slots with more than one client.

### 2. Enforce safe scheduling
- Use appointment duration, business hours, blocked periods, and existing bookings to prevent conflicts and double-booking.
- Allow back-to-back bookings or gaps of at least 15 minutes; reject unusable 1–14 minute gaps.
- Let the practitioner block a time range or full day with a reason.
- Allow more than one client to share a slot while keeping each client’s record separate.

### 3. Add simple clients and payments
- Keep a searchable client list with name and phone.
- Show each client’s appointments, payments, and running balance so debt and credit carry across visits.
- Record charges and payments per client, including separate billing for clients sharing one slot.

### 4. Keep the app offline and single-purpose
- Persist schedule, client, and payment data locally on the device.
- Keep the interface touch-friendly for a Windows tablet.
- Do not add cloud sync, online client booking, email/SMS, multiple practitioners or locations, insurance billing, clinical charting, or a native mobile app.

## Technical notes
- The existing React/TanStack project will remain the implementation base; this update follows product goals rather than reproducing every detailed screen or technical choice in the document.
- Local records will use browser/device storage and validated forms, with no cloud services or external network dependency.
- Scheduling and balance rules will live in testable domain modules rather than being embedded in screen components.

## Validation
- Add focused tests for business hours, overlaps, dead-gap rejection, balances, and local persistence.
- Verify booking, rescheduling, cancellation, shared-client slots, blocking, and payment tracking in the running app.
- Check desktop and tablet-sized layouts and confirm the experience does not rely on a network connection.