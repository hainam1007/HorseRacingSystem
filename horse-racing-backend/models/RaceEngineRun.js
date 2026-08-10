const mongoose = require('mongoose');

const { Schema } = mongoose;

const raceEngineRunSchema = new Schema(
  {
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      unique: true
    },
    engine_run_id: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    status: {
      type: String,
      required: true,
      trim: true
    },
    started_at: Date,
    completed_at: Date,
    error: String
  },
  {
    collection: 'race_engine_runs',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('RaceEngineRun', raceEngineRunSchema);
