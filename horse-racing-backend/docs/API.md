# API Documentation

Base URL:

```text
http://localhost:3000/api
```

Common success response:

```json
{
  "success": true,
  "message": "Message",
  "data": {}
}
```

Common error response:

```json
{
  "success": false,
  "message": "Error message",
  "details": []
}
```

Protected APIs require:

```text
Authorization: Bearer <token>
```

## Auth APIs

### 1. Get Role Options

```text
GET /api/auth/roles
```

Input: none

Output:

```json
{
  "success": true,
  "message": "Role options retrieved successfully",
  "data": {
    "roles": [
      {
        "value": "admin",
        "label": "Admin",
        "description": "Manage users, roles, tournaments, race schedules, approvals, referees, results, and predictions.",
        "id": "role_object_id"
      },
      {
        "value": "horse_owner",
        "label": "Horse Owner",
        "description": "Register horses, manage horse information, choose jockeys, confirm race participation, and track prizes.",
        "id": "role_object_id"
      },
      {
        "value": "jockey",
        "label": "Jockey",
        "description": "Receive race invitations, confirm assignments, view race schedule, results, rankings, and personal records.",
        "id": "role_object_id"
      },
      {
        "value": "race_referee",
        "label": "Race Referee",
        "description": "Inspect horses, monitor races, record violations, confirm race results, and create referee reports.",
        "id": "role_object_id"
      },
      {
        "value": "spectator",
        "label": "Spectator",
        "description": "View tournaments, race schedules, live results, rankings, predictions, and prediction rewards.",
        "id": "role_object_id"
      }
    ]
  }
}
```

### 2. Register

```text
POST /api/auth/register
```

Input:

```json
{
  "full_name": "Nguyen Van A",
  "email": "user@example.com",
  "password": "Password123",
  "phone_number": "0900000000",
  "date_of_birth": "2000-01-01",
  "avatar_file_data": "data:image/png;base64,..."
}
```

Required fields:

```text
full_name
email
password
```

Registration role behavior:

```text
New public registrations are assigned the spectator role by default.
To become horse_owner, jockey, or race_referee, submit a role application and wait for admin approval.
```

Notes:

```text
password must be at least 8 characters.
roles input is ignored for public registration.
profiles input is ignored for public registration.
registered accounts are pending_verification by default.
```

Output:

```json
{
  "success": true,
  "message": "Registered successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "phone_number": "0900000000",
      "date_of_birth": "2000-01-01T00:00:00.000Z",
      "avatar_url": "https://res.cloudinary.com/<cloud>/image/upload/avatar.png",
      "avatar_public_id": "horse-racing/avatars/public_id",
      "status": "pending_verification",
      "email_verified": false,
      "created_at": "2026-05-26T00:00:00.000Z",
      "updated_at": "2026-05-26T00:00:00.000Z"
    },
    "roles": ["spectator"],
    "profiles": {},
    "verification": {
      "expires_at": "2026-05-27T00:00:00.000Z",
      "otp": "123456"
    }
  }
}
```

### 3. Register Horse Owner

```text
POST /api/auth/register/horse-owner
```

Input:

```json
{
  "full_name": "Nguyen Van A",
  "email": "owner@example.com",
  "password": "Password123",
  "phone_number": "0900000000",
  "date_of_birth": "2000-01-01",
  "avatar_file_data": "data:image/png;base64,..."
}
```

Notes:

```text
This legacy endpoint now creates a spectator account only.
To become a horse owner, call POST /api/role-applications/horse-owner after verifying the account.
registered accounts are pending_verification by default.
password must be at least 8 characters.
```

Output:

```json
{
  "success": true,
  "message": "Horse owner registered successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "owner@example.com",
      "phone_number": "0900000000",
      "date_of_birth": "2000-01-01T00:00:00.000Z",
      "avatar_url": "https://res.cloudinary.com/<cloud>/image/upload/avatar.png",
      "avatar_public_id": "horse-racing/avatars/public_id",
      "status": "pending_verification",
      "email_verified": false
    },
    "roles": ["spectator"],
    "profiles": {},
    "verification": {
      "expires_at": "2026-05-29T00:00:00.000Z",
      "otp": "123456"
    }
  }
}
```

### 4. Verify Account

```text
POST /api/auth/verify-account
```

Input:

```json
{
  "otp": "123456"
}
```

Output:

```json
{
  "success": true,
  "message": "Account verified successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "status": "active",
      "email_verified": true,
      "email_verified_at": "2026-05-26T00:00:00.000Z"
    },
    "roles": ["horse_owner", "spectator"]
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Verification OTP is invalid or expired"
}
```

### 5. Resend Verification

```text
POST /api/auth/resend-verification
```

Input:

```json
{
  "email": "user@example.com"
}
```

Output:

```json
{
  "success": true,
  "message": "Verification instructions sent if the email exists",
  "data": {
    "sent": true,
    "verification": {
      "expires_at": "2026-05-27T00:00:00.000Z",
      "otp": "123456"
    }
  }
}
```

If the account is already verified:

```json
{
  "success": true,
  "message": "Verification instructions sent if the email exists",
  "data": {
    "sent": false,
    "already_verified": true
  }
}
```

### 6. Login

```text
POST /api/auth/login
```

Input:

```json
{
  "email": "user@example.com",
  "password": "Password123"
}
```

Output:

