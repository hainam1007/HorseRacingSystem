const mongoose = require('mongoose');

const { Schema } = mongoose;

const horseRatingHistorySchema = new Schema(
  {
    horse_id: { type: Schema.Types.ObjectId, ref: 'Horse', required: true, index: true },
    race_id: { type: Schema.Types.ObjectId, ref: 'Race', index: true },
    previous_rating: { type: Number, required: true },
    rating_delta: { type: Number, required: true },
    new_rating: { type: Number, required: true },
    expected_score: Number,
    actual_score: Number,
    raw_position: Number,
    participant_count: Number,
    calculation_version: { type: String, default: 'pairwise_elo_v1', trim: true },
    source: {
      type: String,
      enum: ['published_result', 'manual_admin', 'migration'],
      required: true,
      index: true
    },
    reason: String,
    calculated_by: { type: Schema.Types.ObjectId, ref: 'User' },
    calculated_at: { type: Date, default: Date.now }
  },
  {
    collection: 'horse_rating_history',
    versionKey: false
  }
);

horseRatingHistorySchema.index(
  { race_id: 1, horse_id: 1 },
  { unique: true, partialFilterExpression: { race_id: { $type: 'objectId' }, source: 'published_result' } }
);

module.exports = mongoose.model('HorseRatingHistory', horseRatingHistorySchema);
