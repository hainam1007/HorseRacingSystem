# Race Entry Cancellation And Refund Test

## Business Flow

```text
Owner submits cancellation request
-> Admin approves or rejects before the registered race starts
-> Approval cancels the race entry and releases its place
-> Admin sends and records the refund
-> Owner confirms the funds were received
-> Refund is complete
```

Tournament only groups races. Each Race owns its own entry fee and prize pool.

## Automated Coverage

Run:

```bash
npm test
```

Focused run:

```bash
node --test tests/registrationCancellationTicket.test.js tests/horseOwnerRegistrationPayment.test.js tests/horseOwnerRaceAvailability.test.js
```

Covered cases:

1. Paid registration reads the fee from Race, not Tournament.
2. Owner creates one pending ticket with `refund_status=awaiting_approval` before the registered Race starts.
3. Ticket stores the paid registration fee as a refund snapshot.
4. Admin approval cancels the Registration.
5. Approval releases exactly one reserved Race place.
6. Approval increments `Race.model_input_version`.
7. Generated odds become stale after participant removal.
8. Paid Registration moves to `refund_pending`.
9. Owner confirmation moves `refund_sent` to `refunded`.
10. Ticket moves from `awaiting_owner_confirmation` to `completed`.

## Manual API Test

### 1. Owner Creates Request

```http
POST /api/horse-owner/registration-cancellation-tickets
Authorization: Bearer <owner_token>
Content-Type: application/json
```

```json
{
  "registration_id": "<approved_registration_id>",
  "reason": "Horse unavailable."
}
```

Expected: `201`, ticket `status=pending`.

### 2. Admin Approves

```http
POST /api/admin/registration-cancellation-tickets/<ticket_id>/approve
Authorization: Bearer <admin_token>
Content-Type: application/json
```

```json
{
  "admin_note": "Approved before race start."
}
```

Expected:

```text
ticket.status = approved
ticket.refund_status = pending
registration.status = cancelled
registration.payment_status = refund_pending
```

### 3. Admin Records Refund

```http
POST /api/admin/registration-cancellation-tickets/<ticket_id>/mark-refunded
Authorization: Bearer <admin_token>
Content-Type: application/json
```

```json
{
  "refund_reference": "VNPAY-REFUND-20260729-001",
  "admin_note": "Refund sent to the original payment account."
}
```

Expected:

```text
ticket.refund_status = awaiting_owner_confirmation
registration.payment_status = refund_sent
```

### 4. Owner Confirms Receipt

```http
POST /api/horse-owner/registration-cancellation-tickets/<ticket_id>/confirm-refund
Authorization: Bearer <owner_token>
Content-Type: application/json
```

```json
{
  "confirmation_note": "Funds received in full."
}
```

Expected:

```text
ticket.refund_status = completed
registration.payment_status = refunded
```

## Guard Cases

- Another Owner cannot view or confirm the ticket.
- A request after the registered Race starts returns `409`.
- A request remains eligible when the Tournament has started but the registered Race is still in the future.
- A duplicate pending request returns `409`.
- Admin approval after betting opens or after a bet exists returns `409`.
- A pending ticket cannot be marked refunded.
- A refund cannot be completed before Admin records it as sent.
- Rejected and cancelled registrations cannot create a new cancellation request.