```json
{
  "success": true,
  "message": "Logged in successfully",
  "data": {
    "token": "jwt_token",
    "token_type": "Bearer",
    "expires_in": "7d",
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "status": "active",
      "email_verified": true
    },
    "roles": ["horse_owner", "spectator"],
    "profiles": {}
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

```json
{
  "success": false,
  "message": "User account is not verified"
}
```

### 7. Get Current User

```text
GET /api/auth/me
```

Headers:

```text
Authorization: Bearer <token>
```

Input: none

Output:

```json
{
  "success": true,
  "message": "Current user retrieved successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "phone_number": "0900000000",
      "date_of_birth": "2000-01-01T00:00:00.000Z",
      "avatar_url": "https://example.com/avatar.png",
      "status": "active",
      "email_verified": true,
      "email_verified_at": "2026-05-26T00:00:00.000Z",
      "created_at": "2026-05-26T00:00:00.000Z",
      "updated_at": "2026-05-26T00:00:00.000Z"
    },
    "roles": ["horse_owner", "spectator"],
    "profiles": {
      "horse_owner": {
        "_id": "horse_owner_profile_id",
        "user_id": "user_object_id",
        "stable_name": "A Stable",
        "address": "Ho Chi Minh City",
        "license_number": "OWN-001",
        "status": "active"
      }
    }
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Authentication token is required"
}
```

```json
{
  "success": false,
  "message": "Invalid or expired authentication token"
}
```

### 8. Forgot Password

```text
POST /api/auth/forgot-password
```

Input:

```json
{
  "email": "user@example.com"
}
```

Output:

```json
{
  "success": true,
  "message": "Password reset OTP sent if the email exists",
  "data": {
    "sent": true,
    "reset": {
      "expires_at": "2026-05-26T00:15:00.000Z",
      "otp": "123456"
    }
  }
}
```

Security note:

```text
The API returns a generic success response even when the email does not exist.
This avoids leaking registered emails.
```

### 9. Reset Password

```text
POST /api/auth/reset-password
```

Input:

```json
{
  "otp": "123456",
  "new_password": "Password456"
}
```

Output:

```json
{
  "success": true,
  "message": "Password reset successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "password_changed_at": "2026-05-26T00:00:00.000Z"
    }
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Password reset OTP is invalid or expired"
}
```

### 10. Change Password

```text
POST /api/auth/change-password
```

Headers:

```text
Authorization: Bearer <token>
```

Input:

```json
{
  "current_password": "Password456",
  "new_password": "Password789"
}
```

Output:

```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "password_changed_at": "2026-05-26T00:00:00.000Z"
    }
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Authentication token is required"
}
```

```json
{
  "success": false,
  "message": "Current password is incorrect"
}
```

### 11. Logout

```text
POST /api/auth/logout
```

Headers:

```text
Authorization: Bearer <token>
```

Input: none

Output:

```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": {
    "logged_out": true
  }
}
```

Note:

```text
Logout is stateless for now.
The client should remove the JWT token after logout.
```

## Role Application APIs

New public accounts are spectators by default. Users must apply for professional roles and wait for admin approval before they receive `horse_owner`, `jockey`, or `race_referee`.

Role application statuses:

```text
pending
approved
rejected
```

### 1. Apply For Horse Owner

```text
POST /api/role-applications/horse-owner
```

Headers:

```text
Authorization: Bearer <spectator_token>
```

Input:

```json
{
  "stable_name": "A Stable",
  "address": "Ho Chi Minh City",
  "license_number": "OWN-001",
  "ownership_type": "individual",
  "tax_id": "optional_tax_id",
  "identity_document_file_data": "data:application/pdf;base64,...",
  "owner_license_document_file_data": "data:application/pdf;base64,...",
  "horse_ownership_proof_file_data": "data:application/pdf;base64,...",
  "documents": [
    {
      "type": "owner_license",
      "file_data": "data:application/pdf;base64,...",
      "note": "Racing owner license"
    }
  ]
}
```

Required fields:

```text
stable_name
address
license_number
ownership_type
```

Output:

```json
{
  "success": true,
  "message": "Role application submitted successfully",
  "data": {
    "application": {
      "_id": "application_id",
      "user_id": "user_id",
      "requested_role": "horse_owner",
      "status": "pending",
      "application_data": {
        "stable_name": "A Stable",
        "address": "Ho Chi Minh City",
        "license_number": "OWN-001",
        "ownership_type": "individual"
      }
    }
  }
}
```

### 2. Apply For Jockey

```text
POST /api/role-applications/jockey
```

Headers:

```text
Authorization: Bearer <spectator_token>
```

Input:

```json
{
  "license_number": "JOC-001",
  "height": 170,
  "weight_kg": 58,
  "experience_years": 3,
  "medical_clearance_file_data": "data:application/pdf;base64,...",
  "racing_license_document_file_data": "data:application/pdf;base64,...",
  "riding_certificate_file_data": "data:application/pdf;base64,...",
  "identity_document_file_data": "data:application/pdf;base64,...",
  "documents": [
    {
      "type": "medical_clearance",
      "file_data": "data:application/pdf;base64,...",
      "note": "Medical clearance for race riding"
    }
  ]
}
```

Required fields:

```text
license_number
height
weight_kg
experience_years
medical_clearance_url or medical_clearance_file_data
racing_license_document_url or racing_license_document_file_data
```

Output:

```json
{
  "success": true,
  "message": "Role application submitted successfully",
  "data": {
    "application": {
      "_id": "application_id",
      "user_id": "user_id",
      "requested_role": "jockey",
      "status": "pending",
      "application_data": {
        "license_number": "JOC-001",
        "height": 170,
        "weight_kg": 58,
        "experience_years": 3
      }
    }
  }
}
```

### 3. Apply For Race Referee

```text
POST /api/role-applications/race-referee
```

Headers:

```text
Authorization: Bearer <spectator_token>
```

Input:

```json
{
  "license_number": "REF-001",
  "experience_years": 5,
  "accreditation_body": "Racing Officials Accreditation Program",
  "rules_training_certificate_file_data": "data:application/pdf;base64,...",
  "background_check_file_data": "data:application/pdf;base64,...",
  "identity_document_file_data": "data:application/pdf;base64,...",
  "previous_official_role": "paddock judge",
  "documents": [
    {
      "type": "accreditation",
      "file_data": "data:application/pdf;base64,...",
      "note": "Racing official accreditation"
    }
  ]
}
```

Required fields:

```text
license_number
experience_years
accreditation_body
rules_training_certificate_url or rules_training_certificate_file_data
background_check_url or background_check_file_data
```

Output:

```json
{
  "success": true,
  "message": "Role application submitted successfully",
  "data": {
    "application": {
      "_id": "application_id",
      "user_id": "user_id",
      "requested_role": "race_referee",
      "status": "pending",
      "application_data": {
        "license_number": "REF-001",
        "experience_years": 5,
        "accreditation_body": "Racing Officials Accreditation Program"
      }
    }
  }
}
```

### 4. View My Role Applications

```text
GET /api/role-applications/me?requested_role=jockey&status=pending
```

Headers:

```text
Authorization: Bearer <token>
```

Output:

```json
{
  "success": true,
  "message": "My role applications retrieved successfully",
  "data": {
    "applications": []
  }
}
```

### 5. Admin View Role Applications

```text
GET /api/admin/role-applications?requested_role=jockey&status=pending
GET /api/admin/role-applications/:id
```

Headers:

```text
Authorization: Bearer <admin_token>
```

Output:

```json
{
  "success": true,
  "message": "Role applications retrieved successfully",
  "data": {
    "applications": []
  }
}
```

### 6. Admin Approve Role Application

```text
POST /api/admin/role-applications/:id/approve
```

Headers:

```text
Authorization: Bearer <admin_token>
```

Input:

```json
{
  "admin_note": "Documents verified"
}
```

Behavior:

```text
Approving an application assigns the requested role to the user.
For horse_owner, jockey, and race_referee, the matching profile is created or updated with status active.
Only pending applications can be approved.
```

Output:

```json
{
  "success": true,
  "message": "Role application approved successfully",
  "data": {
    "application": {
      "_id": "application_id",
      "requested_role": "jockey",
      "status": "approved",
      "admin_note": "Documents verified",
      "reviewed_by": "admin_user_id",
      "reviewed_at": "date"
    },
    "profile": {
      "_id": "jockey_profile_id",
      "user_id": "user_id",
      "status": "active"
    }
  }
}
```

### 7. Admin Reject Role Application

```text
POST /api/admin/role-applications/:id/reject
```

Headers:

```text
Authorization: Bearer <admin_token>
```

Input:

```json
{
  "admin_note": "Missing medical clearance"
}
```

Output:

```json
{
  "success": true,
  "message": "Role application rejected successfully",
  "data": {
    "application": {
      "_id": "application_id",
      "requested_role": "jockey",
      "status": "rejected",
      "admin_note": "Missing medical clearance",
      "reviewed_by": "admin_user_id",
      "reviewed_at": "date"
    }
  }
}
```

## Horse Owner APIs

Protected APIs require a verified JWT with the `horse_owner` role.

### 1. View Horse Owner Profile

```text
GET /api/horse-owner/profile
```

### 2. Update Horse Owner Profile

```text
PATCH /api/horse-owner/profile
```

Input:

```json
{
  "stable_name": "A Stable",
  "address": "Ho Chi Minh City",
  "license_number": "OWN-001",
  "status": "active"
}
```

### 3. View Horse List

```text
GET /api/horse-owner/horses
```

### 4. Create Horse Profile

```text
POST /api/horse-owner/horses
```

Input:

```json
{
  "name": "Lightning",
  "breed": "Thoroughbred",
  "gender": "male",
  "date_of_birth": "2020-01-01",
  "color": "Brown",
  "weight": 480,
  "health_status": "healthy",
  "registration_number": "HORSE-001",
  "default_gears": ["B", "TT"],
  "image_file_data": "data:image/png;base64,..."
}
```

Required fields:

```text
name
registration_number
```

### 5. View Horse Detail

```text
GET /api/horse-owner/horses/:horseId
```

### 6. Update Horse Info

```text
PATCH /api/horse-owner/horses/:horseId
```

Input:

```json
{
  "name": "Lightning",
  "breed": "Thoroughbred",
  "gender": "male",
  "date_of_birth": "2020-01-01",
  "color": "Brown",
  "weight": 485,
  "health_status": "healthy",
  "registration_number": "HORSE-001",
  "default_gears": ["B", "TT"],
  "image_file_data": "data:image/png;base64,...",
  "status": "active"
}
```

### 7. Delete/Deactivate Horse

```text
DELETE /api/horse-owner/horses/:horseId
```

Note:

```text
This is a soft delete. The horse status is changed to inactive.
```

### 8. Update Horse Image

```text
PATCH /api/horse-owner/horses/:horseId/media
```

Input:

```json
{
  "image_file_data": "data:image/png;base64,..."
}
```

### 9. View Horse Approval Status

```text
GET /api/horse-owner/horses/:horseId/approval-status
```

Output data includes:

```text
horse
ready_to_race
registrations
checks
```

### 10. View Available Jockey List

```text
GET /api/horse-owner/jockeys
GET /api/horse-owner/jockeys?race_id=race_object_id
```

When `race_id` is provided, every Jockey record also includes:

```json
{
  "available_for_race": false,
  "availability_reason": "Already confirmed for another horse in this race"
}
```

Omit `race_id` to retrieve the general active Jockey directory.

### 11. View Jockey Detail

```text
GET /api/horse-owner/jockeys/:jockeyId
```

### 12. View Tournament List

```text
GET /api/horse-owner/tournaments
```

### 13. View Race List By Tournament Id

```text
GET /api/horse-owner/tournaments/:tournamentId/races
```

Each race includes registration capacity fields:

```json
{
  "participant_count": 5,
  "remaining_slots": 1,
  "registration_available": true,
  "registration_unavailable_reason": null,
  "entry_fee_vnd": 50000,
  "entry_fee_currency": "VND"
}
```

`registration_unavailable_reason` can be `race_not_scheduled`, `registration_locked`,
`registration_window_closed`, or `race_full`. The frontend should hide races where
`registration_available` is `false`. The backend repeats the same checks when an
entry is submitted.

### 14. View Round List By Race Id

```text
GET /api/horse-owner/races/:raceId/rounds
```

Note:

```text
Each race belongs to one round in the current schema, so rounds returns an array with that race round.
```

### 15. Register Horse For Race

```text
POST /api/horse-owner/race-registrations
```

Input:

```json
{
  "horse_id": "horse_object_id",
  "race_id": "race_object_id",
  "note": "Register this horse for the race",
  "gears": ["B", "TT"],
  "payment_method": "VNPAY"
}
```

Notes:

```text
The race registration API infers tournament_id from the selected race.
Only active horses owned by the current horse owner can be registered.
Duplicate registration for the same race and horse returns 409.
Only scheduled, unlocked races with remaining capacity can be registered.
Paid entry fees use real VND through VNPay. Spectator tokens are never read or deducted.
The API creates a pending registration reservation for 15 minutes and returns a VNPay URL.
The reservation immediately consumes one race place, so concurrent payments cannot overbook the race.
Failed, cancelled, or expired payments release that place exactly once.
VNPay calls the existing signed callback at GET /api/deposit/webhook/payment.
A successful signed callback changes the registration to status=approved and payment_status=paid.
If a successful payment arrives after its reservation expired, payment_status becomes
refund_pending for manual refund handling; the expired place is not reclaimed automatically.
No manual admin approval is required.
gears is optional and defaults to Horse.default_gears. It describes race-day horse equipment,
not jockey clothing. The owner may change it until entries are finalized.
The confirmation email is queued only after payment succeeds. Email delivery failure
does not roll back or fail the successful registration API response.
```

Update owner-declared race gear before entry finalization:

```text
PATCH /api/horse-owner/race-registrations/:registrationId/entry-details
Authorization: Bearer <horse_owner_token>
```

```json
{
  "gears": ["B", "TT"]
}
```

Output:

```json
{
  "success": true,
  "message": "VNPay registration payment created successfully",
  "data": {
    "registration": {
      "_id": "registration_object_id",
      "tournament_id": "tournament_object_id",
      "race_id": "race_object_id",
      "horse_id": "horse_object_id",
      "owner_id": "owner_object_id",
      "status": "pending",
      "entry_fee_vnd": 50000,
      "entry_fee_token": 0,
      "payment_method": "VNPAY",
      "payment_order_id": "REG-1784250000000-A1B2C3D4",
      "payment_status": "pending",
      "payment_expires_at": "2026-07-17T06:15:00.000Z"
    },
    "order": {
      "order_id": "REG-1784250000000-A1B2C3D4",
      "status": "pending",
      "total_vnd": 50000,
      "payment_method": "VNPAY"
    },
    "order_id": "REG-1784250000000-A1B2C3D4",
    "payment_url": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?..."
  }
}
```

After VNPay redirects to the frontend, the authenticated owner can read the settled state:

```text
GET /api/horse-owner/registration-payments/:orderId
```

Output:

```json
{
  "success": true,
  "message": "Race registration payment retrieved successfully",
  "data": {
    "order": {
      "order_id": "REG-1784250000000-A1B2C3D4",
      "status": "success",
      "total_vnd": 50000,
      "payment_method": "VNPAY",
      "gateway_reference_id": "14985263"
    },
    "registration": {
      "status": "approved",
      "payment_status": "paid",
      "entry_fee_vnd": 50000,
      "entry_fee_token": 0
    }
  }
}
```

The email contains the race, tournament, horse, venue, race date/time, entry fee,
next-step jockey reminder, and a recommended demo pre-race inspection window:

```text
recommended arrival = race_date - 2 hours
recommended inspection completion = race_date - 45 minutes
```

These pre-race times are informational for the current demo. They are not yet
enforced by API validation. A horse that fails or misses pre-race inspection is
excluded from the race and the entry fee is not refunded.

### 16. Request Race Entry Cancellation

```text
POST /api/horse-owner/registration-cancellation-tickets
```

Input:

```json
{
  "registration_id": "registration_object_id",
  "reason": "The horse requires an extended veterinary recovery period."
}
```

Notes:

```text
Only the owner of an approved race registration can submit the request.
The reason is required and must not exceed 1000 characters.
The request must be submitted and approved before the registered race starts.
Submitting the request does not cancel the entry or release its race place.
Only one pending request is allowed for each registration.
A paid request starts with `refund_status=awaiting_approval`.
```

List and view owner requests:

```text
GET /api/horse-owner/registration-cancellation-tickets?status=pending&refund_status=pending
GET /api/horse-owner/registration-cancellation-tickets/:id
```

### 17. Admin Review And Refund

```text
GET  /api/admin/registration-cancellation-tickets
GET  /api/admin/registration-cancellation-tickets/:id
POST /api/admin/registration-cancellation-tickets/:id/approve
POST /api/admin/registration-cancellation-tickets/:id/reject
POST /api/admin/registration-cancellation-tickets/:id/mark-refunded
```

Approve or reject input:

```json
{
  "admin_note": "Approved after reviewing the race schedule and payment."
}
```

Record a sent refund:

```json
{
  "refund_reference": "VNPAY-REFUND-20260729-001",
  "admin_note": "Refund sent to the original payment account."
}
```

Approval atomically changes the registration to `cancelled`, releases one race
place, cancels active Jockey assignments for that horse and Race, increments the
Race model input version, and marks generated odds as `stale`.
Approval is blocked after betting opens or after any bet exists for the Race.

For a paid entry, approval changes `payment_status` to `refund_pending`. Recording
the transfer changes it to `refund_sent` and sets ticket `refund_status` to
`awaiting_owner_confirmation`.

### 18. Owner Confirms Refund Receipt

```text
POST /api/horse-owner/registration-cancellation-tickets/:id/confirm-refund
```

Optional input:

```json
{
  "confirmation_note": "Funds received in full."
}
```

The registration reaches `payment_status=refunded` only after this confirmation.
Free entries use `refund_status=not_required` and do not require owner confirmation.

## Development Notes

In development mode, these APIs return raw tokens for easier testing:

```text
register -> data.verification.otp
resend-verification -> data.verification.otp
forgot-password -> data.reset.otp
```

In production, raw verification and password reset OTPs should be sent by email service instead of being returned in the API response.

Email configuration for Gmail App Password:

```text
APP_URL=http://localhost:3000
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
EMAIL_FROM=your_gmail_address@gmail.com
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

