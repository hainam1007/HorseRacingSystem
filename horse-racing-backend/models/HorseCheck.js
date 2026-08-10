const mongoose = require('mongoose');

const { Schema } = mongoose;

const horseCheckSchema = new Schema(
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
      required: true,
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
    phase: {
      type: String,
      default: 'pre_race',
      trim: true,
      index: true
    },
    status: {
      type: String,
      default: 'passed',
      trim: true,
      index: true
    },
    checklist: {
      type: Schema.Types.Mixed,
      default: {}
    },
    issues: [
      {
        code: {
          type: String,
          trim: true
        },
        severity: {
          type: String,
          trim: true
        },
        note: String
      }
    ],
    event_type: {
      type: String,
      trim: true
    },
    severity: {
      type: String,
      trim: true
    },
    time_marker: {
      type: String,
      trim: true
    },
    description: String,
    evidence_urls: [String],
    requires_violation: {
      type: Boolean,
      default: false
    },
    auto_confirm_violation: {
      type: Boolean,
      default: false
    },
    linked_violation_id: {
      type: Schema.Types.ObjectId,
      ref: 'Violation'
    },
    health_status: {
      type: String,
      trim: true
    },
    weight: Number,
    check_note: String,
    is_eligible: {
      type: Boolean,
      default: true
    },
    checked_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: 'horse_checks',
    versionKey: false
  }
);

horseCheckSchema.index({ race_id: 1, horse_id: 1, phase: 1 });
horseCheckSchema.index({ referee_id: 1, race_id: 1, phase: 1 });
horseCheckSchema.index({ referee_id: 1, status: 1 });

module.exports = mongoose.model('HorseCheck', horseCheckSchema);
