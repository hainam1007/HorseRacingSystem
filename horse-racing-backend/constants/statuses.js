const ASSIGNMENT_STATUS = {
  MEETING_INVITED: 'meeting_invited',
  MEETING_ACCEPTED: 'meeting_accepted',
  MEETING_REJECTED: 'meeting_rejected',
  TERMS_PENDING_CONFIRMATION: 'terms_pending_confirmation',
  STANDBY_TERMS_PENDING_CONFIRMATION: 'standby_terms_pending_confirmation',
  STANDBY_CONFIRMED: 'standby_confirmed',
  TERMS_AGREED: 'terms_agreed',
  TERMS_REJECTED: 'terms_rejected',
  CONTRACT_UPLOADED: 'contract_uploaded',
  CONTRACT_REJECTED: 'contract_rejected',
  ACCEPTED: 'accepted',
  PENDING: 'meeting_invited',
  REJECTED: 'meeting_rejected',
  CANCELLED: 'cancelled',
  REPLACED: 'replaced'
};

const ASSIGNMENT_TYPE = {
  PRIMARY: 'primary',
  BACKUP: 'backup'
};

const ASSIGNMENT_CANCELLATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const ASSIGNMENT_CANCELLATION_PARTY = {
  HORSE_OWNER: 'horse_owner',
  JOCKEY: 'jockey'
};

const REGISTRATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

const CANCELLATION_TICKET_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const REFUND_STATUS = {
  NOT_REQUIRED: 'not_required',
  AWAITING_APPROVAL: 'awaiting_approval',
  PENDING: 'pending',
  AWAITING_OWNER_CONFIRMATION: 'awaiting_owner_confirmation',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const RACE_RESULT_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PUBLISHED: 'published'
};

const SOFT_DELETE_STATUS = 'deleted';

const HORSE_CHECK_PHASE = {
  PRE_RACE: 'pre_race',
  DURING_RACE: 'during_race',
  POST_RACE: 'post_race'
};

const HORSE_CHECK_STATUS = {
  PASSED: 'passed',
  FAILED: 'failed',
  NEEDS_REVIEW: 'needs_review',
  SCRATCHED: 'scratched',
  NORMAL: 'normal',
  INCIDENT_RECORDED: 'incident_recorded',
  RACE_STOPPED: 'race_stopped',
  MINOR_ISSUE: 'minor_issue',
  INJURY_DETECTED: 'injury_detected',
  REQUIRES_VET_FOLLOW_UP: 'requires_vet_follow_up',
  UNDER_INVESTIGATION: 'under_investigation'
};

const VIOLATION_TYPE = {
  DANGEROUS_RIDING: 'dangerous_riding',
  INTERFERENCE: 'interference',
  ILLEGAL_WHIP_USE: 'illegal_whip_use',
  LANE_VIOLATION: 'lane_violation',
  FALSE_START: 'false_start',
  EQUIPMENT_VIOLATION: 'equipment_violation',
  HORSE_ABUSE: 'horse_abuse',
  DISOBEY_REFEREE: 'disobey_referee',
  DOPING_SUSPECTED: 'doping_suspected',
  TRACK_SAFETY_ISSUE: 'track_safety_issue',
  OTHER: 'other'
};

const VIOLATION_SEVERITY = {
  MINOR: 'minor',
  MAJOR: 'major',
  CRITICAL: 'critical'
};

const VIOLATION_STATUS = {
  RECORDED: 'recorded',
  UNDER_REVIEW: 'under_review',
  CONFIRMED: 'confirmed',
  DISMISSED: 'dismissed',
  RESOLVED: 'resolved'
};

const PENALTY_TYPE = {
  WARNING: 'warning',
  SCORE_DEDUCTION: 'score_deduction',
  TIME_PENALTY: 'time_penalty',
  POSITION_DEMOTION: 'position_demotion',
  DISQUALIFICATION: 'disqualification',
  SUSPENSION: 'suspension',
  FINE: 'fine'
};

const PRIZE_AWARD_STATUS = {
  CALCULATED: 'calculated',
  APPROVED: 'approved',
  PAID: 'paid',
  CANCELLED: 'cancelled'
};

const ODDS_MARKET_STATUS = {
  GENERATED: 'generated',
  STALE: 'stale',
  OPEN: 'open',
  CLOSED: 'closed',
  SETTLED: 'settled'
};

const BET_STATUS = {
  PENDING: 'pending',
  WON: 'won',
  LOST: 'lost',
  CANCELLED: 'cancelled'
};

module.exports = {
  ASSIGNMENT_STATUS,
  ASSIGNMENT_TYPE,
  ASSIGNMENT_CANCELLATION_STATUS,
  ASSIGNMENT_CANCELLATION_PARTY,
  REGISTRATION_STATUS,
  CANCELLATION_TICKET_STATUS,
  REFUND_STATUS,
  RACE_RESULT_STATUS,
  HORSE_CHECK_PHASE,
  HORSE_CHECK_STATUS,
  VIOLATION_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS,
  PENALTY_TYPE,
  BET_STATUS,
  ODDS_MARKET_STATUS,
  PRIZE_AWARD_STATUS,
  SOFT_DELETE_STATUS
};