Cloudinary upload behavior:

```text
For images/files, send *_file_data as a data URI/base64 source when possible.
The backend uploads to Cloudinary and stores secure_url plus public_id.
Legacy *_url fields are still accepted and uploaded to Cloudinary when credentials are configured.
```

When email credentials are configured, these APIs send email automatically:

```text
register -> verification OTP email
resend-verification -> verification OTP email
forgot-password -> password reset OTP email
```

Email send result is returned in development/testing response as:

```json
{
  "email": {
    "skipped": false,
    "message_id": "mail_message_id"
  }
}
```

If email credentials are missing, email sending is skipped:

```json
{
  "email": {
    "skipped": true,
    "reason": "Email credentials are not configured"
  }
}
```

If the account and spectator role are created but SMTP delivery fails, registration
still returns success so the client can open the verification screen and call
`POST /api/auth/resend-verification`:

```json
{
  "email": {
    "skipped": false,
    "failed": true,
    "reason": "Verification email could not be sent. Request a new OTP to try again."
  }
}
```

## Admin User and Role Management APIs

Protected APIs require a verified JWT with the `admin` role.

### 1. View User List

```text
GET /api/admin/users?page=1&limit=20&email=user@example.com&status=active&role=jockey
```

Query fields are optional:

```text
page: positive integer, default 1
limit: 1-100, default 20
email: partial email search
status: active | pending_verification | blocked | disabled
role: admin | horse_owner | jockey | race_referee | spectator
```

Output:

```json
{
  "success": true,
  "message": "User list retrieved successfully",
  "data": {
    "users": [
      {
        "user": {
          "_id": "user_object_id",
          "full_name": "Nguyen Van A",
          "email": "user@example.com",
          "status": "active",
          "email_verified": true
        },
        "roles": ["jockey"],
        "profiles": {
          "jockey": {
            "_id": "jockey_profile_id",
            "user_id": "user_object_id",
            "status": "active"
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "total_pages": 1
    }
  }
}
```

### 2. View User Detail

```text
GET /api/admin/users/:id
```

Output:

```json
{
  "success": true,
  "message": "User detail retrieved successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "full_name": "Nguyen Van A",
      "email": "user@example.com",
      "status": "active",
      "email_verified": true
    },
    "roles": ["horse_owner"],
    "profiles": {
      "horse_owner": {
        "_id": "horse_owner_profile_id",
        "user_id": "user_object_id",
        "status": "active"
      }
    }
  }
}
```

### 3. Update User Status

```text
PATCH /api/admin/users/:id/status
```

Input:

```json
{
  "status": "blocked"
}
```

Allowed status:

```text
active
pending_verification
blocked
disabled
```

Output:

```json
{
  "success": true,
  "message": "User status updated successfully",
  "data": {
    "user": {
      "_id": "user_object_id",
      "status": "blocked"
    },
    "roles": ["jockey"],
    "profiles": {}
  }
}
```

### 4. Assign User Role

```text
POST /api/admin/users/:id/roles
```

Input:

```json
{
  "role_name": "race_referee"
}
```

Notes:

```text
role can also be used instead of role_name.
For horse_owner, jockey, and race_referee, a missing profile is created automatically.
Duplicate role assignment returns 409.
```

Output:

```json
{
  "success": true,
  "message": "User role assigned successfully",
  "data": {
    "user": {
      "_id": "user_object_id"
    },
    "roles": ["spectator", "race_referee"],
    "profiles": {
      "race_referee": {
        "_id": "race_referee_profile_id",
        "user_id": "user_object_id",
        "status": "active"
      }
    }
  }
}
```

### 5. Remove User Role

```text
DELETE /api/admin/users/:id/roles/:roleName
```

Notes:

```text
roleName must be one of the configured role values.
The API does not allow removing the user's last role.
```

Output:

```json
{
  "success": true,
  "message": "User role removed successfully",
  "data": {
    "user": {
      "_id": "user_object_id"
    },
    "roles": ["spectator"],
    "profiles": {}
  }
}
```

## Jockey Flow and Supporting APIs

All APIs in this section require:

```text
Authorization: Bearer <token>
```

### Jockey Self APIs

```text
GET /api/jockeys/me
PATCH /api/jockeys/me
GET /api/jockeys/me/approval-status
GET /api/jockeys/me/assignments?status=meeting_invited
POST /api/jockeys/me/assignments/:id/accept
POST /api/jockeys/me/assignments/:id/reject
GET /api/jockeys/me/schedule?from=2026-06-01&to=2026-06-30
GET /api/jockeys/me/results
GET /api/jockeys/me/stats
GET /api/jockeys/me/violations
GET /api/jockeys/horses/:horseId/jockeys?status=accepted
GET /api/jockeys/horses/:horseId/schedule?from=2026-06-01&to=2026-06-30
```

`PATCH /api/jockeys/me` input:

```json
{
  "height": 170,
  "weight_kg": 58,
  "experience_years": 3,
  "license_number": "JOC-001"
}
```

Accept/reject offline appointment input:

```json
{
  "response_message": "I can attend the offline appointment"
}
```

Main output shapes:

```json
{
  "success": true,
  "message": "Jockey approval status retrieved successfully",
  "data": {
    "approval_status": {
      "jockey_id": "jockey_object_id",
      "status": "active",
      "is_approved": true,
      "license_number": "JOC-001"
    }
  }
}
```

```json
{
  "success": true,
  "message": "Jockey assignments retrieved successfully",
  "data": {
    "assignments": []
  }
}
```

```json
{
  "success": true,
  "message": "Horse jockey list retrieved successfully",
  "data": {
    "jockeys": []
  }
}
```

```json
{
  "success": true,
  "message": "Horse race schedule retrieved successfully",
  "data": {
    "schedule": []
  }
}
```

