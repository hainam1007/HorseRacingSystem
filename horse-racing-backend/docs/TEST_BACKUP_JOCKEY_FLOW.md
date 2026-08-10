# Backup Jockey Flow Test

## Goal

Verify Option A: one optional backup jockey confirms standby terms without uploading a riding contract. The accepted primary contract must end by mutual agreement before promotion. The backup then becomes primary and must confirm a new primary contract.

## Prerequisite

Run this once on an existing database so backup assignments are not blocked by the old unique index:

```bash
npm.cmd run migrate:jockey-assignment-backup
```

The migration preserves the old active-assignment guards while creating versioned
primary/backup indexes, maps legacy `pending`/`rejected` statuses, and converts
legacy backup contract stages to the standby lifecycle.

## Automated E2E

Run:

```bash
npm.cmd run test:e2e:backup-jockey
```

Latest verified result:

```text
SUMMARY: 50/50 passed
CLEANUP_DONE: e2e-backup-jockey-1785154901203
```

The script creates data with an `e2e-backup-jockey-*` marker, stores created IDs in memory, and deletes the test records in `finally`. It does not clear unrelated demo or production data.

## Flow

### 1. Owner creates primary invitation

```text
POST /api/jockey-assignments
Authorization: Bearer <owner_token>
```

Input:

```json
{
  "race_id": "<race_id>",
  "horse_id": "<horse_id>",
  "jockey_id": "<primary_jockey_id>",
  "assignment_type": "primary",
  "invitation_message": "Please ride Bright Future in the Saigon Sprint.",
  "meeting": {
    "title": "Primary jockey contract appointment",
    "meeting_time": "2026-07-10T09:00:00.000Z",
    "location_name": "Saigon Racing Club Office",
    "address": "123 Nguyen Hue Street"
  }
}
```

Expected output:

```json
{
  "success": true,
  "data": {
    "assignment": {
      "assignment_type": "primary",
      "status": "meeting_invited"
    }
  }
}
```

### 2. Owner creates backup invitation

```text
POST /api/jockey-assignments
Authorization: Bearer <owner_token>
```

Input:

```json
{
  "race_id": "<race_id>",
  "horse_id": "<horse_id>",
  "jockey_id": "<backup_jockey_id>",
  "assignment_type": "backup",
  "backup_priority": 1,
  "invitation_message": "Please stand by as backup jockey for Bright Future.",
  "meeting": {
    "title": "Backup jockey standby appointment",
    "meeting_time": "2026-07-10T10:00:00.000Z",
    "location_name": "Saigon Racing Club Office",
    "address": "123 Nguyen Hue Street"
  }
}
```

Expected output:

```json
{
  "success": true,
  "data": {
    "assignment": {
      "assignment_type": "backup",
      "backup_priority": 1,
      "status": "meeting_invited"
    }
  }
}
```

### 3. Backup jockey accepts standby flow

Use the appointment and terms endpoints. A backup does not upload a riding contract:

```text
POST /api/jockey-assignments/:backupId/accept-appointment
PATCH /api/jockey-assignments/:backupId/terms
POST /api/jockey-assignments/:backupId/confirm-terms
```

Expected final status:

```json
{
  "assignment_type": "backup",
  "status": "standby_confirmed"
}
```

### 4. Primary contract ends by mutual agreement

Owner requests cancellation:

```text
POST /api/jockey-assignments/:primaryId/cancellation-request
Authorization: Bearer <owner_token>
```

```json
{
  "reason": "Primary jockey is unavailable before race day."
}
```

Primary jockey approves:

```text
POST /api/jockey-assignments/:primaryId/cancellation-request/respond
Authorization: Bearer <primary_jockey_token>
```

```json
{
  "decision": "approve",
  "response_message": "I agree to end the primary contract."
}
```

Expected primary status: `cancelled`.

### 5. Verify unilateral withdrawal before agreement activation

For a primary or backup negotiation that has not reached `accepted` or
`standby_confirmed`:

```text
POST /api/jockey-assignments/:id/withdraw
Authorization: Bearer <owner_or_jockey_token>
```

```json
{
  "reason": "The parties did not reach final terms."
}
```

Expected status: `cancelled`, with `withdrawal.reason` and actor audit fields.

### 6. Owner promotes backup

```text
POST /api/jockey-assignments/:backupId/promote
Authorization: Bearer <owner_token>
```

Input:

```json
{
  "reason": "Primary jockey is unavailable before race day."
}
```

Expected output:

```json
{
  "success": true,
  "message": "Backup jockey promoted successfully",
  "data": {
    "assignment": {
      "assignment_type": "primary",
      "status": "meeting_accepted",
      "standby_terms": {
        "agreed_terms": "<previous standby terms>"
      },
      "promotion": {
        "reason": "Primary jockey is unavailable before race day.",
        "previous_primary_assignment_id": "<old_primary_assignment_id>"
      }
    },
    "previous_primary_assignment_id": "<old_primary_assignment_id>"
  }
}
```

### 7. Confirm new primary terms

```text
PATCH /api/jockey-assignments/:backupId/terms
POST /api/jockey-assignments/:backupId/confirm-terms
```

Expected promoted assignment status: `terms_agreed`.

### 8. Owner uploads new primary contract

```text
POST /api/jockey-assignments/:backupId/contract
Authorization: Bearer <owner_token>
```

Expected output:

```json
{
  "assignment": {
    "assignment_type": "primary",
    "status": "contract_uploaded"
  }
}
```

### 9. Promoted jockey confirms primary contract

```text
POST /api/jockey-assignments/:backupId/confirm-contract
Authorization: Bearer <backup_jockey_token>
```

Expected output:

```json
{
  "assignment": {
    "assignment_type": "primary",
    "status": "accepted"
  }
}
```

## Negative Checks

```text
Creating backup without active primary returns 400.
Creating second active primary for the same horse and race returns 409.
Promoting a backup before it reaches standby_confirmed returns 400.
Uploading or confirming a riding contract for a backup returns 400.
Withdrawing after accepted or standby_confirmed returns 409; use mutual cancellation.
Legacy backup statuses that already represent accepted standby terms also return 409.
All appointment, terms, contract, withdrawal, cancellation, and promotion actions return 409 after the race starts or closes.
Race start uses a recoverable `starting` state before becoming `running`; stale start attempts can be retried without creating a second race run.
Promoting during running/completed race returns 400.
The same jockey cannot be active primary and active backup for the same horse and race.
Race engine participant list only uses assignment_type=primary.
```
