const mongoose = require('mongoose');

const { Schema } = mongoose;

const roundSchema = new Schema(
  {
    tournament_id: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    round_order: {
      type: Number,
      required: true
    },
    description: String,
    status: {
      type: String,
      default: 'draft',
      trim: true
    }
  },
  {
    collection: 'rounds',
    versionKey: false
  }
);

roundSchema.index({ tournament_id: 1, round_order: 1 }, { unique: true });

module.exports = mongoose.model('Round', roundSchema);