```json
{
  "success": true,
  "message": "Jockey stats retrieved successfully",
  "data": {
    "stats": {
      "jockey_id": "jockey_object_id",
      "total_races": 10,
      "total_wins": 3,
      "win_rate": 30,
      "top_3_finishes": 6
    }
  }
}
```

### Tournaments, Rounds, Races

Read APIs require login. Create/update/delete require `admin`.

Tournament APIs:

```text
GET /api/tournaments
POST /api/tournaments
GET /api/tournaments/:id
PATCH /api/tournaments/:id
DELETE /api/tournaments/:id
```

Create tournament input:

```json
{
  "name": "Summer Horse Racing Cup",
  "description": "Main tournament",
  "location": "Ho Chi Minh City",
  "image_file_data": "data:image/webp;base64,<base64-encoded-image>",
  "start_date": "2026-06-01",
  "end_date": "2026-06-30",
  "status": "active"
}
```

Round APIs:

```text
GET /api/rounds?tournament_id=<id>
POST /api/rounds
GET /api/rounds/:id
PATCH /api/rounds/:id
DELETE /api/rounds/:id
```

Create round input:

```json
{
  "tournament_id": "tournament_object_id",
  "name": "Round 1",
  "round_order": 1,
  "description": "Opening round",
  "status": "active"
}
```

Race APIs:

```text
GET /api/races?tournament_id=<id>&round_id=<id>&status=scheduled
POST /api/races
POST /api/races/registration-demo-mode
POST /api/races/:id/open-registration-demo
GET /api/races/:id
GET /api/races/:id/participants
PATCH /api/races/:id
DELETE /api/races/:id
```

For demo scheduling, `PATCH /api/races/:id` can change `race_date` without
checking or invalidating the current odds market. Updating the date recalculates
`registration_lock_at` to three hours before the new race time.

Create race input:

```json
{
  "tournament_id": "tournament_object_id",
  "round_id": "round_object_id",
  "name": "Race 1",
  "race_no": 1,
  "race_date": "2026-06-10T09:00:00.000Z",
  "distance": 1200,
  "max_participants": 8,
  "location": "Track A",
  "image_file_data": "data:image/webp;base64,<base64-encoded-image>",
  "venue_code": "ST",
  "course": "B+2",
  "race_class": "5",
  "going": "Good",
  "surface": "Turf",
  "entry_fee": 50000,
  "entry_fee_currency": "VND",
  "prize_pool": 100000000,
  "prize_currency": "VND",
  "referee_id": "race_referee_profile_id",
  "status": "scheduled"
}
```

For tournament and race images, send `image_file_data` as an image data URI.
The backend uploads it to Cloudinary and persists the returned `image_url` and
`image_public_id`. Existing `image_url` values remain readable for older
records.

Model input values:

```text
course: A | A+3 | B | B+2 | C | C+3
race_class: 1 | 2 | 3 | 4 | 5
going: Fast | Good | Good To Firm | Good To Yielding | Wet Slow | Yielding
surface: Turf | Dirt | Synthetic
```

### Prepare Race Entries For Odds

Read readiness:

```text
GET /api/races/:id/model-input-readiness
Authorization: Bearer <admin_token>
```

Finalize entries and assign `horse_no`, randomized `draw`, rating snapshots, gear snapshots,
and declared carried weight:

```text
POST /api/races/:id/entries/finalize
Authorization: Bearer <admin_token>
```

Every approved entry must already have an accepted primary jockey. The race must still be
scheduled. Calling finalize again is idempotent.

Readiness and finalization are optional data-quality tools. `POST /api/races/:id/odds/generate`
does not reject missing model fields; the probability adapter supplies documented fallback
values and returns them through `input_diagnostics.fallbacks_used`. A minimum of two approved
race registrations is still required.

When odds are generated, approved registrations are ordered by `registered_at` ascending
and persisted with draw values `1..participant_count`. The earliest approved registration
gets draw `1`. The response includes the mapping in `data.draw_assignment`.

Admin correction before betting opens:

```text
PATCH /api/registrations/:id/race-entry
Authorization: Bearer <admin_token>
```

```json
{
  "horse_no": 3,
  "draw": 5,
  "declared_weight_kg": 54.5,
  "gears": ["B", "TT"]
}
```

The app stores kilograms. The probability adapter converts `declared_weight_kg` to pounds
only when creating the AI request. Changes invalidate generated odds; changes are rejected
after betting is open or after any bet exists.

### Admin Horse Rating

```text
PATCH /api/admin/horses/:id/rating
GET /api/admin/horses/:id/rating-history
Authorization: Bearer <admin_token>
```

Manual rating input:

```json
{
  "current_rating": 57,
  "reason": "Official handicap reassessment"
}
```

New horses start at rating `50`. Published race results automatically apply the pairwise Elo
rating rule and append an audit record. The official raw finish order is used, before penalties.

Toggle all race registrations for demo:

```text
POST /api/races/registration-demo-mode
```

Role: `admin`

Input:

```json
{
  "enabled": true
}
```

Behavior:

```text
enabled=true opens registration for all scheduled races by moving them 24 hours
into the future, setting registration_locked=false, and setting
registration_lock_at to 3 hours before the new race_date.

enabled=false locks every currently unlocked race, regardless of lifecycle status,
by setting registration_locked=true. This also repairs completed demo races whose
registration was reopened accidentally.
```

Output:

```json
{
  "success": true,
  "message": "Race registration demo mode updated successfully",
  "data": {
    "enabled": true,
    "updated_count": 5,
    "race_date": "2026-07-01T10:00:00.000Z",
    "registration_lock_at": "2026-07-01T07:00:00.000Z"
  }
}
```

Open race registration for demo:

```text
POST /api/races/:id/open-registration-demo
```

This is an admin demo override. It can reopen a selected race even when its previous
date or status is no longer eligible: the race is reset to `scheduled`, moved 24
hours into the future, and unlocked for owner entries. Capacity and duplicate-horse
rules still apply.

Role: `admin`

Behavior:

```text
Sets race_date to 24 hours from now, recalculates registration_lock_at,
sets registration_locked=false, and keeps status=scheduled.
This is only allowed for scheduled races.
```

Output:

```json
{
  "success": true,
  "message": "Race registration opened for demo successfully",
  "data": {
    "race": {
      "_id": "race_object_id",
      "race_date": "2026-07-01T10:00:00.000Z",
      "registration_lock_at": "2026-07-01T07:00:00.000Z",
      "registration_locked": false,
      "status": "scheduled"
    }
  }
}
```

### Registrations

Roles:

```text
create: admin only (operational override; owner entry creation must use /api/horse-owner/race-registrations)
list/detail: admin, horse_owner
```

APIs:

```text
GET /api/registrations
POST /api/registrations
GET /api/registrations/:id
```

Create input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "owner_id": "owner_object_id",
  "note": "Operational entry note"
}
```

New entry behavior:

```text
POST /api/registrations is an admin-only operational override and creates status=approved.
Owner-created entries cannot use this endpoint because the horse-owner endpoint owns payment.
Legacy records may still contain pending or rejected statuses.
There are no manual registration approve/reject endpoints.
```

### Jockey Assignments

Roles:

```text
create offline appointment invitation/cancel/send terms/upload primary contract: admin, horse_owner
accept/reject offline appointment invitation, terms, and contract: jockey
withdraw before an agreement becomes active: horse_owner, jockey
request/respond to accepted primary contract or confirmed standby cancellation: horse_owner, jockey
list/detail: admin, horse_owner, jockey
```

APIs:

```text
GET /api/jockey-assignments
POST /api/jockey-assignments
GET /api/jockey-assignments/:id
POST /api/jockey-assignments/:id/cancel
POST /api/jockey-assignments/:id/withdraw
POST /api/jockey-assignments/:id/accept-meeting
POST /api/jockey-assignments/:id/reject-meeting
POST /api/jockey-assignments/:id/accept-appointment
POST /api/jockey-assignments/:id/reject-appointment
PATCH /api/jockey-assignments/:id/terms
POST /api/jockey-assignments/:id/confirm-terms
POST /api/jockey-assignments/:id/reject-terms
POST /api/jockey-assignments/:id/contract
POST /api/jockey-assignments/:id/confirm-contract
POST /api/jockey-assignments/:id/reject-contract
POST /api/jockey-assignments/:id/promote
POST /api/jockey-assignments/:id/cancellation-request
POST /api/jockey-assignments/:id/cancellation-request/respond
```

Legacy aliases:

```text
POST /api/jockey-assignments/:id/accept -> accept offline appointment invitation
POST /api/jockey-assignments/:id/reject -> reject offline appointment invitation
POST /api/jockey-assignments/:id/accept-meeting -> accept offline appointment invitation
POST /api/jockey-assignments/:id/reject-meeting -> reject offline appointment invitation
```

Create offline appointment invitation input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "owner_id": "required_only_for_admin",
  "jockey_id": "jockey_profile_id",
  "assignment_type": "primary",
  "backup_priority": 1,
  "invitation_message": "Please ride this horse",
  "meeting": {
    "title": "Offline contract discussion",
    "meeting_time": "2026-07-01T09:00:00.000Z",
    "location_name": "Saigon Racing Club Office",
    "address": "123 Nguyen Hue Street",
    "city": "Ho Chi Minh City",
    "district": "District 1",
    "ward": "Ben Nghe",
    "map_url": "https://maps.google.com/?q=Saigon+Racing+Club",
    "contact_name": "Nguyen Van A",
    "contact_phone": "+84901234567",
    "note": "Meet to discuss riding terms before contract upload"
  }
}
```

Offline appointment notes:

```text
Contract cannot be uploaded during create.
meeting.title is required.
meeting.meeting_time is required, must be in the future, and must be before race.race_date.
meeting.location_name is required.
meeting.address is required.
meeting.map_url is optional; if provided, it must be http or https.
meeting.meeting_url is legacy optional; if provided, it must be http or https.
```

Create rules:

