const mongoose = require('mongoose');
const {
  PENALTY_TYPE,
  VIOLATION_SEVERITY,
  VIOLATION_STATUS,
  VIOLATION_TYPE
} = require('../constants/statuses');
const { DECISION_SCOPE } = require('../constants/violationPenaltyPolicy');

const { Schema } = mongoose;

const penaltySchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(PENALTY_TYPE),
      trim: true
    },
    score_deduction: {
      type: Number,
      default: 0,
      min: 0
    },
    position_delta: {
      type: Number,
      default: 0,
      min: 0
    },
    time_penalty_seconds: {
      type: Number,
      default: 0,
      min: 0
    },
    suspension_days: {
      type: Number,
      default: 0,
      min: 0
    },
    fine_amount: {
      type: Number,
      default: 0,
      min: 0
    },
    disqualified: {
      type: Boolean,
      default: false
    },
    note: String
  },
  {
    _id: false
  }
);

const violationSchema = new Schema(
  {
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      index: true
    },
    horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      index: true
    },
    jockey_id: {
      type: Schema.Types.ObjectId,
      ref: 'Jockey',
      index: true
    },
    referee_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceReferee',
      required: true,
      index: true
    },
    horse_check_id: {
      type: Schema.Types.ObjectId,
      ref: 'HorseCheck',
      index: true
    },
    violation_type: {
      type: String,
      required: true,
      enum: Object.values(VIOLATION_TYPE),
      trim: true
    },
    description: String,
    severity: {
      type: String,
      enum: Object.values(VIOLATION_SEVERITY),
      default: VIOLATION_SEVERITY.MINOR,
      trim: true
    },
    time_marker: {
      type: String,
      trim: true
    },
    evidence_urls: [String],
    evidence_files: [
      {
        url: String,
        public_id: String,
        type: {
          type: String,
          trim: true
        },
        file_name: {
          type: String,
          trim: true
        }
      }
    ],
    decision: {
      type: String,
      trim: true
    },
    suggested_penalty: penaltySchema,
    proposed_penalty: penaltySchema,
    penalty: penaltySchema,
    deviates_from_policy: {
      type: Boolean,
      default: false
    },
    deviation_reason: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    decision_scope: {
      type: String,
      enum: Object.values(DECISION_SCOPE)
    },
    proposed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    proposed_at: Date,
    status: {
      type: String,
      enum: Object.values(VIOLATION_STATUS),
      default: VIOLATION_STATUS.RECORDED,
      trim: true
    },
    decided_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    decided_at: Date,
    penalty_source: {
      type: String,
      enum: [
        'auto_policy',
        'policy_confirm',
        'referee_adjustment',
        'manual_admin'
      ]
    },
    policy_version: String,
    discipline_applied_at: Date,
    discipline_applied_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'violations',
    versionKey: false
  }
);

violationSchema.index({ referee_id: 1, race_id: 1, status: 1 });
violationSchema.index({ race_id: 1, status: 1 });

module.exports = mongoose.model('Violation', violationSchema);
