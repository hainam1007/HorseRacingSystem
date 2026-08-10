# Owner Horse Registration, Race Registration, And Jockey Invitation Flow

Tai lieu nay ghi lai target flow da chot cho Horse Owner. Day la flow san pham/frontend mong muon, dung de can chinh UI, validation, API adapter va trao doi voi backend.

## 1. Core Decision

### Horse profile does not need admin approval

Horse Owner tao ho so ngua trong workspace cua minh. Day la tai san/profile local cua owner, khong phai dang ky tham gia thi dau.

```text
Owner creates horse profile
  -> horse is saved under owner account
  -> no admin approval required at this step
```

Admin chi can duyet khi owner dung ngua do de dang ky tham gia mot race.

```text
Owner registers horse for race
  -> registration is pending
  -> admin reviews whether this horse is valid for this race
  -> approved or rejected
```

### Jockey invitation requires approved race registration

Owner chi duoc moi jockey sau khi ngua da co race registration duoc duyet.

```text
Horse profile exists
  -> owner registers horse for race
  -> admin approves race registration
  -> owner can invite jockey for that horse + race
```

This prevents owner from inviting jockeys for races where the horse may not be allowed to participate.

### Jockey invitation includes online contract and meeting link

Target product flow requires the invitation sent to jockey to include:

- Horse information.
- Race information.
- Invitation message.
- Google Meet link.
- Meeting time.
- Online contract, either as file data or a contract URL/link.

Note: the latest backend currently models contract upload after meeting/terms. For this target flow, frontend should document the requirement clearly and backend should align by allowing contract data/link during invitation create, or by exposing an equivalent invitation contract draft field.

## 2. Target User Flow

```text
Horse Owner logs in
  -> creates horse profile
  -> horse appears in owner's horse list
  -> owner chooses tournament/race
  -> owner submits race registration for the horse
  -> admin reviews race registration
  -> registration approved
  -> owner selects jockey
  -> owner sends invitation with Meet link and online contract
  -> jockey reviews invitation, horse, race, Meet, and contract
  -> jockey accepts or rejects
  -> if accepted: jockey is assigned to horse for that race
  -> if rejected: owner can choose another jockey
```

## 3. Role Swimlane

```text
Horse Owner                Admin                         Jockey
-----------                -----                         ------
Create horse profile
Horse saved locally

Choose race
Submit race registration
                           Review registration
                           Approve or reject

If approved:
Choose jockey
Attach Meet link
Attach contract
Send invitation
                                                        View invitation
                                                        View horse/race
                                                        View Meet link
                                                        View contract
                                                        Accept or reject

If accepted:
Assignment active
```

## 4. Detailed Flow

### Step 1: Owner creates horse profile

Owner inputs horse profile fields:

- Name.
- Registration number.
- Breed.
- Gender.
- Date of birth.
- Color.
- Weight.
- Health status.
- Image, optional.

Expected result:

```text
Horse profile is created under this owner.
Horse can be edited/deactivated by the owner.
No admin approval is required for this local horse profile.
```

Frontend validation:

- `name` is required.
- `registration_number` is required.
- If image is uploaded, send as data URI/base64.
- Owner can only edit horses belonging to them.

### Step 2: Owner registers horse for race

Owner selects:

- Horse.
- Tournament.
- Race.
- Optional registration note.

Expected result:

```text
Race registration is created with pending status.
Admin must review this registration.
```

Frontend validation:

- Horse must belong to current owner.
- Horse must be active.
- Race must exist.
- Race must not be started, running, completed, or finished.
- Duplicate horse + race registration should be blocked or shown as conflict.
- Owner cannot proceed to jockey invitation while registration is pending or rejected.

### Step 3: Admin approves race registration

Admin reviews:

- Horse identity and profile.
- Horse health/status information.
- Race constraints.
- Duplicate/invalid registration.
- Any rule-specific eligibility.

Admin decision:

```text
approved
rejected
```

Expected result:

```text
Only approved race registrations unlock jockey invitation for that horse + race.
Rejected registrations keep jockey invitation disabled.
```

### Step 4: Owner invites jockey

Unlocked only when:

```text
horse belongs to owner
horse is active
race registration exists
race registration status is approved
race has not started or finished
jockey is active/approved
no active assignment exists for same horse + race
```

Owner invitation payload should include:

- `race_id`.
- `horse_id`.
- `jockey_id`.
- `invitation_message`.
- Meeting title.
- Google Meet URL.
- Meeting time in the future.
- Contract file data or contract URL/link.
- Contract metadata, such as title, contract number, file type, signed date, and note where available.

Expected status:

```text
invited or pending_jockey_response
```

Naming can map to backend status later, but the UI should clearly show that the invitation is waiting for jockey response.

Owner invitation UI rule:

```text
The race selector must only show approved race registrations that do not already have a jockey assignment.
Pending, rejected, cancelled, or already-assigned race registrations must not be selectable for jockey invitation.
```

### Step 5: Jockey accepts or rejects

Jockey sees:

- Owner/stable context.
- Horse information.
- Race/tournament information.
- Meeting link and time.
- Contract preview/download.
- Invitation message.

Jockey actions:

```text
accept
reject
```

If accepted:

```text
assignment status = accepted
jockey is assigned to this horse + race
owner sees confirmed jockey
jockey schedule/assignment list includes the race
```

If rejected:

```text
assignment status = rejected
owner can choose another jockey if race is still open for assignment
```

## 5. Validation Rules

### Horse profile validation

- Creating a horse profile does not require admin approval.
- Horse must belong to current owner for edit/deactivate/register actions.
- Inactive/deleted horses cannot be registered for races.

### Race registration validation