```text
Only admin and horse_owner can invite jockeys.
Admin must send owner_id. Horse owner uses their own profile automatically.
The horse must belong to the owner.
The horse must have an approved registration for this race with payment_status paid or not_required.
Race, horse, and jockey profiles must exist.
Race cannot be started or finished.
Horse and jockey must be active.
assignment_type can be primary or backup; default is primary.
One horse can only have one active primary jockey assignment per race.
Backup jockey invitations require an accepted primary assignment with no pending mutual cancellation.
Only one active backup jockey assignment is allowed for each horse and race.
Backup jockeys confirm standby terms and do not upload or confirm a riding contract.
The same jockey cannot have multiple active assignments for the same horse and race.
A jockey may review multiple invitations, but can only become accepted or standby_confirmed
for one horse in the same race. A conflicting final confirmation returns 409.
backup_priority is optional and is always 1 because the app supports one optional backup.
Duplicate active primary race_id + horse_id returns 409.
Run npm.cmd run migrate:jockey-assignment-backup on existing databases to replace the old unique race_id + horse_id index.
The migration creates versioned primary/backup unique indexes before removing the legacy broad index. It also maps legacy pending/rejected and legacy backup contract statuses into the current lifecycle.
Run npm.cmd run migrate:registration-jockey-validations after deploying these validation changes.
The migration initializes reserved-place counters and verifies that existing confirmed jockey assignments do not conflict.
```

Accept/reject offline appointment input:

```json
{
  "response_message": "I will attend the appointment"
}
```

Send terms input:

```json
{
  "agreed_terms": "Owner and jockey agreed on service fee, race scope, and responsibilities.",
  "meeting_note": "Both sides agreed during the offline appointment.",
  "agreed_at": "2026-07-01T10:00:00.000Z"
}
```

Confirm/reject terms input:

```json
{
  "response_message": "Terms confirmed"
}
```

Upload contract input:

```json
{
  "file_data": "data:image/png;base64,...",
  "file_type": "image/png",
  "file_name": "jockey-contract.png"
}
```

Contract notes:

```text
Owner sends terms after the jockey accepts the appointment.
For a primary assignment, the jockey must confirm those terms before the owner can upload a contract.
For a backup assignment, confirming standby terms changes the status directly to standby_confirmed.
The contract endpoint rejects backup assignments.
contract.file_data or contract.file_url is required.
contract.file_url must be http or https.
contract.file_data must be a data URI and at most 10MB.
Supported contract.file_type values: image/jpeg, image/png, image/webp, application/pdf.
The backend uploads the file source to Cloudinary and stores contract.file_url plus contract.file_public_id.
The backend does not accept multipart files in this endpoint yet; send a data URI/base64 source.
```

Withdraw before agreement input:

```text
POST /api/jockey-assignments/:id/withdraw
```

```json
{
  "reason": "The parties did not reach final riding terms."
}
```

Tournament is an organizational group only. It does not own an entry fee or prize.
List and detail responses derive the following summary from non-deleted Races:

```json
{
  "race_count": 3,
  "total_race_prize_pool": 300000000,
  "prize_totals_by_currency": {
    "VND": 300000000
  }
}
```

Withdrawal rules:

```text
Only the horse owner and jockey attached to the assignment can withdraw.
Withdrawal is unilateral and does not require approval from the other party.
It is allowed while status is meeting_invited, meeting_accepted,
terms_pending_confirmation, standby_terms_pending_confirmation, terms_agreed,
terms_rejected, or contract_uploaded.
The assignment changes to cancelled and stores withdrawal actor, reason, and time.
It is not allowed after the primary contract or standby agreement becomes active.
Legacy backup statuses that already represent an agreed standby relationship are also treated as binding and require mutual cancellation.
Assignment actions are rejected after the race starts, finishes, is cancelled, or is archived.
Assignment transitions and race start are serialized through the race document, so a contract response cannot enter the participant snapshot after Start Race has claimed the race.
It is not allowed after the race has started.
The legacy POST /:id/cancel endpoint remains limited to an unaccepted meeting_invited invitation.
```

Confirm/reject contract input:

```json
{
  "response_message": "Contract confirmed"
}
```

Request accepted jockey contract cancellation input:

```text
POST /api/jockey-assignments/:id/cancellation-request
```

```json
{
  "reason": "The agreed race-day schedule can no longer be fulfilled."
}
```

Output:

```json
{
  "success": true,
  "message": "Jockey assignment cancellation requested successfully",
  "data": {
    "assignment": {
      "_id": "assignment_id",
      "assignment_type": "primary",
      "status": "accepted",
      "cancellation_request": {
        "status": "pending",
        "initiated_by_party": "horse_owner",
        "initiated_by": "owner_user_id",
        "reason": "The agreed race-day schedule can no longer be fulfilled.",
        "requested_at": "2026-07-27T08:00:00.000Z"
      }
    }
  }
}
```

Respond to cancellation input:

```text
POST /api/jockey-assignments/:id/cancellation-request/respond
```

```json
{
  "decision": "approve",
  "response_message": "Both parties agree to end the contract."
}
```

Cancellation rules:

```text
Only the horse owner and jockey attached to the assignment can use this flow.
The primary must be accepted, meaning its riding contract was confirmed.
The backup must be standby_confirmed, meaning its standby terms were confirmed.
Either party may create the request; reason is required and limited to 1000 characters.
The primary remains accepted and the backup remains standby_confirmed while cancellation_request.status is pending.
The initiating party cannot respond to its own request.
The other party can respond with decision=approve or decision=reject.
approve changes the assignment to cancelled; reject keeps the assignment accepted.
No request or response is allowed after the race has started or finished.
Cancelling a backup does not modify the primary assignment.
Cancelling a primary does not automatically promote its backup.
POST /:id/cancel remains limited to an unaccepted meeting_invited invitation.
```

Promote backup input:

```json
{
  "reason": "Primary jockey is unavailable; promote backup jockey to primary."
}
```

Promote backup output:

```json
{
  "success": true,
  "message": "Backup jockey promoted successfully",
  "data": {
    "assignment": {
      "_id": "backup_assignment_id",
      "assignment_type": "primary",
      "status": "meeting_accepted",
      "standby_terms": {
        "agreed_terms": "Original standby terms"
      },
      "promotion": {
        "promoted_at": "2026-06-30T10:00:00.000Z",
        "promoted_by": "owner_user_id",
        "reason": "Primary jockey is unavailable; promote backup jockey to primary.",
        "previous_primary_assignment_id": "old_primary_assignment_id"
      }
    },
    "previous_primary_assignment_id": "old_primary_assignment_id"
  }
}
```

Promote rules:

```text
Only admin and the horse owner can promote backup assignments.
Only a standby_confirmed backup assignment can be promoted.
The race must not be running, completed, finished, cancelled, or archived.
There must be no active primary assignment; an accepted primary must complete mutual cancellation first.
A pending backup cancellation request must be resolved before promotion.
The previous mutually cancelled primary remains cancelled for audit.
The promoted assignment returns to meeting_accepted so the owner sends terms, waits for jockey confirmation, then uploads the new primary contract.
Standby terms and any legacy standby contract are preserved for audit.
Promotion runs in a MongoDB transaction.
```

Statuses:

```text
meeting_invited, meeting_accepted, meeting_rejected,
terms_pending_confirmation, standby_terms_pending_confirmation, standby_confirmed,
terms_agreed, terms_rejected, contract_uploaded, contract_rejected,
accepted, cancelled, replaced
```

### Race Results

Roles:

```text
list/detail: admin, race_referee
update draft result row: assigned race_referee
finalize race and generate draft results: assigned race_referee, admin
confirm/publish: assigned race_referee
view published race results: spectator
```

APIs:

```text
GET /api/race-results
GET /api/race-results/races/:raceId/participants
GET /api/race-results/races/:raceId/readiness
POST /api/race-results/races/:raceId/finalize
POST /api/race-results/races/:raceId/apply-penalties
POST /api/race-results/races/:raceId/confirm
POST /api/race-results/races/:raceId/request-correction
POST /api/race-results/races/:raceId/resolve-correction
POST /api/race-results/races/:raceId/publish
GET /api/race-results/:id
PATCH /api/race-results/:id
GET /users/spectator/races/:raceId/results
GET /users/spectator/races/:raceId/live-state
```

Result confirmation and publication are race-level atomic operations. Individual
confirm/publish endpoints are intentionally unavailable so ranking cannot be
recalculated from a partial participant set.

`POST /api/race-results` is intentionally unavailable. Draft rows are created only by the
race-level finalize endpoint after the referee report, post-race checks, and violation review.

Race result correction ownership:

```text
Admin reviews race-level results and requests correction when something is wrong.
Referee edits the draft result rows, report, checks, or violations.
Admin resolves the correction request only after reviewing the referee changes.
Admin does not directly PATCH individual RaceResult rows.
```

Race lifecycle APIs:

```text
POST /api/races/:raceId/start
POST /api/races/:raceId/complete
```

Lifecycle:

```text
scheduled -> running -> completed
```

Start race behavior:

```text
POST /api/races/:raceId/start locks registrations, checks eligible participants,
sets race status to running, and creates a provisional Race Engine order.
The Race Engine does not stream live coordinates. It only returns participants
and final finish_order. The frontend owns 2D animation coordinates and should
align the last segment of the animation to this finish_order.
```

Start race success output:

```json
{
  "success": true,
  "message": "Race started successfully",
  "data": {
    "race": {
      "_id": "race_object_id",
      "status": "running"
    },
    "engine": {
      "created": true,
      "race_run": {
        "_id": "race_run_object_id",
        "race_id": "race_object_id",
        "status": "generated",
        "participants": [
          {
            "horse_id": "horse_object_id",
            "jockey_id": "jockey_profile_id",
            "lane": 1,
            "seed_position": 1
          }
        ],
        "finish_order": [
          {
            "horse_id": "horse_object_id",
            "jockey_id": "jockey_profile_id",
            "position": 1,
            "finish_time": 60.125,
            "score": 100
          }
        ]
      }
    }
  }
}
```

