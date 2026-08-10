const {
  PENALTY_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_TYPE
} = require('./statuses');

const POLICY_VERSION = '2026.3';
const DECISION_SCOPE = Object.freeze({
  REFEREE_POLICY_MATCH: 'referee_policy_match',
  REFEREE_ADJUSTMENT: 'referee_adjustment',
  REFEREE_DISMISSAL: 'referee_dismissal',
  ADMIN_POLICY_MATCH: 'admin_policy_match',
  ADMIN_APPROVAL: 'admin_approval',
  ADMIN_OVERRIDE: 'admin_override',
  ADMIN_DISMISSAL: 'admin_dismissal'
});
const SEVERITY_BOUNDS = {
  [VIOLATION_SEVERITY.MINOR]: {
    time_penalty_seconds: { min: 1, max: 3, step: 1 },
    position_delta: { min: 1, max: 1, step: 1 },
    score_deduction: { min: 1, max: 5, step: 1 },
    suspension_days: { min: 1, max: 3, step: 1 },
    fine_amount: { min: 50, max: 500, step: 50 }
  },
  [VIOLATION_SEVERITY.MAJOR]: {
    time_penalty_seconds: { min: 1, max: 5, step: 1 },
    position_delta: { min: 1, max: 2, step: 1 },
    score_deduction: { min: 1, max: 10, step: 1 },
    suspension_days: { min: 1, max: 7, step: 1 },
    fine_amount: { min: 50, max: 1500, step: 50 }
  },
  [VIOLATION_SEVERITY.CRITICAL]: {
    time_penalty_seconds: { min: 1, max: 10, step: 1 },
    position_delta: { min: 1, max: 3, step: 1 },
    score_deduction: { min: 1, max: 20, step: 1 },
    suspension_days: { min: 1, max: 30, step: 1 },
    fine_amount: { min: 50, max: 5000, step: 50 }
  }
};

const REFEREE_PRIMARY_TYPES = Object.values(PENALTY_TYPE);

function warning(note) {
  return { type: PENALTY_TYPE.WARNING, note: note };
}

function demotion(positions, note) {
  return { type: PENALTY_TYPE.POSITION_DEMOTION, position_delta: positions, note: note };
}

function timePenalty(seconds, note) {
  return { type: PENALTY_TYPE.TIME_PENALTY, time_penalty_seconds: seconds, note: note };
}

function suspension(days, note) {
  return { type: PENALTY_TYPE.SUSPENSION, suspension_days: days, note: note };
}

function disqualification(suspensionDays, note) {
  return {
    type: PENALTY_TYPE.DISQUALIFICATION,
    disqualified: true,
    suspension_days: suspensionDays || 0,
    note: note
  };
}