- Horse is required.
- Race is required.
- Horse must belong to current owner.
- Horse must be active.
- Race must be open for registration.
- Duplicate registration for same horse + race should not be allowed.
- Admin approval is required before jockey invitation.

### Jockey invitation validation

- Race registration must be approved.
- Race must not be started, running, ongoing, in progress, completed, or finished.
- Jockey must be active/approved.
- Google Meet URL is required and should start with `https://meet.google.com/`.
- Meeting time is required and must be in the future.
- Contract file or contract URL/link is required in the target product flow.
- Duplicate active assignment for same horse + race should not be allowed.

## 6. Current Backend Alignment Notes

Current backend pieces that already match or partially match:

- Owner can create and manage horses.
- Owner can register horse for race.
- Admin registration approval APIs exist in the general registrations module.
- Jockey assignment APIs exist.
- Backend validates race state and active horse/jockey for assignment create.
- Backend has unique index on `race_id + horse_id` for jockey assignment.

Known mismatch:

- Latest backend jockey assignment flow is meeting-first and uploads contract after terms are agreed.
- Target product flow wants the jockey invitation to include both Google Meet link and online contract at invitation time.

Backend alignment options:

```text
Option A
  Allow contract draft/file/link in POST /jockey-assignments.

Option B
  Keep backend meeting/terms/contract flow,
  but add an invitation contract draft field visible to jockey during initial review.

Option C
  Frontend follows backend current lifecycle,
  but this does not match the product decision that invitation includes contract.
```

Preferred target:

```text
Option A or Option B
```

## 7. Phase 1 - Documentation And Contract Alignment

### Goal

Lock the product flow and update frontend planning docs so implementation does not continue with the wrong assumption.

### Scope

- Document that horse profile creation does not need admin approval.
- Document that admin approves race registration, not horse profile.
- Document that approved race registration is required before jockey invitation.
- Document that jockey invitation includes Google Meet link and online contract.
- Identify mismatch with current backend meeting-first contract lifecycle.
- Prepare frontend implementation checklist for owner/jockey screens.

### Tasks

- [x] Create this flow plan.
- [x] Update `API_INTEGRATION_PLAN.md` to reference this target flow.
- [x] Update `MAIN_FLOWS.md` to remove horse approval wording and replace with race registration approval.
- [x] Update `CLAUDE.md` and `design.md` notes so owner/jockey UI language follows the target flow.
- [x] Add backend alignment note: contract must be present at invitation time or exposed as invitation contract draft.
- [ ] Confirm backend API decision for contract-in-invitation.

### Phase 1 Acceptance Criteria

- Frontend docs no longer say horse profile needs admin approval.
- Frontend docs clearly say race registration approval unlocks jockey invitation.
- Frontend docs clearly say invitation includes Meet link and contract.
- Remaining backend mismatch is called out explicitly.
- No frontend code is changed in Phase 1.

## 8. Phase 2 - Frontend Implementation Plan

Phase 2 starts after Phase 1 docs are accepted.

### Tasks

- [x] Owner jockey assignment form checks for approved race registration before allowing invitation submit.
- [x] Owner jockey assignment form requires meeting title, Google Meet URL, future meeting time, and contract file/link before submit.
- [x] Owner UI disables invite submit when the selected horse + race has no approved registration.
- [x] Owner invitation UI only lists approved race registrations that do not already have a jockey assignment.
- [x] Owner invitation payload sends backend-compatible meeting data.
- [x] Owner invitation payload keeps contract as `contract_draft` to avoid breaking the current backend validator that rejects `contract` during create.
- [x] Jockey invitation page displays Meet and contract review sections before accept/reject.
- [x] Jockey accept/reject actions prefer the newer meeting endpoints and fall back to existing self-assignment endpoints.
- [x] Admin registration module clearly approves/rejects horse race registrations.
- [ ] Confirm backend API decision for contract-in-invitation and replace `contract_draft` with the official field.
- [ ] Manual test with real owner/admin/jockey accounts.

### Phase 2 Acceptance Criteria

- Owner cannot send a jockey invitation unless race registration for selected horse + race is approved.
- Owner cannot send a jockey invitation without Google Meet URL, future meeting time, and contract file/link.
- Jockey sees Meet and contract context before accepting or rejecting.
- Existing backend still accepts the owner invitation request while contract-in-invitation is unresolved.
- No layout clipping or overlap in owner invite form or jockey invitation cards on desktop/mobile.

## 9. Phase 3 - Admin Race Registration Approval

### Goal

Make the admin `registrations` module represent race registration approval, not role application approval.

### Tasks

- [x] Connect admin registration queue to `GET /registrations`.
- [x] Wire approve action to `POST /registrations/:id/approve`.
- [x] Wire reject action to `POST /registrations/:id/reject`.
- [x] Show horse, race, tournament, owner, status, submitted date, reviewed date, and admin note in registration detail.
- [x] Update admin registration copy so it explains horse race entry review.
- [ ] Manually verify with admin account after backend is running.

### Phase 3 Acceptance Criteria

- Admin sees horse race registration rows instead of role application rows.
- Approve/reject actions update race registration status through the general registrations API.
- Owner jockey invitation gate can rely on the approved race registration state from the same backend flow.

## 10. Open Questions

- Should rejected race registrations be editable/resubmittable, or should owner create a new registration?
- If jockey rejects invitation, can owner create a new assignment for the same horse + race?
- If assignment is cancelled, does the unique `horse_id + race_id` backend rule allow replacement?
- Does the contract need owner signature before sending, or is it a draft contract for jockey review?
- Should jockey acceptance mean final assignment immediately, or should there still be a separate contract confirmation step after acceptance?