Spectator live-state output:

```json
{
  "success": true,
  "message": "Spectator race live state retrieved successfully",
  "data": {
    "race": {
      "_id": "race_object_id",
      "name": "Spring Heat 1",
      "status": "running"
    },
    "engine": {
      "_id": "race_run_object_id",
      "status": "generated",
      "participants": [],
      "finish_order": []
    },
    "official_results": []
  }
}
```

When official results are published, `official_results` contains the published
RaceResult rows. Before publication, spectator UI can use `engine.finish_order`
for demo/live 2D playback and display official result as pending.

Participant status output includes approved registration, horse, jockey assignment,
latest pre-race check, latest post-race check, `eligible`, and `blockers`.

Readiness output:

```json
{
  "race_id": "race_object_id",
  "race_status": "completed",
  "registration_locked": true,
  "race_date_passed": true,
  "eligible_participant_count": 2,
  "submitted_report_id": "report_object_id",
  "missing_report": false,
  "missing_post_check_horse_ids": [],
  "under_investigation_horse_ids": [],
  "unresolved_violation_ids": [],
  "ready": true
}
```

Finalize race prerequisites:

```text
race_date has passed
caller is the assigned referee or admin
registrations are locked
race status is completed or finished
at least one eligible participant exists
eligible participants have approved registration
eligible participants have accepted jockey assignment
eligible participants have passed pre-race check
all eligible participants have post-race check
no post-race check is under_investigation
assigned referee report is submitted
all violations are confirmed or dismissed
```

Finalize success output:

```json
{
  "success": true,
  "message": "Race finalized and draft results generated successfully",
  "data": {
    "race_id": "race_object_id",
    "referee_report_id": "report_object_id",
    "participant_count": 2,
    "engine": {
      "skipped": false,
      "run": {
        "status": "completed"
      },
      "results": [
        {
          "race_id": "race_object_id",
          "horse_id": "horse_object_id",
          "jockey_id": "jockey_profile_id",
          "position": 1,
          "finish_time": 60.125,
          "score": 100,
          "raw_position": 1,
          "raw_finish_time": 60.125,
          "raw_score": 100,
          "final_position": 1,
          "final_finish_time": 60.125,
          "final_score": 100,
          "applied_violation_ids": [],
          "status": "draft"
        }
      ]
    }
  }
}
```

Draft update input:

```json
{
  "position": 1,
  "finish_time": 72.45,
  "score": 98,
  "note": "Clean finish"
}
```

Statuses:

```text
draft, confirmed, published
```

Status transitions are enforced:

```text
draft -> confirmed -> published
draft/confirmed -> draft with correction_requested by admin correction request
```

Audit fields are separate:

```text
confirm: confirmed_by, confirmed_at
publish: published_by, published_at
correction request: correction_requested, correction_note, correction_requested_by, correction_requested_at
correction resolve: correction_requested=false, correction_resolved_by, correction_resolved_at
```

Publishing never overwrites confirmation audit data.

Admin correction request:

```text
POST /api/race-results/races/:raceId/request-correction
Authorization: Bearer <admin-token>
```

Input:

```json
{
  "correction_note": "Post-race check for Horse A must be reviewed before confirmation."
}
```

Behavior:

```text
- only admin can request correction
- published results cannot be sent back
- draft results remain draft
- confirmed results are moved back to draft and confirmation audit is cleared
- all race result rows are marked correction_requested=true with the same note
- confirmation is blocked until correction is resolved
- assigned referee reads correction_note and updates draft rows through PATCH /api/race-results/:id
- admin does not directly edit individual result rows
```

Output:

```json
{
  "success": true,
  "message": "Race result correction requested successfully",
  "data": {
    "race_id": "race_object_id",
    "results": [
      {
        "_id": "race_result_id",
        "status": "draft",
        "correction_requested": true,
        "correction_note": "Post-race check for Horse A must be reviewed before confirmation.",
        "correction_requested_by": "admin_user_id",
        "correction_requested_at": "2026-06-30T10:00:00.000Z"
      }
    ]
  }
}
```

Resolve correction:

```text
POST /api/race-results/races/:raceId/resolve-correction
Authorization: Bearer <admin-token>
```

No request body. Use this after the correction has been handled through report,
violation, penalty, post-check, or draft result updates.

Output:

```json
{
  "success": true,
  "message": "Race result correction resolved successfully",
  "data": {
    "race_id": "race_object_id",
    "results": [
      {
        "_id": "race_result_id",
        "status": "draft",
        "correction_requested": false,
        "correction_resolved_by": "admin_user_id",
        "correction_resolved_at": "2026-06-30T10:10:00.000Z"
      }
    ]
  }
}
```

Apply confirmed penalties:

```text
POST /api/race-results/races/:raceId/apply-penalties
Authorization: Bearer <assigned-referee-or-admin-token>
```

No request body. The calculation starts from `raw_*`, writes adjusted values to
`final_*` and `position/finish_time/score`, then records used violations in
`applied_violation_ids`. Repeating the API does not apply a penalty twice. Admin
confirm also runs this calculation and is blocked while a violation is unresolved.
Bulk confirmation also enforces `suspension_days` and `fine_amount` once. A
suspended jockey cannot receive a new assignment or be eligible to participate.

Result detail authorization:

```text
admin: any result
race_referee: only an assigned or recording referee
```

Jockey results and stats only use `published` race results.
Spectator result API only returns `published` race results ordered by position.

### Violations

Roles:

```text
create/update: admin, race_referee
confirm/dismiss: admin, recording race_referee
list/detail: admin, race_referee, jockey
```

Detail access is ownership-aware: referees may read assigned/recorded violations,
and jockeys may read only violations linked to their own jockey profile.

APIs:

```text
GET /api/violations
GET /api/violations/options
POST /api/violations/penalty-preview
POST /api/violations
GET /api/violations/:id
PATCH /api/violations/:id
POST /api/violations/:id/confirm
POST /api/violations/:id/dismiss
```

Create input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "horse_check_id": "linked_horse_check_id",
  "referee_id": "required_only_for_admin",
  "violation_type": "dangerous_riding",
  "description": "Moved outside lane",
  "severity": "major",
  "time_marker": "00:01:24",
  "evidence_files": [
    {
      "file_data": "data:image/jpeg;base64,...",
      "type": "image/jpeg",
      "file_name": "camera-01.jpg"
    }
  ],
  "status": "recorded"
}
```

`evidence_files[].file_data` is uploaded to Cloudinary. Use
`evidence_files[].url` or legacy `evidence_urls` for an already hosted asset.
`penalty` is not accepted on create. The backend snapshots `suggested_penalty`
from `violation_type + severity`, but never confirms or applies it automatically.
Legacy `auto_confirm` is accepted for compatibility and ignored.

Penalty preview input:

```text
POST /api/violations/penalty-preview
```

```json
{
  "violation_type": "lane_violation",
  "severity": "major"
}
```

Output:

```json
{
  "success": true,
  "message": "Violation penalty preview retrieved successfully",
  "data": {
    "policy": {
      "policy_version": "2026.3",
      "violation_type": "lane_violation",
      "severity": "major",
      "requires_review": false,
      "suggested_penalty": {
        "type": "time_penalty",
        "time_penalty_seconds": 3
      },
      "referee_adjustment": {
        "allowed": true,
        "primary_types": [
          "warning",
          "score_deduction",
          "time_penalty",
          "position_demotion",
          "disqualification",
          "suspension",
          "fine"
        ],
        "bounds": {
          "time_penalty_seconds": { "min": 1, "max": 5, "step": 1 },
          "suspension_days": { "min": 1, "max": 7, "step": 1 },
          "fine_amount": { "min": 50, "max": 1500, "step": 50 }
        }
      }
    }
  }
}
```

Confirm input:

```json
{
  "decision": "Video review confirms the lane violation.",
  "penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 2
  },
  "deviation_reason": "The runner was partially forced outward by another horse."
}
```

The recording referee may accept the suggestion by omitting `penalty`, or select
any supported penalty within the severity bounds. Any difference from
`suggested_penalty` requires `deviation_reason`. A valid referee decision becomes
`confirmed` immediately and is copied into final `penalty`. Out-of-range values
return `400` so the referee can correct them. No violation type requires a
separate admin review. `suggested_penalty` and `proposed_penalty` remain
available for audit.

Dismiss input:

```json
{
  "decision": "Video review found no infringement."
}
```

Controlled values:

```text
type: dangerous_riding, interference, illegal_whip_use, lane_violation,
      false_start, equipment_violation, horse_abuse, disobey_referee,
      doping_suspected, track_safety_issue, other
severity: minor, major, critical
status: recorded, under_review, confirmed, dismissed, resolved
penalty: warning, score_deduction, time_penalty, position_demotion,
         disqualification, suspension, fine
```

`GET /api/violations/options` returns these values and all 33 penalty policies
for UI controls. Every policy returns `requires_review=false`; legacy
`under_review` records remain resolvable by their recording referee.

Manual race result creation is disabled. Race Engine is the only source that creates draft results.

### Horse Checks

Roles:

```text
create/list/detail/update: admin, race_referee
```

APIs:

```text
GET /api/horse-checks?race_id=<id>&horse_id=<id>&referee_id=<id>
GET /api/horse-checks?race_id=<id>&phase=pre_race&status=passed
POST /api/horse-checks/pre-race
POST /api/horse-checks/during-race
POST /api/horse-checks/post-race
POST /api/horse-checks
GET /api/horse-checks/:id
PATCH /api/horse-checks/:id
```

Pre-race create input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "referee_id": "optional_for_admin",
  "status": "passed",
  "checklist": {
    "identity_verified": true,
    "registration_valid": true,
    "jockey_assigned": true,
    "jockey_contract_confirmed": true,
    "horse_health_status_ok": true,
    "no_visible_lameness": true,
    "no_visible_injury": true,
    "normal_gait": true,
    "normal_breathing": true,
    "equipment_ok": true,
    "fit_to_race": true
  },
  "health_status": "healthy",
  "weight": 480,
  "check_note": "Passed pre-race inspection",
  "is_eligible": true
}
```