const POLICY = {
  [VIOLATION_TYPE.DANGEROUS_RIDING]: {
    minor: warning('Official warning for dangerous riding'),
    major: demotion(2, 'Demoted two positions for dangerous riding'),
    critical: disqualification(7, 'Disqualified and suspended for critical dangerous riding')
  },
  [VIOLATION_TYPE.INTERFERENCE]: {
    minor: warning('Official warning for interference'),
    major: demotion(1, 'Demoted one position for interference'),
    critical: disqualification(0, 'Disqualified for critical interference')
  },
  [VIOLATION_TYPE.ILLEGAL_WHIP_USE]: {
    minor: warning('Official warning for illegal whip use'),
    major: suspension(3, 'Three-day suspension for illegal whip use'),
    critical: disqualification(7, 'Disqualified and suspended for critical illegal whip use')
  },
  [VIOLATION_TYPE.LANE_VIOLATION]: {
    minor: timePenalty(1, 'One-second lane violation penalty'),
    major: timePenalty(3, 'Three-second lane violation penalty'),
    critical: disqualification(0, 'Disqualified for critical lane violation')
  },
  [VIOLATION_TYPE.FALSE_START]: {
    minor: warning('Official warning for false start'),
    major: demotion(1, 'Demoted one position for false start'),
    critical: disqualification(0, 'Disqualified for critical or repeated false start')
  },
  [VIOLATION_TYPE.EQUIPMENT_VIOLATION]: {
    minor: warning('Equipment must be corrected before participation'),
    major: disqualification(0, 'Disqualified for major equipment violation'),
    critical: disqualification(0, 'Disqualified for critical equipment violation')
  },
  [VIOLATION_TYPE.HORSE_ABUSE]: {
    minor: warning('Horse welfare incident requires review'),
    major: disqualification(14, 'Proposed disqualification and 14-day suspension'),
    critical: disqualification(30, 'Proposed disqualification and 30-day suspension')
  },
  [VIOLATION_TYPE.DISOBEY_REFEREE]: {
    minor: warning('Official warning for disobeying referee instruction'),
    major: demotion(1, 'Demoted one position for disobeying referee instruction'),
    critical: disqualification(7, 'Disqualified and suspended for critical refusal')
  },
  [VIOLATION_TYPE.DOPING_SUSPECTED]: {
    minor: warning('Suspected doping requires laboratory review'),
    major: disqualification(30, 'Proposed disqualification pending laboratory confirmation'),
    critical: disqualification(30, 'Proposed disqualification and suspension after confirmation')
  },
  [VIOLATION_TYPE.TRACK_SAFETY_ISSUE]: {
    minor: warning('Track safety issue requires operational review'),
    major: warning('Race should be paused pending track safety review'),
    critical: warning('Race cancellation requires administrative review')
  },
  [VIOLATION_TYPE.OTHER]: {
    minor: warning('Unclassified incident requires review'),
    major: warning('Unclassified major incident requires review'),
    critical: warning('Unclassified critical incident requires review')
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAdjustmentBounds(primaryTypes, severity) {
  const severityBounds = SEVERITY_BOUNDS[severity];
  const fields = new Set();

  if (primaryTypes.includes(PENALTY_TYPE.TIME_PENALTY)) fields.add('time_penalty_seconds');
  if (primaryTypes.includes(PENALTY_TYPE.POSITION_DEMOTION)) fields.add('position_delta');
  if (primaryTypes.includes(PENALTY_TYPE.SCORE_DEDUCTION)) fields.add('score_deduction');
  if (primaryTypes.includes(PENALTY_TYPE.SUSPENSION)) fields.add('suspension_days');
  if (primaryTypes.includes(PENALTY_TYPE.FINE)) fields.add('fine_amount');
  fields.add('suspension_days');
  fields.add('fine_amount');

  return Array.from(fields).reduce(function(bounds, field) {
    bounds[field] = clone(severityBounds[field]);
    return bounds;
  }, {});
}

function buildRefereeAdjustment(severity, suggestedPenalty) {
  const bounds = getAdjustmentBounds(REFEREE_PRIMARY_TYPES, severity);

  ['score_deduction', 'position_delta', 'time_penalty_seconds', 'suspension_days', 'fine_amount']
    .forEach(function(field) {
      const suggestedValue = Number(suggestedPenalty[field] || 0);

      if (suggestedValue > 0 && bounds[field] && suggestedValue > bounds[field].max) {
        bounds[field].max = suggestedValue;
      }
    });

  return {
    allowed: true,
    primary_types: clone(REFEREE_PRIMARY_TYPES),
    bounds: bounds
  };
}

function getViolationPenaltyPolicy(violationType, severity) {
  const severityPolicy = POLICY[violationType];
  const normalizedSeverity = severity || VIOLATION_SEVERITY.MINOR;

  if (!severityPolicy || !severityPolicy[normalizedSeverity]) {
    return null;
  }

  const suggestedPenalty = clone(severityPolicy[normalizedSeverity]);

  return {
    policy_version: POLICY_VERSION,
    violation_type: violationType,
    severity: normalizedSeverity,
    requires_review: false,
    suggested_penalty: suggestedPenalty,
    referee_adjustment: buildRefereeAdjustment(normalizedSeverity, suggestedPenalty)
  };
}

function getAllViolationPenaltyPolicies() {
  return Object.values(VIOLATION_TYPE).flatMap(function(violationType) {
    return Object.values(VIOLATION_SEVERITY).map(function(severity) {
      return getViolationPenaltyPolicy(violationType, severity);
    });
  });
}

module.exports = {
  DECISION_SCOPE,
  POLICY_VERSION,
  getAllViolationPenaltyPolicies,
  getViolationPenaltyPolicy
};
