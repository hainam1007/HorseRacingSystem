const mongoose = require('mongoose');

const { Schema } = mongoose;

const raceResultSchema = new Schema(
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
      required: true,
      index: true
    },
    position: Number,
    finish_time: Number,
    score: Number,
    raw_position: Number,
    raw_finish_time: Number,
    raw_score: Number,
    final_position: Number,
    final_finish_time: Number,
    final_score: Number,
    applied_violation_ids: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Violation'
      }
    ],
    penalty_snapshot_violation_ids: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Violation'
      }
    ],
    penalties_applied_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    penalties_applied_at: Date,
    submitted_to_admin_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    submitted_to_admin_at: {
      type: Date,
      index: true
    },
    status: {
      type: String,
      default: 'draft',
      trim: true
    },
    note: String,
    correction_requested: {
      type: Boolean,
      default: false,
      index: true
    },
    correction_note: String,
    correction_requested_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    correction_requested_at: Date,
    correction_resolved_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    correction_resolved_at: Date,
    recorded_by: {
      type: Schema.Types.ObjectId,
      ref: 'RaceReferee',
      index: true
    },
    recorded_at: Date,
    confirmed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    confirmed_at: Date,
    published_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    published_at: Date
  },
  {
    collection: 'race_results',
    versionKey: false
  }
);

raceResultSchema.index({ race_id: 1, horse_id: 1 }, { unique: true });
raceResultSchema.index({ race_id: 1, status: 1 });
raceResultSchema.index({ recorded_by: 1, status: 1 });
raceResultSchema.index({ submitted_to_admin_at: 1, status: 1 });

module.exports = mongoose.model('RaceResult', raceResultSchema);