Pre-race statuses:

```text
passed, failed, needs_review, scratched
```

If status is `failed` or `scratched`, `issues` or `check_note` is required.

During-race incident input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "status": "incident_recorded",
  "event_type": "dangerous_riding",
  "severity": "major",
  "time_marker": "00:01:24",
  "description": "Jockey crossed lane and interfered with another horse",
  "evidence_urls": ["https://example.com/video-frame.jpg"],
  "requires_violation": true
}
```

During-race statuses:

```text
normal, incident_recorded, race_stopped, under_investigation
```

If `requires_violation` is true, the backend creates a linked violation and
returns it with the horse check. It is always unresolved until the referee
submits a penalty decision. Legacy `auto_confirm_violation` is ignored.

Post-race create input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "status": "normal",
  "checklist": {
    "horse_finished_safely": true,
    "post_race_lameness_check": true,
    "post_race_injury_check": true,
    "breathing_recovered": true,
    "heart_rate_recovered": true,
    "bleeding_check": true,
    "medical_follow_up_required": false
  },
  "check_note": "No post-race issue detected"
}
```

Post-race statuses:

```text
normal, minor_issue, injury_detected, requires_vet_follow_up, under_investigation
```

If status is `injury_detected` or `requires_vet_follow_up`, `issues` or `check_note` is required.

Race result guard:

```text
If a pre-race horse check exists for race_id + horse_id and its status is not passed,
the backend blocks race result creation for that horse.
```

### Referee Reports

Roles:

```text
create/list/detail/update/submit: admin, race_referee
```

APIs:

```text
GET /api/referee-reports?race_id=<id>&referee_id=<id>&status=draft
POST /api/referee-reports
GET /api/referee-reports/:id
PATCH /api/referee-reports/:id
POST /api/referee-reports/:id/submit
```

Create input:

```json
{
  "race_id": "race_object_id",
  "referee_id": "optional_for_admin",
  "report_title": "Race official report",
  "report_content": "Race completed normally",
  "race_condition": "normal",
  "weather": "sunny",
  "track_condition": "dry",
  "conclusion": "No major issue"
}
```

Update input:

```json
{
  "report_title": "Updated race official report",
  "report_content": "Updated content",
  "race_condition": "normal",
  "weather": "cloudy",
  "track_condition": "wet",
  "conclusion": "Report ready to submit"
}
```

Behavior:

```text
Race referee users automatically use their own referee profile.
A race referee can only create reports for races assigned to that referee.
A race referee can only view/update/submit reports owned by that referee.
A race referee can only update draft reports.
Admin can view/update/submit all reports and can create reports with referee_id or with the race assigned referee.
Submitting a report changes status from draft to submitted and sets submitted_at.
Submitting an already submitted report returns 409.
```

Output:

```json
{
  "success": true,
  "message": "Referee report created successfully",
  "data": {
    "referee_report": {
      "_id": "referee_report_object_id",
      "race_id": "race_object_id",
      "referee_id": "race_referee_profile_id",
      "report_title": "Race official report",
      "report_content": "Race completed normally",
      "race_condition": "normal",
      "weather": "sunny",
      "track_condition": "dry",
      "conclusion": "No major issue",
      "status": "draft",
      "created_at": "2026-06-05T00:00:00.000Z"
    }
  }
}
```

Update input:

```json
{
  "health_status": "minor_issue",
  "weight": 481,
  "check_note": "Updated note",
  "is_eligible": false
}
```

Behavior:

```text
Race referee users automatically use their own referee profile.
A race referee can only create/view/update checks assigned to that referee.
Admin can view/update all checks and can create checks with referee_id or with the race assigned referee.
Pre-race and post-race checks are unique by race_id + horse_id + phase. During-race checks may contain multiple incident records for the same horse.
```

Output:

```json
{
  "success": true,
  "message": "Horse check created successfully",
  "data": {
    "horse_check": {
      "_id": "horse_check_object_id",
      "race_id": "race_object_id",
      "horse_id": "horse_object_id",
      "referee_id": "race_referee_profile_id",
      "health_status": "healthy",
      "weight": 480,
      "check_note": "Passed pre-race inspection",
      "is_eligible": true,
      "checked_at": "2026-06-05T00:00:00.000Z"
    }
  }
}
```

## Referee Workspace

Aggregate endpoint for the Referee FE workspace. This replaces the old pattern
of loading assigned races, then requesting participants for every race, then
loading results, violations, horse checks, and reports as separate lists.

```text
GET /api/referees/me/workspace
Authorization: Bearer <race_referee_token>
```

Output:

```json
{
  "success": true,
  "message": "Referee workspace retrieved successfully",
  "data": {
    "referee": {
      "_id": "race_referee_profile_id",
      "user_id": "user_object_id",
      "license_number": "RF-2026-001"
    },
    "races": [],
    "participants_by_race": {
      "race_object_id": [
        {
          "registration": {},
          "horse": {},
          "owner": {},
          "jockey": {},
          "assignment": {},
          "pre_race_check": {},
          "post_race_check": {},
          "eligible": true,
          "blockers": []
        }
      ]
    },
    "results_by_race": {
      "race_object_id": []
    },
    "violations_by_race": {
      "race_object_id": []
    },
    "horse_checks_by_race": {
      "race_object_id": []
    },
    "reports_by_race": {
      "race_object_id": []
    }
  }
}
```

Behavior:

```text
Only race_referee users can access this endpoint.
The backend derives the referee profile from the authenticated user.
Only races assigned to that referee are returned.
Participants are built in bulk from approved registrations, jockey assignments, and latest horse checks.
Eligibility blockers match the Race Engine rules used by result finalization.
```

## Bulk Horse Checks

Bulk save pre-race or post-race horse checks for a race. This is intended for
the Referee inspection UI `Save All Checks` action.

```text
POST /api/horse-checks/pre-race/bulk
POST /api/horse-checks/post-race/bulk
Authorization: Bearer <race_referee_token>
```

Input:

```json
{
  "race_id": "race_object_id",
  "checks": [
    {
      "horse_id": "horse_object_id",
      "jockey_id": "jockey_object_id",
      "status": "passed",
      "checklist": {
        "identity_verified": true,
        "fit_to_race": true
      },
      "issues": [],
      "health_status": "healthy",
      "weight": 480,
      "check_note": "OK",
      "is_eligible": true
    }
  ]
}
```

Output:

```json
{
  "success": true,
  "message": "Horse checks saved successfully",
  "data": {
    "created": [],
    "updated": [],
    "failed": [
      {
        "horse_id": "horse_object_id",
        "status": 409,
        "message": "Horse must pass pre-race check before post-race check"
      }
    ],
    "summary": {
      "created_count": 2,
      "updated_count": 4,
      "failed_count": 1
    }
  }
}
```

Behavior:

```text
The backend derives the referee profile from the authenticated user.
A race referee can only bulk save checks for races assigned to that referee.
Pre-race and post-race checks are upserted by race_id + horse_id + phase.
Post-race bulk save requires the horse to have passed pre-race inspection.
Post-race checks are blocked after race results are confirmed or published.
Invalid individual horses return in failed without failing the whole batch.
```

---

## Prize APIs

Prize belongs to `Race`, not `Tournament`. Tournament and round only organize the competition structure.

### Configure Race Prize

```text
POST /api/prizes/races/:raceId/config
Authorization: Bearer <admin_token>
```

Input:

```json
{
  "prize_pool": 100000000,
  "prize_currency": "VND",
  "prize_distribution": [
    { "position": 1, "percent": 60, "label": "Winner" },
    { "position": 2, "percent": 20, "label": "Runner-up" },
    { "position": 3, "percent": 11, "label": "Third place" }
  ]
}
```

Output:

```json
{
  "success": true,
  "message": "Race prizes configured successfully",
  "data": {
    "race": { "_id": "race_id", "prize_pool": 100000000, "prize_currency": "VND" },
    "prizes": [
      { "_id": "prize_id", "position": 1, "amount": 60000000, "currency": "VND" }
    ]
  }
}
```

If `prize_pool` is set and `prize_distribution` is omitted, backend uses default split `60% / 20% / 11% / 6% / 3%` for positions 1-5.

### Get Race Prize Config

```text
GET /api/prizes/races/:raceId/config
Authorization: Bearer <admin|horse_owner|jockey|spectator_token>
```

Output:

```json
{
  "success": true,
  "message": "Race prize config retrieved successfully",
  "data": {
    "race": { "_id": "race_id", "prize_pool": 100000000, "prize_currency": "VND" },
    "prizes": []
  }
}
```

### Calculate Race Prize Awards

```text
POST /api/prizes/races/:raceId/calculate
Authorization: Bearer <admin_token>
```

Output:

```json
{
  "success": true,
  "message": "Race prize awards calculated successfully",
  "data": {
    "race_id": "race_id",
    "created_count": 5,
    "awards": [
      {
        "_id": "award_id",
        "position": 1,
        "gross_amount": 60000000,
        "owner_amount": 54000000,
        "jockey_amount": 6000000,
        "currency": "VND",
        "status": "calculated"
      }
    ]
  }
}
```

This endpoint is also called automatically after `POST /api/race-results/races/:raceId/publish`.

### Approve Race Prize Awards

```text
POST /api/prizes/races/:raceId/approve
Authorization: Bearer <admin_token>
```

Output:

```json
{
  "success": true,
  "message": "Race prize awards approved successfully",
  "data": {
    "race_id": "race_id",
    "awards": [
      { "_id": "award_id", "status": "approved" }
    ]
  }
}
```

### Mark Prize Award Paid

```text
POST /api/prizes/awards/:id/mark-paid
Authorization: Bearer <admin_token>
```

