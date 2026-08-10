const mongoose = require('mongoose');

const { Schema } = mongoose;

const raceRunParticipantSchema = new Schema(
  {
    horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      required: true
    },
    jockey_id: {
      type: Schema.Types.ObjectId,
      ref: 'Jockey',
      required: true
    },
    assignment_id: {
      type: Schema.Types.ObjectId,
      ref: 'JockeyAssignment'
    },
    lane: Number,
    seed_position: Number
  },
  {
    _id: false
  }
);

const raceRunFinishOrderSchema = new Schema(
  {
    horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      required: true
    },
    jockey_id: {
      type: Schema.Types.ObjectId,
      ref: 'Jockey',
      required: true
    },
    position: {
      type: Number,
      required: true
    },
    finish_time: {
      type: Number,
      required: true
    },
    score: Number
  },
  {
    _id: false
  }
);

const raceRunSchema = new Schema(
  {
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      default: 'generated',
      enum: ['generated', 'used', 'cancelled'],
      trim: true
    },
    generated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    generated_at: {
      type: Date,
      default: Date.now
    },
    seed: {
      type: String,
      trim: true
    },
    participants: [raceRunParticipantSchema],
    finish_order: [raceRunFinishOrderSchema]
  },
  {
    collection: 'race_runs',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('RaceRun', raceRunSchema);
