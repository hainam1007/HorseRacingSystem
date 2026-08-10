# Referee Penalty Decision Flow

## Scope

This document covers the revised referee workflow for:

```text
pre-race inspection -> live incident -> penalty proposal -> post-race inspection
-> official report -> result finalization -> admin review
```

The backend owns policy and final enforcement. The referee owns the incident
assessment and may accept or adjust the suggested sanction within policy bounds.

## Backend Verification

Run:

```text
npm test
```

Result on 2026-07-27:

```text
120 tests passed
0 failed
```

New decision tests cover:

```text
policy snapshot on violation creation
legacy auto-confirm flags are ignored
during-race checks never auto-confirm linked violations
exact policy match without deviation reason
changed penalty requires deviation reason
in-bounds referee adjustment confirms
out-of-bounds proposal moves to admin review
sensitive violation always moves to admin review
admin override requires deviation reason
admin approves an existing referee proposal
```

## Frontend Verification

Run:

```text
npm run build
```

Result:

```text
1874 modules transformed
production build passed
```

The available browser runtime was not connected, so automated screenshot
verification could not be performed in this run.

## API Cases

### 1. Load Policy Options

```text
GET /api/violations/options
Authorization: Bearer <referee-or-admin-token>
```

Relevant output:

```json
{
  "penalty_policies": [
    {
      "policy_version": "2026.2",
      "violation_type": "lane_violation",
      "severity": "major",
      "requires_review": false,
      "suggested_penalty": {
        "type": "time_penalty",
        "time_penalty_seconds": 3
      },
      "referee_adjustment": {
        "allowed": true,
        "primary_types": ["warning", "time_penalty"],
        "bounds": {
          "time_penalty_seconds": { "min": 1, "max": 5, "step": 1 }
        }
      }
    }
  ]
}
```

### 2. Record During-Race Incident

```text
POST /api/horse-checks/during-race
Authorization: Bearer <assigned-referee-token>
```

Input:

```json
{
  "race_id": "race_object_id",
  "horse_id": "horse_object_id",
  "jockey_id": "jockey_profile_id",
  "status": "incident_recorded",
  "event_type": "lane_violation",
  "severity": "major",
  "time_marker": "00:01:24",
  "description": "Runner crossed its line and impeded another runner.",
  "requires_violation": true
}
```

Output behavior:

```text
horse_check.status = incident_recorded
violation.status = recorded
violation.suggested_penalty is populated
violation.proposed_penalty is empty
violation.penalty is empty
auto_confirmed = false
```

### 3. Accept Policy Suggestion

```text
POST /api/violations/:id/confirm
```

Input:

```json
{
  "decision": "Confirmed after reviewing the race video."
}
```

Output behavior:

```text
status = confirmed
proposed_penalty = suggested_penalty
penalty = proposed_penalty
deviates_from_policy = false
requires_admin_review = false
```

### 4. Submit In-Bounds Adjustment

Input:

```json
{
  "decision": "A reduced sanction is appropriate after multi-angle review.",
  "penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 2
  },
  "deviation_reason": "The runner was partially forced outward by another horse."
}
```

Output behavior:

```text
status = confirmed
suggested_penalty.time_penalty_seconds = 3
proposed_penalty.time_penalty_seconds = 2
penalty.time_penalty_seconds = 2
deviates_from_policy = true
decision_scope = referee_adjustment
```

### 5. Submit Out-of-Bounds Proposal

Input:

```json
{
  "decision": "Request stronger sanction after repeated incidents.",
  "penalty": {
    "type": "time_penalty",
    "time_penalty_seconds": 9
  },
  "deviation_reason": "Multiple dangerous lane changes were observed."
}
```

Output behavior:

```text
status = under_review
proposed_penalty.time_penalty_seconds = 9
penalty = null
requires_admin_review = true
```

### 6. Admin Approves Referee Proposal

```text
POST /api/violations/:id/confirm
Authorization: Bearer <admin-token>
```

Input:

```json
{
  "decision": "Referee proposal approved after steward review."
}
```

Output behavior:

```text
status = confirmed
penalty = saved proposed_penalty
decision_scope = admin_approval
```

### 7. Admin Overrides Proposal

Input:

```json
{
  "decision": "Final sanction modified after full evidence review.",
  "penalty": {
    "type": "position_demotion",
    "position_delta": 2
  },
  "deviation_reason": "The incident materially affected two finishing positions."
}
```

Output behavior:

```text
status = confirmed
penalty = admin penalty
deviates_from_policy = true
decision_scope = admin_override
```

## UI Acceptance Checklist

```text
Pre/post check displays a compact runner list and one selected checklist.
Passed/normal cannot be saved with an incomplete checklist.
Failed/scratched/injury statuses require a runner-specific note.
Bulk mark-all requires confirmation.
During-race incident recording does not apply a penalty automatically.
Primary sanctions use a single-choice control.
Suspension and fine use independent checkboxes and numeric steppers.
Policy deviation reason appears only when the proposal differs.
Out-of-bounds referee proposals display an Admin review warning.
Admin sees policy, referee proposal, and final decision in one review panel.
Closure is the canonical report and result workspace.
```