Output:

```json
{
  "success": true,
  "message": "Prize award marked paid successfully",
  "data": {
    "award": {
      "_id": "award_id",
      "status": "paid",
      "paid_at": "2026-06-30T00:00:00.000Z"
    }
  }
}
```

### List Prize Awards

```text
GET /api/prizes?race_id=:raceId&status=calculated
GET /api/prizes/races/:raceId/awards
Authorization: Bearer <admin|horse_owner|jockey|spectator_token>
```

Output:

```json
{
  "success": true,
  "message": "Prize awards retrieved successfully",
  "data": {
    "awards": [
      {
        "_id": "award_id",
        "position": 1,
        "gross_amount": 60000000,
        "owner_amount": 54000000,
        "jockey_amount": 6000000,
        "currency": "VND",
        "status": "calculated"
      }
    ]
  }
}
```

## Race Odds APIs

These endpoints generate and read a pre-race virtual betting odds snapshot from `app_probability_engine_history_v1_runtime`.

### Generate Race Odds

```text
POST /api/races/:id/odds/generate
Authorization: Bearer <admin_token>
```

Input: none

Prerequisites:

```text
Race entries are finalized.
At least two approved entries are ready.
Each entry has an accepted primary jockey, unique horse_no/draw, rating snapshot,
declared_weight_kg, and gear list.
Race model fields are complete.
```

Output:

```json
{
  "success": true,
  "message": "Race odds generated successfully",
  "data": {
    "market": {
      "_id": "market_id",
      "race_id": "race_id",
      "status": "generated",
      "model_name": "probability_engine_history_v1",
      "model_version": "history_v1.0.0",
      "payout_factor": 0.85,
      "input_diagnostics": {
        "participant_count": 5,
        "fallback_count": 12,
        "fallbacks_used": ["entry.rating_default_50"]
      },
      "odds": [
        {
          "horse_id": "horse_id",
          "horse_no": 1,
          "horse_name": "Silver Comet",
          "win_probability": 0.24,
          "fair_odds": 4.16,
          "generated_game_odds": 3.54,
          "game_odds": 3.54,
          "probability_rank": 1
        }
      ]
    },
    "model_evaluation": {
      "dataset": {
        "validation_races": 452,
        "validation_runners": 5472
      },
      "validation_metrics": {
        "top1_accuracy": 0.22123893805309736,
        "top3_accuracy": 0.48451327433628316,
        "log_loss": 0.27844948771925954,
        "brier_score": 0.07462790554442887
      }
    }
  }
}
```

### Adjust Final Race Odds

```text
PATCH /api/races/:id/odds
Authorization: Bearer <admin_token>
```

Input must contain every horse in the generated market exactly once:

```json
{
  "odds": [
    { "horse_id": "horse_1_id", "game_odds": 3.75 },
    { "horse_id": "horse_2_id", "game_odds": 5.2 }
  ],
  "adjustment_note": "Final market review before opening"
}
```

Rules:

```text
Only RaceOddsMarket.status=generated can be adjusted.
Adjustments are rejected after betting opens or any bet exists.
game_odds must be between 1.01 and 1000 and is rounded to two decimals.
win_probability, fair_odds, probability_rank, and generated_game_odds remain unchanged.
The admin and adjustment time are stored for audit.
```

Output returns the updated market with `manually_adjusted_by`, `manually_adjusted_at`,
`manual_adjustment_note`, and the final `game_odds` values.

### Get Race Odds

```text
GET /api/races/:id/odds
Authorization: Bearer <admin|horse_owner|jockey|race_referee|spectator_token>
```

Output:

```json
{
  "success": true,
  "message": "Race odds retrieved successfully",
  "data": {
    "market": {
      "_id": "market_id",
      "status": "generated",
      "odds": [
        {
          "horse_id": "horse_id",
          "win_probability": 0.24,
          "fair_odds": 4.16,
          "game_odds": 3.54,
          "probability_rank": 1
        }
      ]
    }
  }
}
```

### Open Race Betting

```text
POST /api/races/:id/betting/open
Authorization: Bearer <admin_token>
```

Input:

```json
{
  "min_stake": 5,
  "max_stake": 500,
  "currency": "TOKEN"
}
```

All input fields are optional. Time-window validation is intentionally left for a later phase.

Behavior:

```text
Requires an existing odds market with status generated or open.
Sets RaceOddsMarket.status = open.
Sets Race.betting_status = open.
Stores betting_market opens_at/min_stake/max_stake/currency on Race.
```

Output:

```json
{
  "success": true,
  "message": "Race betting opened successfully",
  "data": {
    "race": {
      "_id": "race_id",
      "betting_status": "open",
      "betting_market": {
        "status": "open",
        "opens_at": "2026-07-01T10:00:00.000Z",
        "min_stake": 5,
        "max_stake": 500,
        "currency": "TOKEN"
      }
    },
    "market": {
      "_id": "market_id",
      "status": "open"
    }
  }
}
```

### Close Race Betting

```text
POST /api/races/:id/betting/close
Authorization: Bearer <admin_token>
```

Input: none

Behavior:

```text
Sets RaceOddsMarket.status = closed when the market is not settled.
Sets Race.betting_status = closed.
Prevents new bets.
Also happens automatically when POST /api/races/:id/start succeeds.
```

Output:

```json
{
  "success": true,
  "message": "Race betting closed successfully",
  "data": {
    "race": {
      "_id": "race_id",
      "betting_status": "closed",
      "betting_market": {
        "status": "closed"
      }
    },
    "market": {
      "_id": "market_id",
      "status": "closed"
    }
  }
}
```

## Bet APIs

These APIs use the generated race odds snapshot for virtual betting. The current model supports win bets only: the spectator selects one horse to win.

### Place Bet

```text
POST /api/bets
Authorization: Bearer <spectator_token>
```

Input:

```json
{
  "race_id": "race_id",
  "horse_id": "horse_id",
  "stake_amount": 10
}
```

Alternative input key:

```json
{
  "race_id": "race_id",
  "predicted_horse_id": "horse_id",
  "stake_amount": 10
}
```

Behavior:

```text
Requires an existing odds market with status open.
Deducts stake_amount from spectator wallet immediately.
Stores odds_snapshot on the bet so payout does not change if odds are regenerated later.
potential_payout = stake_amount * odds_snapshot.game_odds.
Counts distinct spectators per horse. At every 5th distinct spectator, that horse's odds decrease by 0.10 and the 0.10 increase is divided across the other horses.
Repeated bets from the same spectator do not advance the threshold.
If bet creation fails after wallet deduction, backend refunds the stake and writes a bet_refund transaction log.
```

Output:

```json
{
  "success": true,
  "message": "Bet placed successfully",
  "data": {
    "bet": {
      "_id": "bet_id",
      "spectator_id": "user_id",
      "race_id": "race_id",
      "predicted_horse_id": "horse_id",
      "stake_amount": 10,
      "odds_market_id": "market_id",
      "odds_snapshot": {
        "model_name": "probability_engine_history_v1",
        "model_version": "history_v1.0.0",
        "horse_name": "Silver Comet",
        "win_probability": 0.24,
        "fair_odds": 4.16,
        "game_odds": 3.54,
        "probability_rank": 1
      },
      "potential_payout": 35.4,
      "payout_amount": 0,
      "status": "pending"
    },
    "wallet": {
      "user_id": "user_id",
      "token_balance": 90
    },
    "transaction": {
      "transaction_type": "bet_deduct",
      "amount": 10,
      "direction": "debit",
      "status": "completed"
    },
    "odds_update": {
      "trigger": {
        "bettors_per_step": 5,
        "odds_step": 0.1
      },
      "odds": [
        {
          "horse_id": "horse_id",
          "game_odds": 3.44,
          "distinct_bettor_count": 5,
          "adjustment_steps": 1
        }
      ]
    }
  }
}
```

Possible errors:

```json
{
  "success": false,
  "message": "Insufficient wallet balance"
}
```

```json
{
  "success": false,
  "message": "Race odds market not found"
}
```

### View My Bets

```text
GET /api/bets/me?status=pending|won|lost|cancelled&race_id=race_id
Authorization: Bearer <spectator_token>
```

Output:

```json
{
  "success": true,
  "message": "Bets retrieved successfully",
  "data": {
    "bets": [
      {
        "_id": "bet_id",
        "race_id": "race_id",
        "predicted_horse_id": "horse_id",
        "stake_amount": 10,
        "potential_payout": 35.4,
        "payout_amount": 0,
        "status": "pending"
      }
    ],
    "total": 1
  }
}
```

### Settle Race Bets

```text
POST /api/bets/races/:raceId/settle
Authorization: Bearer <admin_token>
```

Input: none

Behavior:

```text
Normally called automatically by POST /api/race-results/races/:raceId/publish.
Requires published race results with an official first-place winner.
Pending bets are marked won/lost.
Winning bets credit wallet using the original bet odds_snapshot/potential_payout.
Can be called manually by admin to retry settlement when publish succeeded but bet settlement failed.
```

Output:

```json
{
  "success": true,
  "message": "Race bets settled successfully",
  "data": {
    "race_id": "race_id",
    "pending_count": 3,
    "settled_count": 3,
    "won_count": 1,
    "lost_count": 2,
    "payout_total": 35.4,
    "winner_result_id": "race_result_id"
  }
}
```

### Race Result Publish With Bet Settlement

```text
POST /api/race-results/races/:raceId/publish
Authorization: Bearer <assigned_referee_token>
```

Additional output field:

```json
{
  "bet_settlement": {
    "settled_count": 3,
    "won_count": 1,
    "lost_count": 2,
    "payout_total": 35.4
  }
}
```

If bet settlement fails after results are already published, publish response still succeeds and returns a retryable settlement status:

```json
{
  "bet_settlement": {
    "status": "failed",
    "message": "wallet settlement failed",
    "retry_endpoint": "/api/bets/races/race_id/settle"
  }
}
```
